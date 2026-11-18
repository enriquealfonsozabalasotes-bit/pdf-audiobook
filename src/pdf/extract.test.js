// @vitest-environment node
import { extractPdf, resolveOutline, PdfError } from './extract.js'
import { makePdf } from '../test/makePdf.js'

test('returns positioned items per page', async () => {
  const data = await makePdf([[{ text: 'Primeira página', x: 50, y: 700, size: 12 }], [{ text: 'Segunda', x: 50, y: 700, size: 12 }]])
  const { pages } = await extractPdf(data)
  expect(pages).toHaveLength(2)
  expect(pages[0]).toMatchObject({ pageIndex: 0, width: 600, height: 800 })
  const it = pages[0].items[0]
  expect(it.str).toBe('Primeira página')
  expect(it.x).toBeCloseTo(50, 0)
  expect(it.y).toBeCloseTo(700, 0)
  expect(it.fontSize).toBeCloseTo(12, 0)
  expect(it.width).toBeGreaterThan(0)
})

test('returns metadata title', async () => {
  const data = await makePdf([[{ text: 'x', x: 50, y: 700, size: 12 }]], { title: 'Meu Livro' })
  expect((await extractPdf(data)).title).toBe('Meu Livro')
})

test('returns null title when metadata has none', async () => {
  const data = await makePdf([[{ text: 'x', x: 50, y: 700, size: 12 }]])
  expect((await extractPdf(data)).title).toBeNull()
})

test('throws NO_TEXT when no page has text', async () => {
  const data = await makePdf([[], []])
  await expect(extractPdf(data)).rejects.toMatchObject({ name: 'PdfError', code: 'NO_TEXT' })
})

test('throws INVALID for non-PDF bytes', async () => {
  const data = new TextEncoder().encode('isto não é um pdf').buffer
  await expect(extractPdf(data)).rejects.toBeInstanceOf(PdfError)
  await expect(extractPdf(data)).rejects.toMatchObject({ code: 'INVALID' })
})

test('throws ENCRYPTED for a password-protected PDF', async () => {
  const fakeLib = { getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })) }) }
  await expect(extractPdf(new ArrayBuffer(8), { lib: fakeLib })).rejects.toMatchObject({ code: 'ENCRYPTED' })
})

test('maps outline destinations to page indices, top level only', async () => {
  const refs = [{ num: 10 }, { num: 11 }, { num: 12 }]
  const doc = {
    getOutline: async () => [
      { title: 'A', dest: [refs[0], { name: 'XYZ' }] },
      { title: 'B', dest: 'named', items: [{ title: 'B.1', dest: [refs[1]] }] },
      { title: 'Quebrado', dest: 'nao-existe' },
      { title: 'Url', dest: null, url: 'http://x' },
    ],
    getDestination: async (name) => (name === 'named' ? [refs[2]] : null),
    getPageIndex: async (ref) => refs.indexOf(ref),
  }
  expect(await resolveOutline(doc)).toEqual([
    { title: 'A', pageIndex: 0 },
    { title: 'B', pageIndex: 2 },
  ])
})

test('no outline gives empty list', async () => {
  expect(await resolveOutline({ getOutline: async () => null })).toEqual([])
})
