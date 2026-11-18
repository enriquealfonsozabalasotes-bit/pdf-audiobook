import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import * as store from '../store/db.js'
import Settings from './Settings.jsx'
import { TtsError } from '../tts/google.js'
import { FREE_TIER_CHARS } from '../tts/voices.js'

const NOW = new Date(Date.UTC(2026, 10, 18, 15))

beforeEach(() => {
  store.closeDb()
  globalThis.indexedDB = new IDBFactory()
})

const renderSettings = (over = {}) => {
  const props = {
    onBack: vi.fn(),
    onChanged: vi.fn(),
    now: () => NOW,
    testKeyImpl: vi.fn(async () => new Blob(['x'])),
    synthesizeImpl: vi.fn(async () => new Blob(['x'])),
    playBlob: vi.fn(),
    ...over,
  }
  render(<Settings {...props} />)
  return props
}

test('saves the API key and shows it masked', async () => {
  const props = renderSettings()
  await userEvent.type(await screen.findByLabelText('Chave da API do Google'), 'AIzaSecret1234')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar chave' }))
  await waitFor(async () => expect((await store.getSettings()).apiKey).toBe('AIzaSecret1234'))
  expect(await screen.findByText('••••••••1234')).toBeInTheDocument()
  expect(screen.queryByText('AIzaSecret1234')).not.toBeInTheDocument()
  expect(props.onChanged).toHaveBeenCalled()
})

test('"Testar" shows "Chave OK"', async () => {
  await store.saveSettings({ apiKey: 'K' })
  const props = renderSettings()
  await userEvent.click(await screen.findByRole('button', { name: 'Testar' }))
  expect(await screen.findByText('Chave OK')).toBeInTheDocument()
  expect(props.testKeyImpl).toHaveBeenCalledWith({ apiKey: 'K' })
  expect(await store.getUsage('2026-11', 'free')).toBe(6) // "Teste."
})

test('"Testar" shows the auth error message', async () => {
  await store.saveSettings({ apiKey: 'K' })
  renderSettings({ testKeyImpl: async () => { throw new TtsError('auth', 'x', { status: 403 }) } })
  await userEvent.click(await screen.findByRole('button', { name: 'Testar' }))
  expect(await screen.findByText('Chave do Google inválida ou API Text-to-Speech não ativada.')).toBeInTheDocument()
})

test('voice picker lists pt-BR voices, saves the choice and plays a preview', async () => {
  await store.saveSettings({ apiKey: 'K' })
  const props = renderSettings()
  const select = await screen.findByLabelText('Voz')
  await userEvent.selectOptions(select, 'pt-BR-Neural2-B')
  await waitFor(async () => expect((await store.getSettings()).voiceName).toBe('pt-BR-Neural2-B'))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvir amostra' }))
  await waitFor(() => expect(props.playBlob).toHaveBeenCalled())
  expect(props.synthesizeImpl).toHaveBeenCalledWith({ text: 'Olá! Esta é a minha voz.', voiceName: 'pt-BR-Neural2-B', apiKey: 'K' })
  expect(await store.getUsage('2026-11', 'free')).toBe(24)
})

test('preview is blocked when the free quota is used up', async () => {
  await store.saveSettings({ apiKey: 'K' })
  await store.addUsage('2026-11', 'free', FREE_TIER_CHARS.free * 0.95)
  const props = renderSettings()
  await userEvent.click(await screen.findByRole('button', { name: 'Ouvir amostra' }))
  expect(await screen.findByText('Cota grátis do mês esgotada.')).toBeInTheDocument()
  expect(props.synthesizeImpl).not.toHaveBeenCalled()
})

test("shows this month's usage", async () => {
  await store.addUsage('2026-11', 'free', 123_456)
  renderSettings()
  expect(await screen.findByText('123.456 de 1.000.000 caracteres grátis')).toBeInTheDocument()
})

test('default speed is saved', async () => {
  renderSettings()
  await userEvent.selectOptions(await screen.findByLabelText('Velocidade padrão'), '1.5')
  await waitFor(async () => expect((await store.getSettings()).defaultSpeed).toBe(1.5))
})

test('storage list allows deleting audio or the whole book', async () => {
  const chapters = [{ id: 'c1', title: 'C', textLength: 1, status: 'ready' }]
  await store.saveBook({ id: 'b', title: 'Livro', createdAt: 1, voiceName: 'v', status: 'ready', chapters, position: { chapterId: 'c1', timeSec: 0 }, speed: 1 })
  await store.saveChapterText('b', 'c1', 'texto')
  window.confirm = vi.fn(() => true)
  const props = renderSettings()
  await userEvent.click(await screen.findByRole('button', { name: 'Apagar áudio de Livro' }))
  await waitFor(async () => expect((await store.getBook('b')).status).toBe('audio-missing'))
  await userEvent.click(screen.getByRole('button', { name: 'Excluir Livro' }))
  await waitFor(async () => expect(await store.getBook('b')).toBeUndefined())
  expect(props.onChanged).toHaveBeenCalled()
})

test('the month usage can be corrected by hand after data loss', async () => {
  const props = renderSettings()
  const input = await screen.findByLabelText('Já usado este mês (caracteres)')
  await userEvent.clear(input)
  await userEvent.type(input, '400000')
  await userEvent.click(screen.getByRole('button', { name: 'Corrigir uso' }))
  await waitFor(async () => expect(await store.getUsage('2026-11', 'free')).toBe(400_000))
  expect(await screen.findByText('400.000 de 1.000.000 caracteres grátis')).toBeInTheDocument()
  expect(props.onChanged).toHaveBeenCalled()
})

test('audio of a book being converted cannot be deleted', async () => {
  const chapters = [{ id: 'c1', title: 'C', textLength: 1, status: 'pending' }]
  await store.saveBook({ id: 'b', title: 'Livro', createdAt: 1, voiceName: 'v', status: 'converting', chapters, position: { chapterId: 'c1', timeSec: 0 }, speed: 1 })
  renderSettings()
  expect(await screen.findByRole('button', { name: 'Apagar áudio de Livro' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Excluir Livro' })).toBeDisabled()
})
