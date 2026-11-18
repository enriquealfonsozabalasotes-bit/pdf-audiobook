export const TARGET_PART_CHARS = 9000 // ~10 min of speech at ~900 chars/min

const joinPages = (pages) => pages.filter((p) => p.trim()).join('\n\n').trim()

function byOutline(pageTexts, outline) {
  const entries = [...outline]
    .filter((e) => e.pageIndex >= 0 && e.pageIndex < pageTexts.length)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .filter((e, i, arr) => i === 0 || arr[i - 1].pageIndex !== e.pageIndex)
  if (entries.length && entries[0].pageIndex > 0) entries.unshift({ title: 'Início', pageIndex: 0 })
  return entries.map((e, i) => ({
    title: e.title,
    text: joinPages(pageTexts.slice(e.pageIndex, entries[i + 1]?.pageIndex ?? pageTexts.length)),
  }))
}

function byLength(pageTexts) {
  const paras = pageTexts.flatMap((p) => p.split(/\n{2,}/)).map((p) => p.trim()).filter(Boolean)
  const parts = []
  let current = []
  let len = 0
  for (const p of paras) {
    current.push(p)
    len += p.length + (current.length > 1 ? 2 : 0)
    if (len >= TARGET_PART_CHARS) {
      parts.push(current.join('\n\n'))
      current = []
      len = 0
    }
  }
  if (current.length) parts.push(current.join('\n\n'))
  return parts.map((text, i) => ({ title: `Parte ${i + 1}`, text }))
}

export function splitChapters(pageTexts, outline) {
  const chapters = outline.some((e) => e.pageIndex >= 0 && e.pageIndex < pageTexts.length)
    ? byOutline(pageTexts, outline)
    : byLength(pageTexts)
  return chapters.filter((c) => c.text)
}
