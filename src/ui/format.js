export const CHARS_PER_MINUTE = 900

const numberFmt = new Intl.NumberFormat('pt-BR')
export const formatNumber = (n) => numberFmt.format(n)

/** '2026-12-01' -> '01/12' */
export const formatDayMonth = (iso) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
