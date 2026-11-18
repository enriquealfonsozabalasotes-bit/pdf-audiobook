import { useState } from 'react'
import { SAFETY } from '../quota/quota.js'
import { CHARS_PER_MINUTE, formatNumber } from './format.js'

export default function ImportReview({ draft, usedThisMonth, limit, onConfirm, onCancel, busy = false }) {
  const [title, setTitle] = useState(draft.title)
  const [chapters, setChapters] = useState(draft.chapters)

  const chars = chapters.filter((c) => c.selected).reduce((n, c) => n + c.chars, 0)
  const remaining = Math.max(0, limit * SAFETY - usedThisMonth)
  const toggle = (i) => setChapters((cs) => cs.map((c, j) => (j === i ? { ...c, selected: !c.selected } : c)))

  return (
    <section className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label="Voltar" onClick={onCancel}>
          ←
        </button>
        <h1>Novo audiobook</h1>
      </header>

      <label className="field">
        <span>Título</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <div className="summary">
        <p className="summary__big">{formatNumber(chars)} caracteres</p>
        <p>≈ {Math.round(chars / CHARS_PER_MINUTE)} min de áudio</p>
        <p>usa {Math.round((chars / limit) * 100)}% da cota grátis do mês</p>
        {chars > remaining && <p className="warn">A conversão vai pausar e continuar no próximo mês.</p>}
      </div>

      <h2>Capítulos</h2>
      <p className="hint">Desmarque o que não quer ouvir (sumário, bibliografia…) para economizar cota.</p>
      <ul className="chapter-pick">
        {chapters.map((c, i) => (
          <li key={i}>
            <label>
              <input type="checkbox" checked={c.selected} onChange={() => toggle(i)} />
              <span>{c.title}</span>
              <small>{formatNumber(c.chars)}</small>
            </label>
          </li>
        ))}
      </ul>

      <button className="btn btn--primary" disabled={chars === 0 || busy} onClick={() => onConfirm({ title, chapters })}>
        Converter
      </button>
    </section>
  )
}
