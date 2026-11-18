import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Library from './Library.jsx'

const chapters = (n, ready = n) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, title: `C${i}`, textLength: 10, status: i < ready ? 'ready' : 'pending' }))
const book = (over) => ({
  id: 'b', title: 'O Alquimista', createdAt: 1, voiceName: 'v', status: 'ready',
  chapters: chapters(12), position: { chapterId: 'c2', timeSec: 0 }, speed: 1, ...over,
})
const props = (over) => ({ books: [], progress: {}, hasKey: true, onOpen: vi.fn(), onAddFile: vi.fn(), onSettings: vi.fn(), onRetry: vi.fn(), ...over })

test('ready book shows the current chapter', () => {
  render(<Library {...props({ books: [book()] })} />)
  expect(screen.getByText('O Alquimista')).toBeInTheDocument()
  expect(screen.getByText('Cap. 3 de 12')).toBeInTheDocument()
})

test('converting book shows live progress percentage', () => {
  render(<Library {...props({ books: [book({ status: 'converting' })], progress: { b: { done: 3, total: 10 } } })} />)
  expect(screen.getByText('Convertendo... 30%')).toBeInTheDocument()
})

test('converting book without live progress uses ready chapters', () => {
  render(<Library {...props({ books: [book({ status: 'converting', chapters: chapters(4, 1) })] })} />)
  expect(screen.getByText('Convertendo... 25%')).toBeInTheDocument()
})

test('paused book shows when it continues', () => {
  render(<Library {...props({ books: [book({ status: 'paused-quota', pausedUntil: '2026-12-01' })] })} />)
  expect(screen.getByText('Pausado — cota do mês esgotada, continua em 01/12')).toBeInTheDocument()
})

test('error book shows the message and a retry button', async () => {
  const onRetry = vi.fn()
  render(<Library {...props({ onRetry, books: [book({ status: 'error', errorMessage: 'Sem conexão.' })] })} />)
  expect(screen.getByText('Sem conexão.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(onRetry).toHaveBeenCalledWith('b')
})

test('opening a book calls onOpen', async () => {
  const onOpen = vi.fn()
  render(<Library {...props({ onOpen, books: [book()] })} />)
  await userEvent.click(screen.getByRole('button', { name: /O Alquimista/ }))
  expect(onOpen).toHaveBeenCalledWith('b')
})

test('shows "+ Adicionar PDF" file input accepting application/pdf', async () => {
  const onAddFile = vi.fn()
  render(<Library {...props({ onAddFile })} />)
  const input = screen.getByLabelText('+ Adicionar PDF')
  expect(input).toHaveAttribute('accept', 'application/pdf')
  const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })
  await userEvent.upload(input, file)
  expect(onAddFile).toHaveBeenCalledWith(file)
})

test('asks for the API key first when settings have none', async () => {
  const onSettings = vi.fn()
  render(<Library {...props({ hasKey: false, onSettings })} />)
  await userEvent.click(screen.getByRole('button', { name: 'Configurar chave do Google' }))
  expect(onSettings).toHaveBeenCalled()
})

test('empty library shows a hint', () => {
  render(<Library {...props()} />)
  expect(screen.getByText(/Nenhum livro ainda/)).toBeInTheDocument()
})
