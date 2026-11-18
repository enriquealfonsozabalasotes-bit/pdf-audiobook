// Playback of one book: a single <audio> element fed with the stored chapter MP3.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as defaultStore from '../store/db.js'

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
export const SEEK_SEC = 30
const SAVE_EVERY_MS = 5000

let sharedAudio = null
const getSharedAudio = () => (sharedAudio ??= new Audio())

export function usePlayer(bookId, { store = defaultStore, audio = getSharedAudio() } = {}) {
  const [book, setBook] = useState(null)
  const [chapterId, setChapterId] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeedState] = useState(1)

  const chapterRef = useRef(null)
  const urlRef = useRef(null)
  const pendingSeek = useRef(null)
  const speedRef = useRef(1)

  const savePosition = useCallback(
    async (timeSec = audio.currentTime) => {
      const chapterId = chapterRef.current
      if (!chapterId) return
      await store.updateBook(bookId, (b) => ({ ...b, position: { chapterId, timeSec } }))
    },
    [audio, bookId, store],
  )

  const loadChapter = useCallback(
    async (id, timeSec, autoplay) => {
      const blob = await store.getChapterAudio(bookId, id)
      chapterRef.current = id
      setChapterId(id)
      setCurrentTime(timeSec)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      if (!blob) {
        audio.removeAttribute('src')
        return false
      }
      urlRef.current = URL.createObjectURL(blob)
      pendingSeek.current = timeSec
      audio.src = urlRef.current
      audio.defaultPlaybackRate = speedRef.current
      audio.playbackRate = speedRef.current
      audio.preservesPitch = true
      if (autoplay) await audio.play().catch(() => {})
      return true
    },
    [audio, bookId, store],
  )

  const play = useCallback(async () => {
    if (!urlRef.current) return
    await audio.play().catch(() => {})
  }, [audio])

  const pause = useCallback(() => audio.pause(), [audio])

  const seekBy = useCallback(
    (sec) => {
      const max = Number.isFinite(audio.duration) ? audio.duration : Infinity
      audio.currentTime = Math.min(max, Math.max(0, audio.currentTime + sec))
      setCurrentTime(audio.currentTime)
    },
    [audio],
  )

  const seekTo = useCallback(
    (sec) => {
      audio.currentTime = sec
      setCurrentTime(sec)
    },
    [audio],
  )

  const goToChapter = useCallback(
    async (id) => {
      const fresh = await store.getBook(bookId)
      const chapter = fresh?.chapters.find((c) => c.id === id)
      if (!chapter || chapter.status !== 'ready') return
      setBook(fresh)
      await loadChapter(id, 0, true)
      await savePosition(0)
    },
    [bookId, loadChapter, savePosition, store],
  )

  const stepChapter = useCallback(
    async (delta) => {
      const fresh = await store.getBook(bookId)
      if (!fresh) return false
      const i = fresh.chapters.findIndex((c) => c.id === chapterRef.current)
      const target = fresh.chapters[i + delta]
      if (!target || target.status !== 'ready') return false
      setBook(fresh)
      await loadChapter(target.id, 0, true)
      await savePosition(0)
      return true
    },
    [bookId, loadChapter, savePosition, store],
  )

  const setSpeed = useCallback(
    async (rate) => {
      speedRef.current = rate
      setSpeedState(rate)
      audio.defaultPlaybackRate = rate
      audio.playbackRate = rate
      await store.updateBook(bookId, (b) => ({ ...b, speed: rate }))
    },
    [audio, bookId, store],
  )

  // initial load
  useEffect(() => {
    let cancelled = false
    store.getBook(bookId).then((b) => {
      if (cancelled || !b) return
      speedRef.current = b.speed || 1
      setSpeedState(speedRef.current)
      setBook(b)
      loadChapter(b.position.chapterId, b.position.timeSec, false)
    })
    return () => {
      cancelled = true
    }
  }, [bookId, loadChapter, store])

  // element events
  useEffect(() => {
    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      savePosition()
    }
    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => {
      if (pendingSeek.current != null) audio.currentTime = pendingSeek.current
      pendingSeek.current = null
      setDuration(audio.duration)
    }
    const onEnded = async () => {
      if (!(await stepChapter(1))) await savePosition(Number.isFinite(audio.duration) ? audio.duration : audio.currentTime)
    }
    const onHidden = () => document.visibilityState === 'hidden' && savePosition()
    const events = { play: onPlay, pause: onPause, timeupdate: onTime, loadedmetadata: onMeta, ended: onEnded }
    for (const [e, h] of Object.entries(events)) audio.addEventListener(e, h)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      for (const [e, h] of Object.entries(events)) audio.removeEventListener(e, h)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [audio, savePosition, stepChapter])

  // periodic save while playing
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => savePosition(), SAVE_EVERY_MS)
    return () => clearInterval(id)
  }, [playing, savePosition])

  // leaving the player: stop and remember where we were
  useEffect(
    () => () => {
      if (!audio.paused) audio.pause()
      else savePosition()
    },
    [audio, savePosition],
  )

  // lock screen / car controls
  const chapter = book?.chapters.find((c) => c.id === chapterId) || null
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || !book || !chapter) return
    if (typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({ title: chapter.title, artist: book.title })
    const handlers = {
      play: () => play(),
      pause: () => pause(),
      seekbackward: () => seekBy(-SEEK_SEC),
      seekforward: () => seekBy(SEEK_SEC),
      previoustrack: () => stepChapter(-1),
      nexttrack: () => stepChapter(1),
    }
    for (const [action, h] of Object.entries(handlers)) {
      try {
        ms.setActionHandler(action, h)
      } catch {
        // action not supported on this browser
      }
    }
  }, [book, chapter, play, pause, seekBy, stepChapter])

  return { book, chapter, playing, currentTime, duration, speed, play, pause, seekBy, seekTo, goToChapter, setSpeed }
}
