// Runs conversions in the foreground, one book at a time. iOS freezes web apps in the
// background, so we abort when hidden and pick up again when visible.
import { useEffect, useRef, useState } from 'react'
import * as store from '../store/db.js'
import { convertBook } from '../convert/converter.js'
import { synthesize } from '../tts/google.js'
import { dayKey } from '../quota/quota.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function isConvertible(book, today) {
  return book.status === 'converting' || (book.status === 'paused-quota' && book.pausedUntil <= today)
}

export function useConversion({ books, apiKey, refresh }) {
  const [progress, setProgress] = useState({})
  const [tick, setTick] = useState(0)
  const running = useRef(null)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') running.current?.abort()
      else setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (running.current || !apiKey || document.visibilityState === 'hidden') return
    const next = books.find((b) => isConvertible(b, dayKey(new Date())))
    if (!next) return

    const ctrl = new AbortController()
    running.current = ctrl
    let wakeLock = null
    navigator.wakeLock
      ?.request('screen')
      .then((w) => (wakeLock = w))
      .catch(() => {})

    convertBook(next.id, {
      store,
      synthesize: (args) => synthesize({ ...args, apiKey }),
      now: () => new Date(),
      sleep,
      signal: ctrl.signal,
      onProgress: (p) => setProgress((prev) => ({ ...prev, [next.id]: p })),
    })
      .catch(async (err) => {
        const book = await store.getBook(next.id)
        if (book) await store.saveBook({ ...book, status: 'error', errorMessage: `Erro inesperado: ${err?.message || err}` })
      })
      .finally(async () => {
        wakeLock?.release().catch(() => {})
        running.current = null
        await refresh()
        setTick((t) => t + 1)
      })
  }, [books, apiKey, tick, refresh])

  return progress
}
