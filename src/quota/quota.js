// Free-tier guard helpers. The app must never send characters beyond the free tier.

export const SAFETY = 0.95 // 5 % margin for counting differences

export const canSend = (used, chunkChars, limit) => used + chunkChars <= limit * SAFETY

const pad = (n) => String(n).padStart(2, '0')

export const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

export const dayKey = (date) => `${monthKey(date)}-${pad(date.getDate())}`

export function nextMonthStart(date) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`
}
