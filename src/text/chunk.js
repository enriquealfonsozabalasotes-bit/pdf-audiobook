export const MAX_CHUNK_BYTES = 5000 // Google TTS input limit per request
// Google also rejects single sentences that are too long for some voices ("sentences that
// are too long"), so run-on sentences are cut into comma-ended pieces of at most this size.
export const MAX_SENTENCE_CHARS = 400

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
    if (sentence.length <= MAX_SENTENCE_CHARS && bytes(sentence) <= maxBytes) {
      pieces.push(sentence)
      continue
    }
    // run-on sentence: split by words (pathological words by code points) into short pieces,
    // each ending in a comma so Google's sentence detector also sees a break
    const limit = Math.min(maxBytes, MAX_SENTENCE_CHARS) - 1
    const tokens = sentence
      .split(' ')
      .flatMap((w) => (bytes(w) > limit ? cutWord(w, limit).map((t, i, all) => ({ t, midWord: i < all.length - 1 })) : [{ t: w, midWord: false }]))
    const parts = []
    let cur = null
    for (const tok of tokens) {
      const next = cur ? `${cur.text} ${tok.t}` : tok.t
      if (cur && Math.max(next.length, bytes(next)) > limit) {
        parts.push(cur)
        cur = null
      }
      cur = cur ? { text: `${cur.text} ${tok.t}`, midWord: tok.midWord } : { text: tok.t, midWord: tok.midWord }
    }
    if (cur) parts.push(cur)
    parts.forEach((part, i) => {
      const last = i === parts.length - 1
      pieces.push(last || part.midWord || /[.,;:!?…]$/.test(part.text) ? part.text : `${part.text},`)
    })
  }
  return pack(pieces, maxBytes)
}
