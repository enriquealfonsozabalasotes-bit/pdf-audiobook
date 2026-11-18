// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import * as db from './db.js'

beforeEach(() => {
  db.closeDb()
  globalThis.indexedDB = new IDBFactory()
})

const book = (id, createdAt) => ({
  id, title: id, createdAt, voiceName: 'v', status: 'converting',
  chapters: [{ id: 'c1', title: 'C1', textLength: 3, status: 'pending' }],
  position: { chapterId: 'c1', timeSec: 0 }, speed: 1,
})
const mp3 = (s) => new Blob([s], { type: 'audio/mpeg' })

test('saves and lists books newest first', async () => {
  await db.saveBook(book('a', 1))
  await db.saveBook(book('b', 2))
  expect((await db.listBooks()).map((b) => b.id)).toEqual(['b', 'a'])
  expect((await db.getBook('a')).title).toBe('a')
})

test('deleteBook removes chunks, audio and text', async () => {
  await db.saveBook(book('a', 1))
  await db.saveBook(book('b', 2))
  for (const id of ['a', 'b']) {
    await db.saveChapterText(id, 'c1', 'abc')
    await db.saveChunks([{ bookId: id, chapterId: 'c1', index: 0, text: 'abc', status: 'pending' }])
    await db.saveChapterAudio(id, 'c1', mp3('x'))
  }
  await db.deleteBook('a')
  expect(await db.getBook('a')).toBeUndefined()
  expect(await db.getChunks('a', 'c1')).toEqual([])
  expect(await db.getChapterAudio('a', 'c1')).toBeUndefined()
  expect(await db.getChapterText('a', 'c1')).toBeUndefined()
  expect(await db.getChapterText('b', 'c1')).toBe('abc')
})

test('getChunks returns chunks ordered by index', async () => {
  await db.saveChunks([2, 0, 1, 10].map((index) => ({ bookId: 'a', chapterId: 'c1', index, text: `t${index}`, status: 'pending' })))
  await db.saveChunks([{ bookId: 'a', chapterId: 'c2', index: 0, text: 'outro', status: 'pending' }])
  expect((await db.getChunks('a', 'c1')).map((c) => c.index)).toEqual([0, 1, 2, 10])
})

test('markChunkDone stores the blob and status done', async () => {
  await db.saveChunks([{ bookId: 'a', chapterId: 'c1', index: 0, text: 't', status: 'pending' }])
  await db.markChunkDone('a', 'c1', 0, mp3('som'))
  const [c] = await db.getChunks('a', 'c1')
  expect(c.status).toBe('done')
  expect(await c.mp3.text()).toBe('som')
})

test('deleteChunks removes only that chapter', async () => {
  await db.saveChunks([
    { bookId: 'a', chapterId: 'c1', index: 0, text: 't', status: 'pending' },
    { bookId: 'a', chapterId: 'c2', index: 0, text: 't', status: 'pending' },
  ])
  await db.deleteChunks('a', 'c1')
  expect(await db.getChunks('a', 'c1')).toEqual([])
  expect(await db.getChunks('a', 'c2')).toHaveLength(1)
})

test('addUsage accumulates per month and tier', async () => {
  expect(await db.addUsage('2026-11', 'neural2', 100)).toBe(100)
  expect(await db.addUsage('2026-11', 'neural2', 50)).toBe(150)
  expect(await db.getUsage('2026-11', 'neural2')).toBe(150)
  expect(await db.getUsage('2026-12', 'neural2')).toBe(0)
  expect(await db.getUsage('2026-11', 'wavenet')).toBe(0)
})

test('getSettings returns defaults when empty and merges saves', async () => {
  expect(await db.getSettings()).toEqual({ apiKey: '', voiceName: '', defaultSpeed: 1 })
  await db.saveSettings({ apiKey: 'K' })
  await db.saveSettings({ defaultSpeed: 1.5 })
  expect(await db.getSettings()).toEqual({ apiKey: 'K', voiceName: '', defaultSpeed: 1.5 })
})

test('deleteAudio keeps chapter text', async () => {
  await db.saveChapterText('a', 'c1', 'abc')
  await db.saveChunks([{ bookId: 'a', chapterId: 'c1', index: 0, text: 'abc', status: 'done', mp3: mp3('x') }])
  await db.saveChapterAudio('a', 'c1', mp3('x'))
  await db.deleteAudio('a')
  expect(await db.getChapterAudio('a', 'c1')).toBeUndefined()
  expect(await db.getChunks('a', 'c1')).toEqual([])
  expect(await db.getChapterText('a', 'c1')).toBe('abc')
})

test('bookStorageBytes sums chunk and chapter audio sizes', async () => {
  await db.saveChunks([{ bookId: 'a', chapterId: 'c2', index: 0, text: 't', status: 'done', mp3: mp3('12345') }])
  await db.saveChapterAudio('a', 'c1', mp3('1234567890'))
  expect(await db.bookStorageBytes('a')).toBe(15)
})

test('requestPersistence returns false when unsupported', async () => {
  expect(await db.requestPersistence()).toBe(false)
})
