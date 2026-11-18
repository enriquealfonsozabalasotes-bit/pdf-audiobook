export const MAX_CHUNK_BYTES = 5000 // Google TTS input limit per request

const encoder = new TextEncoder()
const bytes = (s) => encoder.encode(s).length

/** Characters as Google bills them: Unicode code points. */
export const countChars = (text) => [...text].length

function cutWord(word, maxBytes) {
  const out = []
  let cur = ''
  for (const ch of word) {
    if (bytes(cur + ch) > maxBytes) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function pack(pieces, maxBytes) {
  const out = []
  let cur = ''
  for (const piece of pieces) {
    const next = cur ? `${cur} ${piece}` : piece
    if (bytes(next) <= maxBytes) {
      cur = next
    } else {
      if (cur) out.push(cur)
      cur = piece
    }
  }
  if (cur) out.push(cur)
  return out
}

export function chunkText(text, maxBytes = MAX_CHUNK_BYTES) {
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' })
  const pieces = []
  for (const { segment } of segmenter.segment(text)) {
    const sentence = segment.replace(/\s+/g, ' ').trim()
    if (!sentence) continue
    if (bytes(sentence) <= maxBytes) {
      pieces.push(sentence)
      continue
    }
    // over-long sentence: split by words, and pathological words by code points
    const words = sentence.split(' ').flatMap((w) => (bytes(w) > maxBytes ? cutWord(w, maxBytes) : [w]))
    pieces.push(...pack(words, maxBytes))
  }
  return pack(pieces, maxBytes)
}
