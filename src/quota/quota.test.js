import { canSend, monthKey, nextMonthStart, SAFETY } from './quota.js'

test('canSend respects the 5% safety margin', () => {
  expect(SAFETY).toBe(0.95)
  expect(canSend(940_000, 10_000, 1_000_000)).toBe(true)
  expect(canSend(940_000, 10_001, 1_000_000)).toBe(false)
  expect(canSend(945_000, 10_000, 1_000_000)).toBe(false)
})

test('monthKey and nextMonthStart use local time', () => {
  expect(monthKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12')
  expect(nextMonthStart(new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01')
  expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01')
  expect(nextMonthStart(new Date(2026, 10, 18))).toBe('2026-12-01')
})
