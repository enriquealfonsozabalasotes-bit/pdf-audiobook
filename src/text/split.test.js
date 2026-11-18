import { splitChapters, TARGET_PART_CHARS } from './split.js'

test('one chapter per outline entry, by page', () => {
  const out = splitChapters(['a', 'b', 'c', 'd'], [{ title: 'Um', pageIndex: 0 }, { title: 'Dois', pageIndex: 2 }])
  expect(out).toEqual([{ title: 'Um', text: 'a\n\nb' }, { title: 'Dois', text: 'c\n\nd' }])
})

test('pages before the first outline entry become "Início"', () => {
  const out = splitChapters(['capa', 'x', 'y'], [{ title: 'Cap 1', pageIndex: 1 }])
  expect(out).toEqual([{ title: 'Início', text: 'capa' }, { title: 'Cap 1', text: 'x\n\ny' }])
})

test('sorts entries and merges entries pointing to the same page', () => {
  const out = splitChapters(['p0', 'p1', 'p2'], [
    { title: 'B', pageIndex: 2 },
    { title: 'A', pageIndex: 0 },
    { title: 'B2', pageIndex: 2 },
  ])
  expect(out.map((c) => c.title)).toEqual(['A', 'B'])
  expect(out[1].text).toBe('p2')
})

test('skips chapters with empty text', () => {
  const out = splitChapters(['', 'b'], [{ title: 'Vazio', pageIndex: 0 }, { title: 'Cheio', pageIndex: 1 }])
  expect(out).toEqual([{ title: 'Cheio', text: 'b' }])
})

test('ignores outline entries beyond the last page', () => {
  const out = splitChapters(['a'], [{ title: 'A', pageIndex: 0 }, { title: 'Fora', pageIndex: 9 }])
  expect(out).toEqual([{ title: 'A', text: 'a' }])
})

test('without outline, splits into parts of ~9000 chars at paragraph boundaries titled "Parte N"', () => {
  const para = 'x'.repeat(999) + '.'
  const pages = [Array(15).fill(para).join('\n\n'), Array(15).fill(para).join('\n\n')]
  const out = splitChapters(pages, [])
  expect(TARGET_PART_CHARS).toBe(9000)
  expect(out.map((c) => c.title)).toEqual(['Parte 1', 'Parte 2', 'Parte 3', 'Parte 4'])
  for (const c of out) expect(c.text.length).toBeLessThanOrEqual(9000 + 1000 + 20)
  expect(out.map((c) => c.text).join('\n\n').split('\n\n')).toHaveLength(30)
})

test('without outline, a short text is a single part', () => {
  expect(splitChapters(['curto'], [])).toEqual([{ title: 'Parte 1', text: 'curto' }])
})
