// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import * as store from '../store/db.js'
import { removeAudio, reconvertBook } from './manage.js'

beforeEach(() => {
  store.closeDb()
  globalThis.indexedDB = new IDBFactory()
})

async function seedReady() {
  const chapters = [
    { id: 'c1', title: 'A', textLength: 10, status: 'ready' },
    { id: 'c2', title: 'B', textLength: 10, status: 'ready' },
  ]
  await store.saveBook({ id: 'b', title: 'L', createdAt: 1, voiceName: 'v', status: 'ready', chapters, position: { chapterId: 'c2', timeSec: 9 }, speed: 1 })
  await store.saveChapterText('b', 'c1', 'Frase um.')
  await store.saveChapterText('b', 'c2', 'Frase dois.')
  await store.saveChapterAudio('b', 'c1', new Blob(['x']))
}

test('removeAudio deletes audio and marks the book audio-missing, keeping text and position', async () => {
  await seedReady()
  await removeAudio('b', { store })
  expect(await store.getChapterAudio('b', 'c1')).toBeUndefined()
  expect(await store.getChapterText('b', 'c1')).toBe('Frase um.')
  const book = await store.getBook('b')
  expect(book.status).toBe('audio-missing')
  expect(book.chapters.map((c) => c.status)).toEqual(['pending', 'pending'])
  expect(book.position).toEqual({ chapterId: 'c2', timeSec: 9 })
})

test('reconvertBook re-chunks from stored text and sets converting', async () => {
  await seedReady()
  await removeAudio('b', { store })
  await reconvertBook('b', { store })
  expect((await store.getChunks('b', 'c2')).map((c) => [c.text, c.status])).toEqual([['Frase dois.', 'pending']])
  expect((await store.getBook('b')).status).toBe('converting')
})
