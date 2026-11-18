import { exportChapter, chapterFilename } from './share.js'

afterEach(() => {
  delete navigator.canShare
  delete navigator.share
})

test('chapterFilename is readable and safe', () => {
  expect(chapterFilename('Livro: Parte/1', 2, 'O "Deserto"?')).toBe('Livro Parte1 - 03 O Deserto.mp3')
})

test('uses the share sheet when files can be shared', async () => {
  navigator.canShare = vi.fn(() => true)
  navigator.share = vi.fn(async () => {})
  const result = await exportChapter({ blob: new Blob(['x'], { type: 'audio/mpeg' }), filename: 'a.mp3' })
  expect(result).toBe('shared')
  const { files } = navigator.share.mock.calls[0][0]
  expect(files[0].name).toBe('a.mp3')
  expect(files[0].type).toBe('audio/mpeg')
})

test('returns cancelled when the user dismisses the share sheet', async () => {
  navigator.canShare = () => true
  navigator.share = async () => {
    throw new DOMException('cancel', 'AbortError')
  }
  expect(await exportChapter({ blob: new Blob(['x']), filename: 'a.mp3' })).toBe('cancelled')
})

test('falls back to a download link', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  const clicks = []
  const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicks.push({ href: this.getAttribute('href'), download: this.download })
  })
  expect(await exportChapter({ blob: new Blob(['x']), filename: 'a.mp3' })).toBe('downloaded')
  expect(clicks).toEqual([{ href: 'blob:x', download: 'a.mp3' }])
  spy.mockRestore()
})
