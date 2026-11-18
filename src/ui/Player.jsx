import { useState } from 'react'
import * as defaultStore from '../store/db.js'
import { usePlayer, SPEEDS, SEEK_SEC } from './usePlayer.js'
import { chapterFilename, exportChapter } from '../export/share.js'
import { formatTime } from './format.js'

const speedLabel = (s) => `${String(s).replace('.', ',')}x`

export default function Player({ bookId, onBack, store = defaultStore, audio }) {
  const p = usePlayer(bookId, { store, ...(audio ? { audio } : {}) })
  const [notice, setNotice] = useState(null)

  if (!p.book) return <section className="screen" aria-busy="true" />

  const index = p.book.chapters.findIndex((c) => c.id === p.chapter?.id)
  const ready = p.chapter?.status === 'ready'
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(p.speed) + 1) % SPEEDS.length]

  const download = async () => {
    const blob = await store.getChapterAudio(bookId, p.chapter.id)
    if (!blob) return setNotice('Este capítulo ainda não tem áudio.')
    const result = await exportChapter({ blob, filename: chapterFilename(p.book.title, index, p.chapter.title) })
    if (result === 'downloaded') setNotice('MP3 baixado.')
  }

  return (
    <section className="screen player">
      <header className="topbar">
        <button className="icon-btn" aria-label="Voltar para a biblioteca" onClick={onBack}>
          ←
        </button>
        <h1>{p.book.title}</h1>
      </header>

      <h2 className="player__chapter">{p.chapter?.title}</h2>
      <p className="player__count">
        Capítulo {index + 1} de {p.book.chapters.length}
      </p>

      <input
        className="player__scrub"
        type="range"
        aria-label="Posição"
        min={0}
        max={p.duration || 0}
        step={1}
        value={Math.min(p.currentTime, p.duration || 0)}
        onChange={(e) => p.seekTo(Number(e.target.value))}
        disabled={!ready}
      />
      <div className="player__times">
        <span>{formatTime(p.currentTime)}</span>
        <span>-{formatTime((p.duration || 0) - p.currentTime)}</span>
      </div>

      <div className="player__controls">
        <button className="round-btn" aria-label="Voltar 30 segundos" onClick={() => p.seekBy(-SEEK_SEC)} disabled={!ready}>
          ⟲30
        </button>
        <button
          className="round-btn round-btn--main"
          aria-label={p.playing ? 'Pausar' : 'Tocar'}
          onClick={() => (p.playing ? p.pause() : p.play())}
          disabled={!ready}
        >
          {p.playing ? '❚❚' : '▶'}
        </button>
        <button className="round-btn" aria-label="Avançar 30 segundos" onClick={() => p.seekBy(SEEK_SEC)} disabled={!ready}>
          30⟳
        </button>
      </div>

      <div className="player__secondary">
        <button className="btn" aria-label={`Velocidade ${speedLabel(p.speed)}`} onClick={() => p.setSpeed(nextSpeed)}>
          {speedLabel(p.speed)}
        </button>
        <button className="btn" aria-label="Baixar MP3" onClick={download} disabled={!ready}>
          ⬇ MP3
        </button>
      </div>
      {notice && <p className="notice notice--info">{notice}</p>}

      <h3>Capítulos</h3>
      <ol className="chapters">
        {p.book.chapters.map((c) => (
          <li key={c.id}>
            <button
              className="chapters__item"
              aria-current={c.id === p.chapter?.id ? 'true' : undefined}
              disabled={c.status !== 'ready'}
              onClick={() => p.goToChapter(c.id)}
            >
              {c.title}
              {c.status !== 'ready' && <small> · convertendo</small>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
