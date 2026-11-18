import { useCallback, useEffect, useState } from 'react'
import * as store from '../store/db.js'
import { synthesize, testKey } from '../tts/google.js'
import { DEFAULT_VOICE, FREE_TIER_CHARS, VOICES, quotaPoolOf } from '../tts/voices.js'
import { canSend, monthKey } from '../quota/quota.js'
import { countChars } from '../text/chunk.js'
import { errorMessage } from '../convert/converter.js'
import { removeAudio } from '../import/manage.js'
import { SPEEDS } from './usePlayer.js'
import { formatNumber } from './format.js'

const PREVIEW_TEXT = 'Olá! Esta é a minha voz.'
const mask = (key) => `••••••••${key.slice(-4)}`
const formatMB = (bytes) => `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

function defaultPlayBlob(blob) {
  const url = URL.createObjectURL(blob)
  const a = new Audio(url)
  a.addEventListener('ended', () => URL.revokeObjectURL(url))
  a.play().catch(() => {})
}

export default function Settings({
  onBack,
  onChanged = () => {},
  now = () => new Date(),
  testKeyImpl = testKey,
  synthesizeImpl = synthesize,
  playBlob = defaultPlayBlob,
}) {
  const [settings, setSettings] = useState(null)
  const [usage, setUsage] = useState(0)
  const [keyInput, setKeyInput] = useState('')
  const [keyStatus, setKeyStatus] = useState(null)
  const [previewStatus, setPreviewStatus] = useState(null)
  const [books, setBooks] = useState([])
  const [usageInput, setUsageInput] = useState('')

  const pool = quotaPoolOf(settings?.voiceName)
  const limit = FREE_TIER_CHARS[pool]

  const load = useCallback(async () => {
    const s = await store.getSettings()
    setSettings(s)
    setUsage(await store.getUsage(monthKey(now()), quotaPoolOf(s.voiceName)))
    const list = await store.listBooks()
    setBooks(await Promise.all(list.map(async (b) => ({ ...b, bytes: await store.bookStorageBytes(b.id) }))))
  }, [now])

  useEffect(() => {
    load()
  }, [load])

  const save = async (partial) => {
    setSettings(await store.saveSettings(partial))
    onChanged()
  }

  /** Calls Google only if it fits in the free tier, and counts the characters. */
  const guarded = async (text, call) => {
    const month = monthKey(now())
    if (!canSend(await store.getUsage(month, pool), countChars(text), limit)) throw new Error('Cota grátis do mês esgotada.')
    const result = await call()
    setUsage(await store.addUsage(month, pool, countChars(text)))
    return result
  }

  const runTest = async () => {
    setKeyStatus('Testando…')
    try {
      await guarded('Teste.', () => testKeyImpl({ apiKey: settings.apiKey }))
      setKeyStatus('Chave OK')
    } catch (err) {
      setKeyStatus(err.kind ? errorMessage(err.kind) : err.message)
    }
  }

  const preview = async () => {
    setPreviewStatus(null)
    try {
      const voiceName = settings.voiceName || DEFAULT_VOICE
      const blob = await guarded(PREVIEW_TEXT, () => synthesizeImpl({ text: PREVIEW_TEXT, voiceName, apiKey: settings.apiKey }))
      playBlob(blob)
    } catch (err) {
      setPreviewStatus(err.kind ? errorMessage(err.kind) : err.message)
    }
  }

  const deleteAudio = async (b) => {
    if (!window.confirm(`Apagar o áudio de "${b.title}"? O texto fica guardado para reconverter depois.`)) return
    await removeAudio(b.id, { store })
    await load()
    onChanged()
  }

  const deleteBook = async (b) => {
    if (!window.confirm(`Excluir "${b.title}" e todo o seu áudio?`)) return
    await store.deleteBook(b.id)
    await load()
    onChanged()
  }

  if (!settings) return <section className="screen" aria-busy="true" />

  return (
    <section className="screen settings">
      <header className="topbar">
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}>
          ←
        </button>
        <h1>Configurações</h1>
      </header>

      <h2>Chave do Google</h2>
      {settings.apiKey && <p className="mono">{mask(settings.apiKey)}</p>}
      <label className="field">
        <span>Chave da API do Google</span>
        <input
          type="password"
          autoComplete="off"
          value={keyInput}
          placeholder={settings.apiKey ? 'Colar nova chave' : 'AIza…'}
          onChange={(e) => setKeyInput(e.target.value)}
        />
      </label>
      <div className="row">
        <button
          className="btn btn--primary"
          disabled={!keyInput.trim()}
          onClick={async () => {
            await save({ apiKey: keyInput.trim() })
            setKeyInput('')
            setKeyStatus(null)
          }}
        >
          Salvar chave
        </button>
        <button className="btn" disabled={!settings.apiKey} onClick={runTest}>
          Testar
        </button>
      </div>
      {keyStatus && <p className="notice notice--info">{keyStatus}</p>}
      <p className="hint">Veja no README como criar e restringir a chave.</p>

      <h2>Voz</h2>
      <label className="field">
        <span>Voz</span>
        <select value={settings.voiceName || DEFAULT_VOICE} onChange={(e) => save({ voiceName: e.target.value })}>
          {VOICES.map((v) => (
            <option key={v.name} value={v.name}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" disabled={!settings.apiKey} onClick={preview}>
        Ouvir amostra
      </button>
      {previewStatus && <p className="notice notice--error">{previewStatus}</p>}

      <label className="field">
        <span>Velocidade padrão</span>
        <select value={String(settings.defaultSpeed)} onChange={(e) => save({ defaultSpeed: Number(e.target.value) })}>
          {SPEEDS.map((s) => (
            <option key={s} value={String(s)}>
              {String(s).replace('.', ',')}x
            </option>
          ))}
        </select>
      </label>

      <h2>Uso do mês</h2>
      <p>
        {formatNumber(usage)} de {formatNumber(limit)} caracteres grátis
      </p>
      <p className="hint">O app pausa a conversão antes de passar de 95% da cota grátis.</p>
      <p className="hint">
        Se o iPhone apagou os dados do app neste mês, o contador zerou. Informe quanto já foi usado (veja no Google
        Cloud em Faturamento → Relatórios).
      </p>
      <label className="field">
        <span>Já usado este mês (caracteres)</span>
        <input inputMode="numeric" value={usageInput} onChange={(e) => setUsageInput(e.target.value.replace(/\D/g, ''))} />
      </label>
      <button
        className="btn"
        disabled={!usageInput}
        onClick={async () => {
          const value = Number(usageInput)
          await store.setUsage(monthKey(now()), pool, value)
          setUsage(value)
          setUsageInput('')
          onChanged()
        }}
      >
        Corrigir uso
      </button>

      <h2>Armazenamento</h2>
      {books.some((b) => b.status === 'converting') && (
        <p className="hint">Livros em conversão não podem ser apagados até a conversão terminar ou pausar.</p>
      )}
      {books.length === 0 ? (
        <p className="hint">Nenhum livro salvo.</p>
      ) : (
        <ul className="storage">
          {books.map((b) => (
            <li key={b.id}>
              <span>
                {b.title} <small>{formatMB(b.bytes)}</small>
              </span>
              <span className="row">
                <button
                  className="btn btn--small"
                  aria-label={`Apagar áudio de ${b.title}`}
                  disabled={b.status === 'converting'}
                  onClick={() => deleteAudio(b)}
                >
                  Apagar áudio
                </button>
                <button
                  className="btn btn--small btn--danger"
                  aria-label={`Excluir ${b.title}`}
                  disabled={b.status === 'converting'}
                  onClick={() => deleteBook(b)}
                >
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
