import { extractPdf } from '../pdf/extract.js'
import { cleanPages } from '../text/clean.js'
import { splitChapters } from '../text/split.js'
import { chunkText, countChars } from '../text/chunk.js'

const NO_TEXT = 'Este PDF não tem texto selecionável.'

const readFile = (file) =>
  file.arrayBuffer
    ? file.arrayBuffer()
    : new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(file)
      })

export async function buildDraft(file, { extract = extractPdf } = {}) {
  const { title, pages, outline } = await extract(await readFile(file))
  const chapters = splitChapters(cleanPages(pages), outline)
  if (!chapters.length) throw new Error(NO_TEXT)
  return {
    title: title || file.name.replace(/\.pdf$/i, ''),
    chapters: chapters.map((c) => ({ ...c, chars: countChars(c.text), selected: true })),
  }
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export async function createBook(draft, { voiceName, store, now = Date.now }) {
  const selected = draft.chapters.filter((c) => c.selected)
  if (!selected.length) throw new Error('Selecione pelo menos um capítulo.')
  const settings = await store.getSettings()
  const id = newId()
  const chapters = selected.map((c, i) => ({ id: `c${i + 1}`, title: c.title, textLength: countChars(c.text), status: 'pending' }))
  const book = {
    id,
    title: draft.title.trim() || 'Sem título',
    createdAt: now(),
    voiceName,
    status: 'converting',
    chapters,
    position: { chapterId: chapters[0].id, timeSec: 0 },
    speed: settings.defaultSpeed,
  }
  for (const [i, c] of selected.entries()) {
    const chapterId = chapters[i].id
    await store.saveChapterText(id, chapterId, c.text)
    await store.saveChunks(chunkText(c.text).map((text, index) => ({ bookId: id, chapterId, index, text, status: 'pending' })))
  }
  await store.saveBook(book) // last, so a half-imported book never shows up
  return book
}
