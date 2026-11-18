# PDF → Audiobook (iPhone web app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home-screen web app for iPhone that imports text PDFs, cleans and splits the text, converts it to pt-BR MP3 with Google Cloud TTS without ever exceeding the free tier, stores audio on the device, and plays it with resume.

**Architecture:** Static React SPA (no backend) deployed to GitHub Pages as a PWA. Pure, unit-tested modules for text processing (clean → split → chunk), quota and conversion; thin adapters for pdf.js, IndexedDB, Google TTS and the `<audio>` element; four screens on top.

**Tech Stack:** React 18.3.1, Vite 5.4.11, Vitest 2.1.8 + Testing Library + jsdom 25.0.1, pdfjs-dist 4.10.38, idb 8.0.0, vite-plugin-pwa 0.21.1; dev-only: fake-indexeddb 6.0.0, pdf-lib 1.17.1 (test fixtures).

**Spec:** `docs/superpowers/specs/2026-11-18-pdf-audiobook-design.md`

**Repo root:** `C:\Users\enrique.eazs\.copilot\pdf-audiobook` (all paths below are relative to it).

## Global Constraints

- Platform: iPhone Safari home-screen PWA; no native code, no backend, no Mac tooling.
- UI copy in Portuguese (Brazil); large touch targets (min 48 px) for use in a car mount.
- TTS: `POST https://texttospeech.googleapis.com/v1/text:synthesize?key=<apiKey>`, `audioConfig.audioEncoding: "MP3"`, `languageCode: "pt-BR"`.
- Max 5,000 bytes (UTF-8) of input per TTS request.
- Never pay: before each request, `used + chunkChars <= limit × 0.95` for the current calendar month and tier, else pause the book until next month.
- Failed requests Google may have billed (anything except 400/401/403 and network errors before a response) count as used.
- API key lives only on the device (IndexedDB settings); never committed, never logged.
- Original PDF is not stored; cleaned chapter text is stored permanently.
- No OCR, no other input formats, no accounts, no sync.
- Exact dependency versions as in Tech Stack (pinned, no `^`).

## Review Focus

