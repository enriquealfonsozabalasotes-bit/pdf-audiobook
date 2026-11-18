import { act, renderHook, waitFor } from '@testing-library/react'
import { usePlayer, SPEEDS } from './usePlayer.js'
import { makeAudio, makeStore } from '../test/fakes.js'

const book = (over = {}) => ({
  id: 'b', title: 'Livro', createdAt: 1, voiceName: 'v', status: 'ready', speed: 1.25,
  chapters: [
    { id: 'c1', title: 'Um', textLength: 1, status: 'ready' },
    { id: 'c2', title: 'Dois', textLength: 1, status: 'ready' },
  ],
  position: { chapterId: 'c1', timeSec: 0 },
  ...over,
})
const blobs = { c1: new Blob(['1']), c2: new Blob(['2']) }

let mediaSession
beforeEach(() => {
  URL.createObjectURL = vi.fn((b) => `blob:${b.size}-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  mediaSession = { metadata: null, handlers: {}, setActionHandler: vi.fn((a, h) => (mediaSession.handlers[a] = h)) }
  Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true })
  globalThis.MediaMetadata = class {
    constructor(init) {
      Object.assign(this, init)
    }
  }
})
afterEach(() => vi.useRealTimers())

async function setup(b = book()) {
  const store = makeStore(b, blobs)
  const audio = makeAudio()
  const hook = renderHook(() => usePlayer('b', { store, audio }))
  await waitFor(() => expect(hook.result.current.chapter).toBeTruthy())
  return { store, audio, hook }
}

test('resumes at the saved position with the book speed', async () => {
  const { audio, hook } = await setup(book({ position: { chapterId: 'c2', timeSec: 123 } }))
  act(() => audio.dispatchEvent(new Event('loadedmetadata')))
  expect(hook.result.current.chapter.id).toBe('c2')
  expect(audio.currentTime).toBe(123)
  expect(audio.playbackRate).toBe(1.25)
})

test('saves position every 5 seconds while playing', async () => {
  const { store, audio, hook } = await setup()
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  await act(() => hook.result.current.play())
  audio.currentTime = 42
  await act(async () => vi.advanceTimersByTime(5000))
  await waitFor(() => expect(store.book.position).toEqual({ chapterId: 'c1', timeSec: 42 }))
})

test('saves position on pause without clobbering other fields', async () => {
  const { store, audio, hook } = await setup()
  await act(() => hook.result.current.play())
  await store.saveBook({ ...store.book, status: 'converting' }) // converter wrote meanwhile
  audio.currentTime = 77
  await act(async () => hook.result.current.pause())
  await waitFor(() => expect(store.book.position.timeSec).toBe(77))
  expect(store.book.status).toBe('converting')
})

test('advances to the next chapter on ended', async () => {
  const { audio, hook } = await setup()
  await act(() => hook.result.current.play())
  await act(async () => audio.dispatchEvent(new Event('ended')))
  await waitFor(() => expect(hook.result.current.chapter.id).toBe('c2'))
  expect(audio.play).toHaveBeenCalledTimes(2)
})

test('stops after the last chapter without looping', async () => {
  const { store, audio, hook } = await setup(book({ position: { chapterId: 'c2', timeSec: 0 } }))
  await act(() => hook.result.current.play())
  audio.currentTime = 600
  await act(async () => audio.dispatchEvent(new Event('ended')))
  await waitFor(() => expect(store.book.position).toEqual({ chapterId: 'c2', timeSec: 600 }))
  expect(hook.result.current.chapter.id).toBe('c2')
  expect(audio.play).toHaveBeenCalledTimes(1)
})

test('does not advance into a chapter that is still converting', async () => {
  const b = book()
  b.chapters[1].status = 'pending'
  const { audio, hook } = await setup(b)
  await act(() => hook.result.current.play())
  await act(async () => audio.dispatchEvent(new Event('ended')))
  expect(hook.result.current.chapter.id).toBe('c1')
  expect(audio.play).toHaveBeenCalledTimes(1)
})

test('seekBy clamps to 0 and duration', async () => {
  const { audio, hook } = await setup()
  audio.currentTime = 10
  act(() => hook.result.current.seekBy(-30))
  expect(audio.currentTime).toBe(0)
  audio.currentTime = 590
  act(() => hook.result.current.seekBy(30))
  expect(audio.currentTime).toBe(600)
})

test('sets playbackRate and persists speed on the book', async () => {
  const { store, audio, hook } = await setup()
  expect(SPEEDS).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2])
  await act(() => hook.result.current.setSpeed(1.5))
  expect(audio.playbackRate).toBe(1.5)
  await waitFor(() => expect(store.book.speed).toBe(1.5))
})

test('registers media session handlers and metadata', async () => {
  const { audio } = await setup()
  expect(mediaSession.metadata).toMatchObject({ title: 'Um', artist: 'Livro' })
  for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack']) {
    expect(mediaSession.handlers[a]).toBeTypeOf('function')
  }
  audio.currentTime = 100
  act(() => mediaSession.handlers.seekbackward())
  expect(audio.currentTime).toBe(70)
})
