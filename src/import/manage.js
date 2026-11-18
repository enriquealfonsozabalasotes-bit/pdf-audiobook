// Book lifecycle after import: free space by removing audio, and convert again from stored text.
import { chunkText } from '../text/chunk.js'

export async function removeAudio(bookId, { store }) {
  await store.deleteAudio(bookId)
  await store.updateBook(bookId, ({ pausedUntil, errorMessage, ...rest }) => ({
    ...rest,
    status: 'audio-missing',
    chapters: rest.chapters.map((c) => ({ ...c, status: 'pending' })),
  }))
}

export async function reconvertBook(bookId, { store }) {
  const book = await store.getBook(bookId)
  for (const chapter of book.chapters) {
    if (chapter.status === 'ready') continue
    const text = (await store.getChapterText(bookId, chapter.id)) || ''
    await store.deleteChunks(bookId, chapter.id)
    await store.saveChunks(chunkText(text).map((t, index) => ({ bookId, chapterId: chapter.id, index, text: t, status: 'pending' })))
  }
  await store.updateBook(bookId, ({ pausedUntil, errorMessage, ...rest }) => ({ ...rest, status: 'converting' }))
}