1. A "sentence" longer than 5,000 bytes (no punctuation, or accented text where bytes ≠ chars) — must still be split under the byte limit at word boundaries, never mid-character. Test in Task 3.
2. App closed mid-conversion and reopened (possibly in a new month) — already stored chunks are never re-sent; usage is not counted twice; a paused book resumes after month rollover. Tests in Task 6.
3. A PDF with no extractable text (scanned file slipped in) or a password-protected PDF — clear Portuguese error, no empty book created. Test in Task 4 / Task 7.
4. Outline entries that are nested, out of order, point to the same page, or start after page 1 — sorted, deduped, top level only, leading pages become "Início". Test in Task 3.
5. Playback end of last chapter and app killed while playing — stops (no loop) at the end; position restored within 5 s on reopen. Tests in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/pdf/extract.js` | pdf.js adapter: PDF bytes → pages of positioned text items + outline |
| `src/text/clean.js` | pages → cleaned text per page (lines, columns, headers/footers, footnotes, hyphens, URLs) |
| `src/text/split.js` | cleaned pages + outline → chapters |
| `src/text/chunk.js` | chapter text → ≤ 5,000-byte chunks |
| `src/tts/voices.js` | voice list, tiers, free-tier limits |
| `src/tts/google.js` | Google TTS REST client |
| `src/quota/quota.js` | month keys, guard check, next-month date |
| `src/store/db.js` | IndexedDB schema and data access |
| `src/audio/concat.js` | concatenate MP3 blobs |
| `src/convert/converter.js` | conversion loop: guard → synthesize → persist → assemble |
| `src/import/importBook.js` | PDF file → import draft → stored book |
| `src/export/share.js` | export a chapter MP3 via share sheet / download |
| `src/ui/*.jsx`, `src/ui/usePlayer.js` | screens and playback hook |
| `src/App.jsx`, `src/main.jsx`, `src/index.css` | shell, routing by state, styles |

---

### Task 1: Project scaffold, PWA shell and test setup

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `src/test/setup.js`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `.gitignore`
- Test: `src/App.test.jsx`

**Interfaces:**
- Produces: `App` default export rendering the library title "Meus Audiobooks"; `npm test` runs Vitest with jsdom and `fake-indexeddb/auto` loaded in `src/test/setup.js`.

- [ ] **Step 1:** `git init` in the repo root; `.gitignore` with `node_modules`, `dist`, `.env*`.
- [ ] **Step 2:** Create `package.json` (scripts `dev`, `build`, `preview`, `test: vitest run`) with the pinned versions from Tech Stack; `npm install`.
- [ ] **Step 3:** `vite.config.js`: `base: '/pdf-audiobook/'`, react plugin, `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Audiobooks', short_name: 'Audiobooks', lang: 'pt-BR', display: 'standalone', start_url: '.', theme_color, background_color, icons } })`, `test: { environment: 'jsdom', setupFiles: 'src/test/setup.js' }`. `index.html`: `lang="pt-BR"`, viewport, `apple-mobile-web-app-capable`, apple-touch-icon link. Icons: simple generated PNGs (book/headphones glyph).
- [ ] **Step 4: Write the failing test**

```jsx
test('shows the library title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Meus Audiobooks' })).toBeInTheDocument()
})
```

- [ ] **Step 5:** Run `npm test` → FAIL (App missing). Implement minimal `App`. Run → PASS. `npm run build` → succeeds and `dist/` contains `manifest.webmanifest` and `sw.js`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: scaffold PWA project"` (include the spec and plan docs in this first commit).

---

### Task 2: Text cleaning

**Files:**
- Create: `src/text/clean.js`
- Test: `src/text/clean.test.js`

**Interfaces:**
- Consumes: `Page` shape (defined here, produced by Task 4):
  `{ pageIndex: number, width: number, height: number, items: Array<{ str: string, x: number, y: number, width: number, fontSize: number }> }` — `y` measured from the page bottom (pdf.js convention).
- Produces: `cleanPages(pages: Page[]): string[]` — one cleaned string per page (paragraphs separated by `\n\n`), same length/order as input.

- [ ] **Step 1: Write failing tests** (build pages with a local `item(str, x, y, fontSize=10)` helper):

```js
test('groups items on the same y into one line, top to bottom', ...)
  // items 'Olá' (x10,y700) + 'mundo' (x40,y700) + 'Fim.' (x10,y680) → 'Olá mundo\nFim.' joined into paragraph 'Olá mundo Fim.'
test('drops lines repeated at top or bottom of most pages', ...)
  // 4 pages each with 'MEU LIVRO' at y=780 and body text → no output contains 'MEU LIVRO'
test('drops page-number-only lines', ...)
  // '12', '- 12 -', 'Página 12' at y=30 → removed
test('joins hyphenated line breaks', ...)
  // 'exem-' / 'plo de texto' → 'exemplo de texto'
test('reads two columns left then right', ...)
  // width 600; left items x≈50, right items x≈320, interleaved y → all left text before right text
test('drops small-font footnote lines at page bottom and superscript markers', ...)
  // body fontSize 10; '1 Ver capítulo 2' fontSize 7 at y=60 → removed; body 'texto¹' or marker item fontSize 6 '1' raised → 'texto'
test('replaces URLs with the word link', ...)
  // 'veja https://ex.com/a?b=1 agora' → 'veja link agora'
test('keeps paragraph breaks on large vertical gaps', ...)
  // gap > 1.5× line height → '\n\n' between paragraphs
```

- [ ] **Step 2:** Run `npx vitest run src/text/clean.test.js` → FAIL.
- [ ] **Step 3:** Implement `cleanPages`. Approach (thresholds are the builder's to tune):
  - Body font size = most common `fontSize` on the page.
  - Columns: if no item crosses `width/2` and both halves hold ≥ 30 % of characters, process left half then right half.
  - Lines: group items whose `y` differ < 0.5 × fontSize; sort by y desc, x asc; join with a space when the x-gap > 0.2 × fontSize.
  - Headers/footers: normalize line text (digits → `#`, trim, lowercase); a normalized line that appears in the top 2 or bottom 2 lines of ≥ 50 % of pages (min 3 pages) is dropped everywhere it occurs in those positions.
  - Page numbers: drop lines matching `/^(p(á|a)g(ina)?\.?\s*)?[-–\s]*\d+[-–\s]*$/i`.
  - Footnotes: drop lines in the bottom 25 % of the page with `fontSize ≤ 0.8 × body`; drop items with `fontSize ≤ 0.7 × body` that are only digits (markers); strip `¹²³…` superscript characters.
  - Then dehyphenate (`/(\p{L})-\n(\p{Ll})/gu` → `$1$2`), URLs → `link`, join lines into paragraphs, collapse whitespace.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: clean extracted PDF text`.

---

### Task 3: Chapter splitting and TTS chunking

**Files:**
- Create: `src/text/split.js`, `src/text/chunk.js`
- Test: `src/text/split.test.js`, `src/text/chunk.test.js`

**Interfaces:**
- Consumes: `cleanPages` output (`string[]`).
- Produces:
  - `TARGET_PART_CHARS = 9000`
  - `splitChapters(pageTexts: string[], outline: Array<{ title: string, pageIndex: number }>): Array<{ title: string, text: string }>`
  - `MAX_CHUNK_BYTES = 5000`
  - `chunkText(text: string, maxBytes = MAX_CHUNK_BYTES): string[]`
  - `countChars(text: string): number` — Unicode code points (`[...text].length`), the unit used for quota.

- [ ] **Step 1: Write failing tests**

```js
// split
test('one chapter per outline entry, by page', ...)
  // pages ['a','b','c','d'], outline [{title:'Um',pageIndex:0},{title:'Dois',pageIndex:2}] → [{title:'Um',text:'a\n\nb'},{title:'Dois',text:'c\n\nd'}]
test('pages before the first outline entry become "Início"', ...)
test('sorts entries and merges entries pointing to the same page', ...)
  // [{T:'B',p:2},{T:'A',p:0},{T:'B2',p:2}] → titles ['A','B']  (first title wins)
test('skips chapters with empty text', ...)
test('without outline, splits into parts of ~9000 chars at paragraph boundaries titled "Parte N"', ...)
  // 30 paragraphs of 1000 chars → 4 parts; every part ≤ 9000 + one paragraph; titles 'Parte 1'..'Parte 4'
// chunk
test('every chunk is ≤ maxBytes in UTF-8', ...)
  // 20000 chars of 'ação é ' repeated → all new TextEncoder().encode(c).length <= 5000
test('splits at sentence boundaries when possible', ...)
  // chunks end with '.', '!', '?' or '…' except possibly the last
test('a single sentence longer than the limit is split at word boundaries', ...)
  // 'palavra ' × 1500, no punctuation → all ≤ 5000 bytes, no chunk starts/ends mid-word
test('joining chunks with a space reproduces the text (modulo whitespace)', ...)
test('countChars counts code points', ...)  // countChars('ação😀') === 5
```

- [ ] **Step 2:** Run both test files → FAIL.
- [ ] **Step 3:** Implement. `splitChapters` uses only top-level outline entries (Task 4 already flattens to top level). `chunkText`: split into sentences with `Intl.Segmenter('pt-BR', { granularity: 'sentence' })`; greedily pack; an over-long sentence is packed word by word (`granularity: 'word'`); a single word over the limit (pathological) is cut by code points.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: split chapters and chunk text for TTS`.

---

### Task 4: PDF extraction adapter

**Files:**
- Create: `src/pdf/extract.js`, `src/test/makePdf.js` (pdf-lib fixture builder)
- Test: `src/pdf/extract.test.js`

**Interfaces:**
- Produces:
  - `extractPdf(data: ArrayBuffer): Promise<{ title: string | null, pages: Page[], outline: Array<{ title: string, pageIndex: number }> }>` — `Page` as in Task 2; `outline` = top-level entries only, resolved to 0-based page indices, unresolvable entries dropped.
  - `class PdfError extends Error { code: 'NO_TEXT' | 'ENCRYPTED' | 'INVALID' }`
- pdf.js import: `pdfjs-dist/legacy/build/pdf.mjs` under Vitest; `pdfjs-dist` with `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href` in the browser (branch on `import.meta.env.MODE === 'test'` or inject the lib).

- [ ] **Step 1: Write failing tests** (fixtures generated in-test with pdf-lib):

```js
test('returns positioned items per page', ...)
  // 2-page PDF, 'Primeira página' at (50,700) size 12 → pages[0].items[0] matches {str:'Primeira página', x≈50, y≈700, fontSize≈12}; pages.length === 2
test('returns metadata title', ...)          // pdf-lib setTitle('Meu Livro') → title 'Meu Livro'
test('throws NO_TEXT when no page has text', ...)   // blank pages → rejects PdfError code 'NO_TEXT'
test('throws INVALID for non-PDF bytes', ...)
test('throws ENCRYPTED for a password-protected PDF', ...)  // pdf.js getDocument rejecting with PasswordException (stub) → code 'ENCRYPTED'
test('maps outline destinations to page indices', ...)
  // stub a pdf.js document: getOutline() → [{title:'A',dest:[ref0]},{title:'B',dest:'named', items:[...]}], getDestination('named') → [ref2], getPageIndex(ref) → index → [{A,0},{B,2}] (nested items ignored)
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `extractPdf`. Item `x = transform[4]`, `y = transform[5]`, `fontSize = Math.hypot(transform[2], transform[3])`; skip empty `str`. Map pdf.js `PasswordException` → `ENCRYPTED`, `InvalidPDFException` → `INVALID`. Put the outline mapping in an exported `resolveOutline(doc)` so it can be tested with a stub.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: extract positioned text and outline from PDF`.

---

### Task 5: Storage layer

**Files:**
- Create: `src/store/db.js`
- Test: `src/store/db.test.js`

**Interfaces:**
- Produces (all async; DB name `audiobooks`, version 1; stores per spec §7 Data model):
  - Types:
    - `Book = { id: string, title: string, createdAt: number, voiceName: string, status: 'converting'|'paused-quota'|'error'|'ready'|'audio-missing', pausedUntil?: string /* YYYY-MM-DD */, errorMessage?: string, chapters: Array<{ id: string, title: string, textLength: number, status: 'pending'|'ready', durationSec?: number }>, position: { chapterId: string, timeSec: number }, speed: number }`
    - `Chunk = { bookId, chapterId, index: number, text: string, status: 'pending'|'done', mp3?: Blob }`
  - `openDb()`, `requestPersistence(): Promise<boolean>` (wraps `navigator.storage.persist`, false if unsupported)
  - `saveBook(book)`, `getBook(id)`, `listBooks(): Book[]` (newest first), `deleteBook(id)` (removes book + its chunks, chapterAudio, chapterText)
  - `saveChapterText(bookId, chapterId, text)`, `getChapterText(bookId, chapterId)`
  - `saveChunks(chunks: Chunk[])`, `getChunks(bookId, chapterId): Chunk[]` (ordered by index), `markChunkDone(bookId, chapterId, index, mp3: Blob)`, `deleteChunks(bookId, chapterId)`
  - `saveChapterAudio(bookId, chapterId, mp3: Blob)`, `getChapterAudio(bookId, chapterId): Blob | undefined`, `deleteAudio(bookId)`
  - `getUsage(month: string, tier: string): number`, `addUsage(month, tier, chars): number` (returns new total)
  - `getSettings(): { apiKey: string, voiceName: string, defaultSpeed: number }` (defaults `''`, `DEFAULT_VOICE` from Task 6 voices, `1`), `saveSettings(partial)`
  - `bookStorageBytes(bookId): number` (sum of blob sizes)

- [ ] **Step 1: Write failing tests** (fake-indexeddb, reset DB in `beforeEach`):

```js
test('saves and lists books newest first', ...)
test('deleteBook removes chunks, audio and text', ...)
test('getChunks returns chunks ordered by index', ...)
test('markChunkDone stores the blob and status done', ...)
test('addUsage accumulates per month and tier', ...)
  // addUsage('2026-11','neural2',100); addUsage('2026-11','neural2',50) → 150; getUsage('2026-12','neural2') → 0
