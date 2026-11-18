// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import * as store from '../store/db.js'
import { convertBook } from './converter.js'
import { TtsError } from '../tts/google.js'
import { FREE_TIER_CHARS } from '../tts/voices.js'

const NOW = new Date(2026, 10, 18)
const LIMIT = FREE_TIER_CHARS.free

beforeEach(() => {
  store.closeDb()
  globalThis.indexedDB = new IDBFactory()
})

async function seed(chapters = { c1: ['Um.', 'Dois.'], c2: ['Três.'] }) {
  await store.saveBook({
    id: 'b', title: 'Livro', createdAt: 1, voiceName: 'pt-BR-Neural2-A', status: 'converting',
    chapters: Object.entries(chapters).map(([id, texts]) => ({ id, title: id, textLength: texts.join('').length, status: 'pending' })),
    position: { chapterId: 'c1', timeSec: 0 }, speed: 1,
  })
  for (const [id, texts] of Object.entries(chapters)) {
    await store.saveChunks(texts.map((text, index) => ({ bookId: 'b', chapterId: id, index, text, status: 'pending' })))
  }
}

const fakeSynth = (log = []) => async ({ text }) => {
  log.push(text)
  return new Blob([`[${text}]`], { type: 'audio/mpeg' })
}
const deps = (over = {}) => ({ store, synthesize: fakeSynth(), now: () => NOW, sleep: async () => {}, ...over })

test('converts all pending chunks, assembles chapter audio, deletes chunks, marks book ready', async () => {
  await seed()
  expect(await convertBook('b', deps())).toBe('ready')
  expect(await (await store.getChapterAudio('b', 'c1')).text()).toBe('[Um.][Dois.]')
  expect(await (await store.getChapterAudio('b', 'c2')).text()).toBe('[Três.]')
  expect(await store.getChunks('b', 'c1')).toEqual([])
  const book = await store.getBook('b')
  expect(book.status).toBe('ready')
  expect(book.chapters.map((c) => c.status)).toEqual(['ready', 'ready'])
})

test('adds usage per chunk sent, in code points', async () => {
  await seed({ c1: ['ação.', 'é.'] })
  await convertBook('b', deps())
  expect(await store.getUsage('2026-11', 'free')).toBe(7)
})

test('pauses before exceeding the free tier and sets pausedUntil to next month', async () => {
  await seed({ c1: ['x'.repeat(20)] })
  await store.addUsage('2026-11', 'free', LIMIT * 0.95 - 10)
  const log = []
  expect(await convertBook('b', deps({ synthesize: fakeSynth(log) }))).toBe('paused-quota')
  expect(log).toEqual([])
  expect(await store.getBook('b')).toMatchObject({ status: 'paused-quota', pausedUntil: '2026-12-01' })
})

test('resumes a paused book in the next month without re-sending done chunks', async () => {
  await seed({ c1: ['primeiro', 'segundo'] })
  await store.addUsage('2026-11', 'free', LIMIT * 0.95 - 8) // room for "primeiro" only
  const log = []
  expect(await convertBook('b', deps({ synthesize: fakeSynth(log) }))).toBe('paused-quota')
  expect(await convertBook('b', deps({ synthesize: fakeSynth(log), now: () => new Date(2026, 11, 1) }))).toBe('ready')
  expect(log).toEqual(['primeiro', 'segundo'])
  expect(await store.getUsage('2026-12', 'free')).toBe(7)
  const book = await store.getBook('b')
  expect(book.status).toBe('ready')
  expect(book.pausedUntil).toBeUndefined()
})

test('a retryable error retries with backoff up to 3 times then sets status error', async () => {
  await seed({ c1: ['a'] })
  const sleeps = []
  let calls = 0
  const synthesize = async () => {
    calls++
    throw new TtsError('retryable', 'x', { status: 429, billable: false })
  }
  expect(await convertBook('b', deps({ synthesize, sleep: async (ms) => sleeps.push(ms) }))).toBe('error')
  expect(calls).toBe(4)
  expect(sleeps).toEqual([1000, 2000, 4000])
  expect((await store.getBook('b')).errorMessage).toMatch(/Google/)
})

test('a retry that succeeds continues normally', async () => {
  await seed({ c1: ['a'] })
  let calls = 0
  const synthesize = async ({ text }) => {
    if (++calls === 1) throw new TtsError('retryable', 'x', { status: 503, billable: true })
    return new Blob([text])
  }
  expect(await convertBook('b', deps({ synthesize }))).toBe('ready')
})

test('a billable failure still counts its chars as used', async () => {
  await seed({ c1: ['abcd'] })
  let calls = 0
  const synthesize = async ({ text }) => {
    if (++calls === 1) throw new TtsError('retryable', 'x', { status: 503, billable: true })
    return new Blob([text])
  }
  await convertBook('b', deps({ synthesize }))
  expect(await store.getUsage('2026-11', 'free')).toBe(8)
})

test('auth error stops immediately with a Portuguese message and no usage counted', async () => {
  await seed({ c1: ['a', 'b'] })
  let calls = 0
  const synthesize = async () => {
    calls++
    throw new TtsError('auth', 'x', { status: 403, billable: false })
  }
  expect(await convertBook('b', deps({ synthesize }))).toBe('error')
  expect(calls).toBe(1)
  expect(await store.getUsage('2026-11', 'free')).toBe(0)
  expect(await store.getBook('b')).toMatchObject({
    status: 'error',
    errorMessage: 'Chave do Google inválida ou API Text-to-Speech não ativada.',
  })
})

test('abort signal stops after the current chunk', async () => {
  await seed({ c1: ['a', 'b', 'c'] })
  const ctrl = new AbortController()
  const log = []
  const synthesize = async ({ text }) => {
    log.push(text)
    ctrl.abort()
    return new Blob([text])
  }
  expect(await convertBook('b', deps({ synthesize, signal: ctrl.signal }))).toBe('aborted')
  expect(log).toEqual(['a'])
  expect((await store.getChunks('b', 'c1')).map((c) => c.status)).toEqual(['done', 'pending', 'pending'])
})

test('does not overwrite the playback position saved meanwhile', async () => {
  await seed({ c1: ['a'] })
  const synthesize = async ({ text }) => {
    const b = await store.getBook('b')
    await store.saveBook({ ...b, position: { chapterId: 'c1', timeSec: 42 } })
    return new Blob([text])
  }
  await convertBook('b', deps({ synthesize }))
  expect((await store.getBook('b')).position.timeSec).toBe(42)
})

test('reports progress in characters', async () => {
  await seed({ c1: ['ab', 'cd'] })
  const events = []
  await convertBook('b', deps({ onProgress: (p) => events.push(p) }))
  expect(events.at(-1)).toEqual({ done: 4, total: 4 })
})
