import { formatDayMonth } from './format.js'

function statusText(book, progress) {
  switch (book.status) {
    case 'converting': {
      const p = progress?.total
        ? progress.done / progress.total
        : book.chapters.filter((c) => c.status === 'ready').length / book.chapters.length
      return `Convertendo... ${Math.floor(p * 100)}%`
    }
    case 'paused-quota':
      return `Pausado — cota do mês esgotada, continua em ${formatDayMonth(book.pausedUntil)}`
    case 'error':
      return book.errorMessage || 'Erro na conversão.'
    case 'audio-missing':
      return 'Áudio removido'
    default: {
      const i = book.chapters.findIndex((c) => c.id === book.position.chapterId)
      return `Cap. ${Math.max(i, 0) + 1} de ${book.chapters.length}`
    }
  }
}

export default function Library({ books, progress, hasKey, onOpen, onAddFile, onSettings, onRetry, onReconvert, children }) {
  return (
    <section className="screen">
      <header className="topbar">
        <h1>Meus Audiobooks</h1>
        <button className="icon-btn" aria-label="Configurações" onClick={onSettings}>
          ⚙
        </button>
      </header>

      {!hasKey && (
        <div className="banner">
          <p>Para converter, primeiro cole sua chave do Google Cloud.</p>
          <button className="btn" onClick={onSettings}>
            Configurar chave do Google
          </button>
        </div>
      )}

      {children}

      {books.length === 0 ? (
        <p className="empty">Nenhum livro ainda. Adicione um PDF para começar.</p>
      ) : (
        <ul className="book-list">
          {books.map((book) => (
            <li key={book.id} className={`book book--${book.status}`}>
              <button className="book__open" onClick={() => onOpen(book.id)}>
                <span className="book__title">{book.title}</span>
                <span className="book__status">{statusText(book, progress[book.id])}</span>
              </button>
              {book.status === 'error' && (
                <button className="btn btn--small" onClick={() => onRetry(book.id)}>
                  Tentar de novo
                </button>
              )}
              {book.status === 'audio-missing' && (
                <button className="btn btn--small" onClick={() => onReconvert(book.id)}>
                  Reconverter
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="btn btn--primary btn--add">
        + Adicionar PDF
        <input
          type="file"
          accept="application/pdf"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onAddFile(file)
          }}
        />
      </label>
    </section>
  )
}
