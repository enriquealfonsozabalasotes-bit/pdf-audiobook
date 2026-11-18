import { chunkText, countChars, MAX_CHUNK_BYTES, MAX_SENTENCE_CHARS } from './chunk.js'

const bytes = (s) => new TextEncoder().encode(s).length

test('every chunk is ≤ maxBytes in UTF-8', () => {
  const text = 'A ação é boa. '.repeat(1500)
  const chunks = chunkText(text)
  expect(MAX_CHUNK_BYTES).toBe(5000)
  expect(chunks.length).toBeGreaterThan(1)
  for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(5000)
})

test('splits at sentence boundaries when possible', () => {
  const text = 'Esta é uma frase de exemplo! E outra? Sim. '.repeat(300)
  const chunks = chunkText(text, 1000)
  for (const c of chunks.slice(0, -1)) expect(c).toMatch(/[.!?…]$/)
})

test('a single sentence longer than the limit is split at word boundaries', () => {
  const text = 'palavra '.repeat(1500).trim()
  const chunks = chunkText(text)
  expect(chunks.length).toBeGreaterThan(1)
  for (const c of chunks) {
    expect(bytes(c)).toBeLessThanOrEqual(5000)
    expect(c.split(' ').every((w) => w.replace(/[,.]$/, '') === 'palavra')).toBe(true)
  }
})

test('a single word over the limit is cut by code points without breaking characters', () => {
  const chunks = chunkText('ã'.repeat(30), 10)
  for (const c of chunks) {
    expect(bytes(c)).toBeLessThanOrEqual(10)
    expect(c).toMatch(/^ã+$/)
  }
  expect(chunks.join('')).toBe('ã'.repeat(30))
})

test('joining chunks with a space reproduces the text (modulo whitespace)', () => {
  const text = 'Primeira frase. Segunda frase muito longa com várias palavras.\n\nNovo parágrafo aqui. '.repeat(200)
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  expect(norm(chunkText(text, 700).join(' '))).toBe(norm(text))
})

test('empty text gives no chunks', () => {
  expect(chunkText('   ')).toEqual([])
})

test('countChars counts code points', () => {
  expect(countChars('ação😀')).toBe(5)
})

test('sentences longer than MAX_SENTENCE_CHARS are cut into short spoken pieces', () => {
  const text = 'palavra '.repeat(200).trim() + '.' // 1,600 chars, one "sentence"
  const pieces = chunkText(text).join(' ').split(/(?<=[.,])\s/)
  expect(MAX_SENTENCE_CHARS).toBe(400)
  for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MAX_SENTENCE_CHARS)
})
