// Turns positioned PDF text items into clean, speakable text per page.
// Page: { pageIndex, width, height, items: [{ str, x, y, width, fontSize }] }, y from page bottom.

const SUPERSCRIPTS = /[¹²³⁰⁴⁵⁶⁷⁸⁹]/g
const PAGE_NUMBER = /^(p(á|a)g(ina)?\.?\s*)?[-–—\s]*\d+[-–—\s]*$/i
const URL = /\b(?:https?:\/\/|www\.)\S+/gi
const EDGE_ZONE = 0.12 // top/bottom share of page height where running headers/footers live
const FOOTNOTE_ZONE = 0.25

function bodyFontSize(items) {
  const weight = new Map()
  for (const it of items) {
    const k = Math.round(it.fontSize * 2) / 2
    weight.set(k, (weight.get(k) || 0) + it.str.length)
  }
  let best = 10
  let max = -1
  for (const [k, w] of weight) if (w > max) [best, max] = [k, w]
  return best
}

function groupLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line.y - it.y) < 0.5 * Math.max(line.fontSize, it.fontSize)) {
      line.items.push(it)
      line.fontSize = Math.max(line.fontSize, it.fontSize)
    } else {
      lines.push({ y: it.y, fontSize: it.fontSize, items: [it] })
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    let text = ''
    let prev = null
    for (const it of line.items) {
      if (prev) {
        const gap = it.x - (prev.x + prev.width)
        const spaced = /\s$/.test(text) || /^\s/.test(it.str)
        if (!spaced && gap > 0.2 * it.fontSize) text += ' '
      }
      text += it.str
      prev = it
    }
    line.text = text.replace(SUPERSCRIPTS, '').trim()
  }
  return lines.filter((l) => l.text)
}

const normalize = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

function edgeLines(lines, height) {
  const top = lines.slice(0, 2).filter((l) => l.y > height * (1 - EDGE_ZONE))
  const bottom = lines.slice(-2).filter((l) => l.y < height * EDGE_ZONE)
  return [...top, ...bottom]
}

function splitColumns(items, width) {
  const mid = width / 2
  if (items.length === 0 || items.some((it) => it.x < mid && it.x + it.width > mid)) return [items]
  const left = items.filter((it) => it.x < mid)
  const right = items.filter((it) => it.x >= mid)
  const chars = (arr) => arr.reduce((n, it) => n + it.str.length, 0)
  const total = chars(items)
  if (chars(left) < 0.3 * total || chars(right) < 0.3 * total) return [items]
  return [left, right]
}

function paragraphs(lines) {
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 0
  const paras = []
  let current = []
  lines.forEach((line, i) => {
    if (i > 0 && lines[i - 1].y - line.y > 1.5 * median) {
      paras.push(current)
      current = []
    }
    current.push(line.text)
  })
  if (current.length) paras.push(current)
  return paras.map((p) =>
    p
      .join('\n')
      .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
      .replace(URL, 'link')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

export function cleanPages(pages) {
  const prepared = pages.map((p) => {
    const body = bodyFontSize(p.items)
    const items = p.items.filter(
      (it) => it.str.trim() && !(it.fontSize <= 0.7 * body && /^\s*\d+\s*$/.test(it.str)),
    )
    return { page: p, body, items, lines: groupLines(items) }
  })

  // Running headers/footers: same normalized edge line on most pages.
  const counts = new Map()
  for (const { page, lines } of prepared) {
    for (const key of new Set(edgeLines(lines, page.height).map((l) => normalize(l.text)))) {
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const minPages = Math.max(3, Math.ceil(pages.length * 0.5))
  const repeated = new Set([...counts].filter(([, n]) => n >= minPages).map(([k]) => k))

  return prepared.map(({ page, body, items, lines }) => {
    const drop = new Set()
    for (const l of edgeLines(lines, page.height)) if (repeated.has(normalize(l.text))) drop.add(l)
    for (const l of lines) {
      if (PAGE_NUMBER.test(l.text)) drop.add(l)
      if (l.y < page.height * FOOTNOTE_ZONE && l.fontSize <= 0.8 * body) drop.add(l)
    }
    const dropped = new Set([...drop].flatMap((l) => l.items))
    const kept = items.filter((it) => !dropped.has(it))
    const paras = []
    for (const col of splitColumns(kept, page.width)) {
      const colParas = paragraphs(groupLines(col)).filter(Boolean)
      // a sentence cut at the bottom of the left column continues in the right one
      if (paras.length && colParas.length && !/[.!?:…"”»]$/.test(paras[paras.length - 1])) {
        paras[paras.length - 1] += ' ' + colParas.shift()
      }
      paras.push(...colParas)
    }
    return paras.join('\n\n')
  })
}
