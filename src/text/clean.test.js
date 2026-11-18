import { cleanPages } from './clean.js'

const item = (str, x, y, fontSize = 10) => ({ str, x, y, width: str.length * fontSize * 0.5, fontSize })
const page = (items, pageIndex = 0) => ({ pageIndex, width: 600, height: 800, items })
// body lines at 12pt spacing starting at y
const body = (lines, y0 = 700, x = 50) => lines.map((t, i) => item(t, x, y0 - i * 12))

test('groups items on the same y into one line, top to bottom', () => {
  const [out] = cleanPages([page([item('Fim.', 10, 688), item('mundo', 40, 700), item('Olá', 10, 700)])])
  expect(out).toBe('Olá mundo Fim.')
})

test('drops lines repeated at top or bottom of most pages', () => {
  const pages = [0, 1, 2, 3].map((i) =>
    page([item('MEU LIVRO', 250, 780), ...body([`Texto da página ${i}.`, 'Mais texto aqui.'])], i),
  )
  const out = cleanPages(pages)
  expect(out.join(' ')).not.toContain('MEU LIVRO')
  expect(out[2]).toBe('Texto da página 2. Mais texto aqui.')
})

test('keeps a top line that does not repeat', () => {
  const titles = ['Introdução', 'O deserto', 'A volta', 'Fim da jornada']
  const pages = titles.map((t, i) => page([item(t, 50, 780), ...body(['Corpo.'])], i))
  expect(cleanPages(pages)[1]).toBe('O deserto Corpo.')
})

test('drops page-number-only lines', () => {
  const pages = ['12', '- 13 -', 'Página 14'].map((n, i) => page([...body(['Conteúdo.']), item(n, 300, 30)], i))
  expect(cleanPages(pages)).toEqual(['Conteúdo.', 'Conteúdo.', 'Conteúdo.'])
})

test('joins hyphenated line breaks', () => {
  const [out] = cleanPages([page(body(['Um exem-', 'plo de texto.']))])
  expect(out).toBe('Um exemplo de texto.')
})

test('reads two columns left then right', () => {
  const items = []
  for (let i = 0; i < 5; i++) {
    items.push(item(`esquerda${i}`, 50, 700 - i * 12))
    items.push(item(`direita${i}`, 320, 700 - i * 12))
  }
  const [out] = cleanPages([page(items)])
  expect(out).toBe('esquerda0 esquerda1 esquerda2 esquerda3 esquerda4 direita0 direita1 direita2 direita3 direita4')
})

test('drops small-font footnote lines at page bottom', () => {
  const [out] = cleanPages([page([...body(['Texto principal.', 'Segunda linha.']), item('1 Ver capítulo 2.', 50, 60, 7)])])
  expect(out).toBe('Texto principal. Segunda linha.')
})

test('drops superscript footnote markers', () => {
  const [out] = cleanPages([page([item('Uma frase', 50, 700), item('1', 96, 704, 6), item('com nota² final.', 102, 700)])])
  expect(out).toBe('Uma frase com nota final.')
})

test('replaces URLs with the word link', () => {
  const [out] = cleanPages([page(body(['veja https://ex.com/a?b=1 agora e www.site.com.br também']))])
  expect(out).toBe('veja link agora e link também')
})

test('keeps paragraph breaks on large vertical gaps', () => {
  const items = [...body(['Primeiro parágrafo.', 'continua.'], 700), ...body(['Segundo parágrafo.', 'fim.'], 640)]
  const [out] = cleanPages([page(items)])
  expect(out).toBe('Primeiro parágrafo. continua.\n\nSegundo parágrafo. fim.')
})

test('returns an empty string for a page without text', () => {
  expect(cleanPages([page([])])).toEqual([''])
})
