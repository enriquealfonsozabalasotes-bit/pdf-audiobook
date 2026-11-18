import { vi } from 'vitest'

const clone = (x) => JSON.parse(JSON.stringify(x))

/** In-memory stand-in for the parts of store/db.js the player uses. */
export function makeStore(book, audioByChapter = {}) {
  let current = clone(book)
  return {
    getBook: async () => clone(current),
    saveBook: async (b) => {
      current = clone(b)
    },
    getChapterAudio: async (_bookId, chapterId) => audioByChapter[chapterId],
    get book() {
      return current
    },
  }
}

/** jsdom <audio> with controllable time and stubbed play/pause. */
export function makeAudio() {
  const audio = document.createElement('audio')
  let time = 0
  let paused = true
  Object.defineProperty(audio, 'currentTime', { get: () => time, set: (v) => (time = v), configurable: true })
  Object.defineProperty(audio, 'duration', { value: 600, writable: true, configurable: true })
  Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true })
  audio.play = vi.fn(async () => {
    paused = false
    audio.dispatchEvent(new Event('play'))
  })
  audio.pause = vi.fn(() => {
    if (paused) return
    paused = true
    audio.dispatchEvent(new Event('pause'))
  })
  audio.load = vi.fn()
  return audio
}
