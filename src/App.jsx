import { useCallback, useEffect, useState } from 'react'
import * as store from './store/db.js'
import { buildDraft, createBook } from './import/importBook.js'
import { monthKey } from './quota/quota.js'
import { DEFAULT_VOICE, FREE_TIER_CHARS } from './tts/voices.js'
import Library from './ui/Library.jsx'
import ImportReview from './ui/ImportReview.jsx'
import Player from './ui/Player.jsx'
import Settings from './ui/Settings.jsx'
import { reconvertBook } from './import/manage.js'
import { useConversion } from './ui/useConversion.js'

export default function App() {
  const [screen, setScreen] = useState({ name: 'library' })
  const [books, setBooks] = useState([])
  const [settings, setSettings] = useState(null)
  const [usage, setUsage] = useState(0)
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState(null) // { kind: 'info' | 'error', text }
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [b, s, u] = await Promise.all([store.listBooks(), store.getSettings(), store.getUsage(monthKey(new Date()), 'free')])
    setBooks(b)
    setSettings(s)
    setUsage(u)
  }, [])

  useEffect(() => {
    refresh()
    store.requestPersistence()
  }, [refresh])

  const progress = useConversion({ books, apiKey: settings?.apiKey, refresh })

  const addFile = async (file) => {
    setNotice({ kind: 'info', text: 'Lendo o PDF…' })
    try {
      setDraft(await buildDraft(file))
      setNotice(null)
      setScreen({ name: 'import' })
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    }
  }

  const confirmImport = async (edited) => {
    setBusy(true)
    try {
      await createBook(edited, { voiceName: settings?.voiceName || DEFAULT_VOICE, store })
      setDraft(null)
      setScreen({ name: 'library' })
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const retry = async (id) => {
    const book = await store.getBook(id)
    const { errorMessage, ...rest } = book
    await store.saveBook({ ...rest, status: 'converting' })
    await refresh()
  }

  if (screen.name === 'import' && draft) {
    return (
      <main className="app">
        {notice && <p className={`notice notice--${notice.kind}`}>{notice.text}</p>}
        <ImportReview
          draft={draft}
          usedThisMonth={usage}
          limit={FREE_TIER_CHARS.free}
          busy={busy}
          onCancel={() => {
            setDraft(null)
            setScreen({ name: 'library' })
          }}
          onConfirm={confirmImport}
        />
      </main>
    )
  }

  if (screen.name === 'settings') {
    return (
      <main className="app">
        <Settings onBack={() => setScreen({ name: 'library' })} onChanged={refresh} />
      </main>
    )
  }

  if (screen.name === 'player') {
    return (
      <main className="app">
        <Player
          key={screen.bookId}
          bookId={screen.bookId}
          onBack={() => {
            setScreen({ name: 'library' })
            refresh()
          }}
        />
      </main>
    )
  }

  return (
    <main className="app">
      <Library
        books={books}
        progress={progress}
        hasKey={settings ? Boolean(settings.apiKey) : true}
        onOpen={(id) => setScreen({ name: 'player', bookId: id })}
        onAddFile={addFile}
        onSettings={() => setScreen({ name: 'settings' })}
        onRetry={retry}
        onReconvert={async (id) => {
          await reconvertBook(id, { store })
          await refresh()
        }}
      >
        {notice && <p className={`notice notice--${notice.kind}`}>{notice.text}</p>}
      </Library>
    </main>
  )
}