test('getSettings returns defaults when empty', ...)
test('deleteAudio keeps chapter text', ...)
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with `idb`; compound keys `[bookId, chapterId, index]` / `[bookId, chapterId]` / `[month, tier]`. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: IndexedDB storage layer`.

---

### Task 6: Quota guard, TTS client, MP3 concat and conversion loop

**Files:**
- Create: `src/tts/voices.js`, `src/tts/google.js`, `src/quota/quota.js`, `src/audio/concat.js`, `src/convert/converter.js`
- Test: `src/quota/quota.test.js`, `src/tts/google.test.js`, `src/convert/converter.test.js`

**Interfaces:**
- Consumes: Task 3 `countChars`; Task 5 store functions.
- Produces:
  - `voices.js`: `VOICES: Array<{ name: string, label: string, gender: 'F'|'M', tier: 'standard'|'wavenet'|'neural2' }>` (pt-BR only), `FREE_TIER_CHARS: Record<tier, number>`, `DEFAULT_VOICE: string`, `tierOf(voiceName): tier`. **Before writing, verify voice names and free-tier limits on Google's current docs/pricing page**; put the source URL and date in a comment. Default to a Neural2 female voice if Neural2 pt-BR exists, else WaveNet.
  - `google.js`: `synthesize({ text, voiceName, apiKey, fetchImpl = fetch }): Promise<Blob /* audio/mpeg */>`; `class TtsError extends Error { kind: 'auth'|'bad-request'|'quota'|'retryable'|'network', status?: number, billable: boolean }`. Mapping: 400 → bad-request (billable false); 401/403 → auth (false); 429 → retryable (false); 5xx → retryable (true — Google may have processed it); fetch rejection → network (false). `testKey({ apiKey, fetchImpl })` = synthesize `"Teste."` with `DEFAULT_VOICE`.
  - `quota.js`: `SAFETY = 0.95`, `monthKey(date: Date): 'YYYY-MM'` (local time), `canSend(used, chunkChars, limit): boolean`, `nextMonthStart(date): 'YYYY-MM-DD'`.
  - `concat.js`: `concatMp3(blobs: Blob[]): Blob` (`new Blob(blobs, { type: 'audio/mpeg' })`).
  - `converter.js`: `convertBook(bookId: string, deps): Promise<'ready'|'paused-quota'|'error'|'aborted'>`, `deps = { store, synthesize, now: () => Date, sleep: (ms) => Promise, signal?: AbortSignal, onProgress?: ({ done, total }) => void }`. Also `estimateBookChars(chapters: Array<{text}>): number`.

- [ ] **Step 1: Write failing tests**

```js
// quota
test('canSend respects the 5% safety margin', ...)  // canSend(940_000, 10_000, 1_000_000) true; canSend(945_000, 10_000, 1_000_000) false
test('monthKey and nextMonthStart', ...)            // 2026-12-31 → '2026-12', '2027-01-01'
// google (fetchImpl mocked)
test('posts text, voice and MP3 encoding; decodes base64 audioContent to an audio/mpeg Blob', ...)
  // assert URL contains 'key=K', body.input.text, body.voice.languageCode 'pt-BR', body.voice.name, body.audioConfig.audioEncoding 'MP3'
