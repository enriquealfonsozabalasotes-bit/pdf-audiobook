import { render, screen, waitFor } from '@testing-library/react'
import Player from './Player.jsx'
import { makeAudio, makeStore } from '../test/fakes.js'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})

const book = {
  id: 'b', title: 'O Alquimista', createdAt: 1, voiceName: 'v', status: 'converting', speed: 1,
  chapters: [
    { id: 'c1', title: 'O Início', textLength: 1, status: 'ready' },
    { id: 'c2', title: 'O Deserto', textLength: 1, status: 'pending' },
  ],
  position: { chapterId: 'c1', timeSec: 0 },
}

test('shows the book, current chapter and controls', async () => {
  render(<Player bookId="b" onBack={() => {}} store={makeStore(book, { c1: new Blob(['x']) })} audio={makeAudio()} />)
  expect(await screen.findByRole('heading', { name: 'O Alquimista' })).toBeInTheDocument()
  expect(screen.getAllByText('O Início').length).toBeGreaterThan(0)
  for (const name of ['Voltar 30 segundos', 'Tocar', 'Avançar 30 segundos', 'Velocidade 1x', 'Baixar MP3']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
})

test('chapters without audio are shown as "convertendo" and not playable', async () => {
  render(<Player bookId="b" onBack={() => {}} store={makeStore(book, { c1: new Blob(['x']) })} audio={makeAudio()} />)
  const item = await screen.findByRole('button', { name: /O Deserto/ })
  await waitFor(() => expect(item).toBeDisabled())
  expect(item).toHaveTextContent('convertendo')
})
