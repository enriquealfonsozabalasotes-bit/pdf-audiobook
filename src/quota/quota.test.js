import { canSend, dayKey, monthKey, nextMonthStart, SAFETY } from './quota.js'

// Google's free-tier month follows US Pacific time, not the phone's clock.
const utc = (y, m, d, h = 12, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min))

test('canSend respects the 5% safety margin', () => {
  expect(SAFETY).toBe(0.95)
  expect(canSend(940_000, 10_000, 1_000_000)).toBe(true)
  expect(canSend(940_000, 10_001, 1_000_000)).toBe(false)
  expect(canSend(945_000, 10_000, 1_000_000)).toBe(false)
})

test('monthKey and nextMonthStart', () => {
  expect(monthKey(utc(2026, 12, 31))).toBe('2026-12')
  expect(nextMonthStart(utc(2026, 12, 31))).toBe('2027-01-01')
  expect(monthKey(utc(2026, 1, 5))).toBe('2026-01')
  expect(nextMonthStart(utc(2026, 11, 18))).toBe('2026-12-01')
})

test('the month turns at midnight Pacific time, not Brasília time', () => {
  // 2026-12-01 03:00 in Brasília (UTC-3) is still 2026-11-30 22:00 in California (UTC-8)
  const earlyFirst = utc(2026, 12, 1, 6, 0)
  expect(monthKey(earlyFirst)).toBe('2026-11')
  expect(dayKey(earlyFirst)).toBe('2026-11-30')
  // 09:00 UTC = 01:00 PST on the 1st
  expect(monthKey(utc(2026, 12, 1, 9, 0))).toBe('2026-12')
  expect(dayKey(utc(2026, 12, 1, 9, 0))).toBe('2026-12-01')
})

test('Pacific daylight time is handled', () => {
  // 2026-07-01 06:30 UTC = 2026-06-30 23:30 PDT (UTC-7)
  expect(monthKey(utc(2026, 7, 1, 6, 30))).toBe('2026-06')
  expect(monthKey(utc(2026, 7, 1, 7, 30))).toBe('2026-07')
})