test('maps HTTP errors to TtsError kinds and billable flags', ...)  // 400, 403, 429, 503, rejected fetch
// converter (fake-indexeddb store + fake synthesize returning Blob of the text)
test('converts all pending chunks, assembles chapter audio, deletes chunks, marks book ready', ...)
test('adds usage per chunk sent', ...)
test('pauses before exceeding the free tier and sets pausedUntil to next month', ...)
  // usage preset to limit×0.95 − 10, next chunk 20 chars → returns 'paused-quota', synthesize not called, book.pausedUntil === '2026-12-01' for now=2026-11-18
test('resumes a paused book in the next month without re-sending done chunks', ...)
test('a retryable error retries with backoff up to 3 times then sets status error', ...)
test('a billable failure still counts its chars as used', ...)       // 503 → usage increased
test('auth error stops immediately with a Portuguese message and no usage counted', ...)
test('abort signal stops after the current chunk', ...)
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `convertBook` loop per chapter in order, per pending chunk in index order: check `canSend(getUsage(month,tier), countChars(text), FREE_TIER_CHARS[tier])` → else save `status:'paused-quota', pausedUntil` and return; call `synthesize`; on success `addUsage` then `markChunkDone`; on `TtsError` add usage if `billable`; retry `retryable` with `sleep(1000 * 2**attempt)`, attempts 3. When all chunks of a chapter are done: `concatMp3` → `saveChapterAudio` → `deleteChunks` → chapter `status:'ready'`, `durationSec` from `Audio` metadata is computed later by the player (leave undefined here). Error messages (Portuguese) on `book.errorMessage`, e.g. auth: "Chave do Google inválida ou API Text-to-Speech não ativada."
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: free-tier-guarded TTS conversion`.

---

### Task 7: Import flow, Library and Import Review screens

**Files:**
- Create: `src/import/importBook.js`, `src/ui/Library.jsx`, `src/ui/ImportReview.jsx`, `src/ui/useConversion.js`
- Modify: `src/App.jsx`, `src/index.css`
- Test: `src/import/importBook.test.js`, `src/ui/Library.test.jsx`, `src/ui/ImportReview.test.jsx`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `buildDraft(file: File): Promise<{ title: string, chapters: Array<{ title: string, text: string, chars: number, selected: true }> }>` — `extractPdf` → `cleanPages` → `splitChapters`; title = PDF metadata title or filename without `.pdf`.
  - `createBook(draft, voiceName): Promise<Book>` — only `selected` chapters; saves book (`status:'converting'`, position at first chapter 0 s, speed from settings), chapter texts, and chunks (`chunkText`).
  - `useConversion()` hook: runs `convertBook` for books with `status` `converting`, or `paused-quota` whose `pausedUntil <= today`, or a newly created book; one at a time; holds a Screen Wake Lock (`navigator.wakeLock?.request('screen')`, ignore failures) while running; aborts on `visibilitychange` hidden and restarts on visible.
  - App state: `screen: 'library' | 'import' | 'player' | 'settings'` plus selected book id (no router).

- [ ] **Step 1: Write failing tests**

```js
test('buildDraft uses filename as title when metadata is empty', ...)       // 'apostila.pdf' → 'apostila'
test('buildDraft surfaces NO_TEXT as "Este PDF não tem texto selecionável."', ...)
test('createBook stores only selected chapters and their chunks', ...)
// Library
test('lists books with status text', ...)
  // converting 3/10 chunks → 'Convertendo... 30%'; ready with position chap 3 of 12 → 'Cap. 3 de 12'; paused → 'Pausado — cota do mês esgotada, continua em 01/12'
