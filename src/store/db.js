// IndexedDB storage. Schema per spec §7 "Data model".
import { openDB } from 'idb'

const DB_NAME = 'audiobooks'
const SETTINGS_DEFAULTS = { apiKey: '', voiceName: '', defaultSpeed: 1 }
const BOOK_STORES = ['chunks', 'chapterAudio', 'chapterText']

let dbPromise = null

export function openDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('books', { keyPath: 'id' })
        const chunks = db.createObjectStore('chunks', { keyPath: ['bookId', 'chapterId', 'index'] })
        chunks.createIndex('byChapter', ['bookId', 'chapterId'])
        chunks.createIndex('byBook', 'bookId')
        for (const name of ['chapterAudio', 'chapterText']) {
          db.createObjectStore(name, { keyPath: ['bookId', 'chapterId'] }).createIndex('byBook', 'bookId')
        }
        db.createObjectStore('usage', { keyPath: ['month', 'tier'] })
        db.createObjectStore('settings')
      },
    })
  }
  return dbPromise
}

export function closeDb() {
  if (dbPromise) dbPromise.then((db) => db.close()).catch(() => {})
  dbPromise = null
}

export async function requestPersistence() {
  try {
    if (!globalThis.navigator?.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

// books
export const saveBook = async (book) => (await openDb()).put('books', book)

/** Read-modify-write in ONE transaction, so concurrent writers never lose each other's fields. */
export async function updateBook(id, change) {
  const tx = (await openDb()).transaction('books', 'readwrite')
  const book = await tx.store.get(id)
  if (!book) {
    await tx.done
    return undefined
  }
  const next = change(book)
  await tx.store.put(next)
  await tx.done
  return next
}

/** Store a chapter's assembled audio, drop its chunks and mark it ready, atomically. */
export async function finishChapter(bookId, chapterId, mp3) {
  const tx = (await openDb()).transaction(['books', 'chunks', 'chapterAudio'], 'readwrite')
  await tx.objectStore('chapterAudio').put({ bookId, chapterId, mp3 })
  let cursor = await tx.objectStore('chunks').index('byChapter').openCursor([bookId, chapterId])
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  const books = tx.objectStore('books')
  const book = await books.get(bookId)
  if (book) await books.put({ ...book, chapters: book.chapters.map((c) => (c.id === chapterId ? { ...c, status: 'ready' } : c)) })
  await tx.done
}
export const getBook = async (id) => (await openDb()).get('books', id)
export const listBooks = async () => (await (await openDb()).getAll('books')).sort((a, b) => b.createdAt - a.createdAt)

async function deleteByBook(tx, storeName, bookId) {
  let cursor = await tx.objectStore(storeName).index('byBook').openCursor(bookId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
}

export async function deleteBook(id) {
  const tx = (await openDb()).transaction(['books', ...BOOK_STORES], 'readwrite')
  await tx.objectStore('books').delete(id)
  for (const s of BOOK_STORES) await deleteByBook(tx, s, id)
  await tx.done
}

export async function deleteAudio(bookId) {
  const tx = (await openDb()).transaction(['chunks', 'chapterAudio'], 'readwrite')
  await deleteByBook(tx, 'chunks', bookId)
  await deleteByBook(tx, 'chapterAudio', bookId)
  await tx.done
}

// chapter text
export const saveChapterText = async (bookId, chapterId, text) =>
  (await openDb()).put('chapterText', { bookId, chapterId, text })
export const getChapterText = async (bookId, chapterId) =>
  (await (await openDb()).get('chapterText', [bookId, chapterId]))?.text

// chunks
export async function saveChunks(chunks) {
  const tx = (await openDb()).transaction('chunks', 'readwrite')
  for (const c of chunks) tx.store.put(c)
  await tx.done
}
export const getChunks = async (bookId, chapterId) =>
  (await openDb()).getAllFromIndex('chunks', 'byChapter', [bookId, chapterId])

export async function markChunkDone(bookId, chapterId, index, mp3) {
  const db = await openDb()
  const chunk = await db.get('chunks', [bookId, chapterId, index])
  if (!chunk) throw new Error(`chunk not found: ${bookId}/${chapterId}/${index}`)
  await db.put('chunks', { ...chunk, status: 'done', mp3 })
}

export async function deleteChunks(bookId, chapterId) {
  const db = await openDb()
  const tx = db.transaction('chunks', 'readwrite')
  let cursor = await tx.store.index('byChapter').openCursor([bookId, chapterId])
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

// chapter audio
export const saveChapterAudio = async (bookId, chapterId, mp3) =>
  (await openDb()).put('chapterAudio', { bookId, chapterId, mp3 })
export const getChapterAudio = async (bookId, chapterId) =>
  (await (await openDb()).get('chapterAudio', [bookId, chapterId]))?.mp3

export async function bookStorageBytes(bookId) {
  const db = await openDb()
  const chunks = await db.getAllFromIndex('chunks', 'byBook', bookId)
  const audio = await db.getAllFromIndex('chapterAudio', 'byBook', bookId)
  return [...chunks, ...audio].reduce((n, r) => n + (r.mp3?.size || 0), 0)
}

// usage
export const getUsage = async (month, tier) => (await (await openDb()).get('usage', [month, tier]))?.charsSent || 0

export async function addUsage(month, tier, chars) {
  const tx = (await openDb()).transaction('usage', 'readwrite')
  const current = (await tx.store.get([month, tier]))?.charsSent || 0
  const charsSent = current + chars
  await tx.store.put({ month, tier, charsSent })
  await tx.done
  return charsSent
}

export const setUsage = async (month, tier, charsSent) => (await openDb()).put('usage', { month, tier, charsSent })

// settings
export const getSettings = async () => ({ ...SETTINGS_DEFAULTS, ...((await (await openDb()).get('settings', 'settings')) || {}) })

export async function saveSettings(partial) {
  const next = { ...(await getSettings()), ...partial }
  await (await openDb()).put('settings', next, 'settings')
  return next
}
