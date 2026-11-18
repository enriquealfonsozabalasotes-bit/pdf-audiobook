import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportReview from './ImportReview.jsx'

const draft = {
  title: 'Meu Livro',
  chapters: [
    { title: 'Capítulo 1', text: 'a', chars: 60_000, selected: true },
    { title: 'Capítulo 2', text: 'b', chars: 30_000, selected: true },
  ],
}
const props = (over) => ({ draft, usedThisMonth: 0, limit: 1_000_000, onConfirm: vi.fn(), onCancel: vi.fn(), ...over })

test('shows chars, estimated minutes and share of the monthly free quota', () => {
  render(<ImportReview {...props()} />)
  expect(screen.getByText('90.000 caracteres')).toBeInTheDocument()
  expect(screen.getByText('≈ 100 min de áudio')).toBeInTheDocument()
  expect(screen.getByText('usa 9% da cota grátis do mês')).toBeInTheDocument()
  expect(screen.queryByText(/vai pausar/)).not.toBeInTheDocument()
})

test('unchecking a chapter updates the totals', async () => {
  render(<ImportReview {...props()} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /Capítulo 1/ }))
  expect(screen.getByText('30.000 caracteres')).toBeInTheDocument()
  expect(screen.getByText('usa 3% da cota grátis do mês')).toBeInTheDocument()
})

test('warns when the book exceeds the remaining quota', () => {
  render(<ImportReview {...props({ usedThisMonth: 900_000 })} />)
  expect(screen.getByText('A conversão vai pausar e continuar no próximo mês.')).toBeInTheDocument()
})

test('confirm passes the edited title and selection', async () => {
  const onConfirm = vi.fn()
  render(<ImportReview {...props({ onConfirm })} />)
  const title = screen.getByLabelText('Título')
  await userEvent.clear(title)
  await userEvent.type(title, 'Novo')
  await userEvent.click(screen.getByRole('checkbox', { name: /Capítulo 2/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Converter' }))
  expect(onConfirm).toHaveBeenCalledWith({
    title: 'Novo',
    chapters: [
      { ...draft.chapters[0], selected: true },
      { ...draft.chapters[1], selected: false },
    ],
  })
})

test('converter is disabled with nothing selected', async () => {
  render(<ImportReview {...props()} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /Capítulo 1/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /Capítulo 2/ }))
  expect(screen.getByRole('button', { name: 'Converter' })).toBeDisabled()
})