test('shows "+ Adicionar PDF" file input accepting application/pdf', ...)
test('asks for the API key first when settings have none', ...)  // banner linking to Settings
// ImportReview
test('shows chars, estimated minutes and share of the monthly free quota', ...)
  // 90,000 chars → '≈ 100 min' (900 chars/min) and 'usa 9% da cota grátis do mês' for a 1,000,000 limit with 0 used
test('unchecking a chapter updates the totals', ...)
test('warns when the book exceeds the remaining quota: "A conversão vai pausar e continuar no próximo mês"', ...)
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (layout per spec screens sketch; constant `CHARS_PER_MINUTE = 900`). **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: import PDFs and library screen`.

---

### Task 8: Player, Media Session and MP3 export

**Files:**
- Create: `src/ui/Player.jsx`, `src/ui/usePlayer.js`, `src/export/share.js`
- Modify: `src/App.jsx`, `src/index.css`
- Test: `src/ui/usePlayer.test.jsx`, `src/ui/Player.test.jsx`, `src/export/share.test.js`

**Interfaces:**
- Consumes: Task 5 `getBook`, `saveBook`, `getChapterAudio`.
- Produces:
  - `usePlayer(bookId)` → `{ book, chapter, playing, currentTime, duration, play(), pause(), seekBy(sec), goToChapter(id), setSpeed(rate) }`. Single `<audio>` element (module singleton) with object URL of the chapter blob (revoke the previous one); `preservesPitch = true`; speeds `[0.75, 1, 1.25, 1.5, 1.75, 2]`.
  - Position saved every 5 s while playing and on `pause`, `ended`, `visibilitychange`. On load, resumes at saved position.
  - `ended` → next ready chapter at 0 s; after the last chapter → stop, position stays at the end, no loop.
  - Media Session: metadata `{ title: chapter.title, artist: book.title }`; handlers `play`, `pause`, `seekbackward`/`seekforward` (30 s), `previoustrack`/`nexttrack`.
  - `exportChapter({ blob, filename }): Promise<'shared'|'downloaded'|'cancelled'>` — `navigator.canShare?.({ files:[file] })` → `navigator.share`; AbortError → `'cancelled'`; else `<a download>` fallback. Filename `"<Livro> - <NN> <Capítulo>.mp3"`, sanitized.

- [ ] **Step 1: Write failing tests** (stub `HTMLMediaElement.prototype.play/pause`, fake timers, fake `navigator.mediaSession`):

```js
test('resumes at the saved position', ...)
test('saves position every 5 seconds while playing', ...)
test('advances to the next chapter on ended and stops after the last', ...)
test('seekBy clamps to 0 and duration', ...)
test('sets playbackRate and persists speed on the book', ...)
test('registers media session handlers and metadata', ...)
test('chapters without audio are shown as "convertendo" and not playable', ...)  // Player
test('exportChapter uses share sheet when available, falls back to download', ...)
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: player with resume, media session and MP3 export`.

---

### Task 9: Settings screen

**Files:**
- Create: `src/ui/Settings.jsx`
- Modify: `src/App.jsx`, `src/ui/Library.jsx` (delete book / delete audio actions, storage per book)
- Test: `src/ui/Settings.test.jsx`

**Interfaces:**
- Consumes: Task 5 settings/usage/storage; Task 6 `testKey`, `VOICES`, `FREE_TIER_CHARS`, `monthKey`.

- [ ] **Step 1: Write failing tests**

```js
test('saves the API key and shows it masked', ...)            // shows '••••••••1234'
test('"Testar" shows "Chave OK" or the auth error message', ...)
test('voice picker lists pt-BR voices and plays a preview', ...)  // preview text 'Olá! Esta é a minha voz.' — preview chars count toward usage via addUsage and respect canSend
test('shows this month\'s usage as "123.456 de 1.000.000 caracteres grátis"', ...)
test('default speed is saved', ...)
// Library additions
test('delete audio keeps the book with status "audio-missing" and a "Reconverter" action', ...)
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Reconverter re-chunks from `getChapterText`, sets `converting`. Also call `requestPersistence()` once at app start. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: settings, usage and storage management`.

---

### Task 10: Setup guide, deploy, and on-device verification

**Files:**
- Create: `README.md` (Portuguese), `.github/workflows/deploy.yml`

- [ ] **Step 1:** README in pt-BR, numbered steps with screenshots-free text:
  1. Create a Google Cloud project, enable "Cloud Text-to-Speech API", create an API key.
  2. Restrict the key: API restriction = Text-to-Speech only; application restriction = HTTP referrers `https://<usuario>.github.io/*`.
  3. Set a budget alert (e.g. R$ 1) in Billing; if the console offers a characters-per-day quota for the API, cap it.
  4. Don't reuse this key anywhere else (the app's counter only sees its own usage).
  5. Publish: create the GitHub repo `pdf-audiobook`, push, enable Pages (GitHub Actions source).
  6. On the iPhone: open the URL in Safari → Compartilhar → "Adicionar à Tela de Início"; open from the icon; paste the key in Configurações.
  7. In the car: if audio stops with the screen locked, use "⬇ MP3" → "Salvar em Arquivos" and play from Arquivos.
- [ ] **Step 2:** `deploy.yml`: on push to `main` → `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact`, `actions/deploy-pages`.
- [ ] **Step 3:** Run `npm test` and `npm run build` locally → all pass. Commit — `docs: setup guide and Pages deploy`.
- [ ] **Step 4 (needs the owner):** Owner creates the GitHub repo and Google key; push; confirm the Pages URL loads.
- [ ] **Step 5 (needs the owner, on the iPhone):** Manual checklist, report results:
  - App installs to home screen and opens offline (airplane mode) showing the library.
  - Import a real PDF; chapters look right; review totals shown.
  - Conversion progresses with screen on; closing and reopening resumes.
  - Playback: speed, ±30 s, resume after force-quit; lock-screen controls appear.
  - With screen locked for 5 min, does audio keep playing? (record result in README "Limitações").
  - "⬇ MP3" saves to Arquivos and plays there with screen locked.
