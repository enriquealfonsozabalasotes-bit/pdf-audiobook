import { render, screen } from '@testing-library/react'
import App from './App.jsx'

test('shows the library title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Meus Audiobooks' })).toBeInTheDocument()
})
