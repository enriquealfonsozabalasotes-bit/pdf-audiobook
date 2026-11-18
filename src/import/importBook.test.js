// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import * as store from '../store/db.js'
import { buildDraft, createBook } from './importBook.js'
import { PdfError } from '../pdf/extract.js'

beforeEach(() => {
  store.closeDb()
  globalThis.indexedDB = new IDBFactory()
})

const item = (str, y) => ({ str, x: 50, y, width: str.length * 5, fontSize: 10 })
const fakeFile = (name) => ({ name, arrayBuffer: async () => new ArrayBuffer(4) })

test('buildDraft uses filename as title when metadata is empty', async () => {
  const extract = async () => ({ title: null, pages: [{ pageIndex: 0, width: 600, height: 800, items: [item('Olá.', 700)] }], outline: [] })
  const draft = await buildDraft(fakeFile('apostila.pdf'), { extract })
  expect(draft).toEqual({ title: 'apostila', chapters: [{ title: 'Parte 1', text: 'Olá.', chars: 4, selected: true }] })
})

test('buildDraft prefers the PDF metadata title', async () => {
  const extract = async () => ({ title: 'O Livro', pages: [{ pageIndex: 0, width: 600, height: 800, items: [item('x', 700)] }], outline: [] })
  expect((await buildDraft(fakeFile('a.PDF'), { extract })).title).toBe('O Livro')
})

test('buildDraft surfaces NO_TEXT as "Este PDF não tem texto selecionável."', async () => {
  const extract = async () => {
    throw new PdfError('NO_TEXT', 'Este PDF não tem texto selecionável.')
  }
  await expect(buildDraft(fakeFile('scan.pdf'), { extract })).rejects.toThrow('Este PDF não tem texto selecionável.')
})

test('buildDraft rejects when cleaning leaves nothing to read', async () => {
  const extract = async () => ({ title: null, pages: [{ pageIndex: 0, width: 600, height: 800, items: [item('12', 30)] }], outline: [] })
  await expect(buildDraft(fakeFile('x.pdf'), { extract })).rejects.toThrow('Este PDF não tem texto selecionável.')
})

test('createBook stores only selected chapters and their chunks', async () => {
  const draft = {
    title: 'Livro',
    chapters: [
      { title: 'Sumário', text: 'Índice.', chars: 7, selected: false },
      { title: 'Cap 1', text: 'Frase um. Frase dois.', chars: 21, selected: true },
    ],
  }
  await store.saveSettings({ defaultSpeed: 1.25 })
  const book = await createBook(draft, { voiceName: 'pt-BR-Neural2-B', store, now: () => 5 })
  expect(book).toMatchObject({
    title: 'Livro', createdAt: 5, voiceName: 'pt-BR-Neural2-B', status: 'converting', speed: 1.25,
    chapters: [{ title: 'Cap 1', textLength: 21, status: 'pending' }],
  })
  const chapterId = book.chapters[0].id
  expect(book.position).toEqual({ chapterId, timeSec: 0 })
  expect(await store.getBook(book.id)).toEqual(book)
  expect(await store.getChapterText(book.id, chapterId)).toBe('Frase um. Frase dois.')
  expect((await store.getChunks(book.id, chapterId)).map((c) => [c.text, c.status])).toEqual([['Frase um. Frase dois.', 'pending']])
})

test('createBook rejects a draft with no selected chapter', async () => {
  const draft = { title: 'L', chapters: [{ title: 'A', text: 'a', chars: 1, selected: false }] }
  await expect(createBook(draft, { voiceName: 'v', store })).rejects.toThrow('Selecione pelo menos um capítulo.')
})
