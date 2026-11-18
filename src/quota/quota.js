// Free-tier guard helpers. The app must never send characters beyond the free tier.
// Google Cloud's billing month follows US Pacific time, so all month/day keys use it:
// on the 1st, the counter resets only once it is also the 1st in California.

export const SAFETY = 0.95 // 5 % margin for counting differences
const BILLING_TZ = 'America/Los_Angeles'

export const canSend = (used, chunkChars, limit) => used + chunkChars <= limit * SAFETY

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BILLING_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** 'YYYY-MM-DD' in Google's billing time zone */
export const dayKey = (date) => ymd.format(date)

export const monthKey = (date) => dayKey(date).slice(0, 7)

export function nextMonthStart(date) {
  const [y, m] = monthKey(date).split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
