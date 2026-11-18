// Conversion loop: free-tier guard -> count -> synthesize -> persist chunk -> assemble chapter.
import { canSend, monthKey, nextMonthStart } from '../quota/quota.js'
import { countChars } from '../text/chunk.js'
import { FREE_TIER_CHARS, quotaPoolOf } from '../tts/voices.js'
import { concatMp3 } from '../audio/concat.js'

const MAX_RETRIES = 3

const MESSAGES = {
  auth: 'Chave do Google inválida ou API Text-to-Speech não ativada.',
  'bad-request': 'O Google recusou um trecho do texto (erro 400).',
  retryable: 'O Google não respondeu. Tente de novo mais tarde.',
  network: 'Sem conexão com a internet. Tente de novo quando estiver online.',
  'missing-chunks': 'Faltam partes deste livro. Apague o áudio em Configurações e use "Reconverter".',
}

export const errorMessage = (kind) => MESSAGES[kind] || MESSAGES.retryable

export const estimateBookChars = (chapters) => chapters.reduce((n, c) => n + countChars(c.text), 0)

const withoutFlags = ({ pausedUntil, errorMessage, ...rest }) => rest

export async function convertBook(bookId, { store, synthesize, now, sleep, signal, onProgress }) {
  const book = await store.updateBook(bookId, (b) => ({ ...withoutFlags(b), status: 'converting' }))
  if (!book) return 'aborted'
  const pool = quotaPoolOf(book.voiceName)
  const limit = FREE_TIER_CHARS[pool]
  const total = book.chapters.reduce((n, c) => n + c.textLength, 0)
  let done = book.chapters.filter((c) => c.status === 'ready').reduce((n, c) => n + c.textLength, 0)

  const fail = async (kind) => {
    await store.updateBook(bookId, (b) => ({ ...b, status: 'error', errorMessage: errorMessage(kind) }))
    return 'error'
  }

  for (const chapter of book.chapters) {
    if (chapter.status === 'ready') continue
    const chunks = await store.getChunks(bookId, chapter.id)
    if (!chunks.length) return fail('missing-chunks')

    for (const chunk of chunks) {
      const chars = countChars(chunk.text)
      if (chunk.status === 'done') {
        done += chars
        continue
      }
      if (signal?.aborted) return 'aborted'

      for (let attempt = 0; ; attempt++) {
        const month = monthKey(now())
        if (!canSend(await store.getUsage(month, pool), chars, limit)) {
          await store.updateBook(bookId, (b) => ({ ...b, status: 'paused-quota', pausedUntil: nextMonthStart(now()) }))
          return 'paused-quota'
        }
        // Count BEFORE sending: if the response is lost, Google may still have billed it.
        await store.addUsage(month, pool, chars)
        try {
          const mp3 = await synthesize({ text: chunk.text, voiceName: book.voiceName })
          await store.markChunkDone(bookId, chapter.id, chunk.index, mp3)
          break
        } catch (err) {
          if (err?.billable === false) await store.addUsage(month, pool, -chars) // certainly not billed
          const retry = err?.kind === 'retryable' || err?.kind === 'network'
          if (!retry || attempt >= MAX_RETRIES) return fail(err?.kind)
          await sleep(1000 * 2 ** attempt)
        }
      }
      done += chars
      onProgress?.({ done, total })
    }

    const finished = await store.getChunks(bookId, chapter.id)
    if (!finished.length || finished.some((c) => c.status !== 'done' || !c.mp3)) return fail('missing-chunks')
    await store.finishChapter(bookId, chapter.id, concatMp3(finished.map((c) => c.mp3)))
  }

  await store.updateBook(bookId, (b) => ({ ...withoutFlags(b), status: 'ready' }))
  onProgress?.({ done: total, total })
  return 'ready'
}
