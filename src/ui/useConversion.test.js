import { isConvertible } from './useConversion.js'

test('converting books are picked; paused books only from pausedUntil on', () => {
  expect(isConvertible({ status: 'converting' }, '2026-11-18')).toBe(true)
  expect(isConvertible({ status: 'paused-quota', pausedUntil: '2026-12-01' }, '2026-11-30')).toBe(false)
  expect(isConvertible({ status: 'paused-quota', pausedUntil: '2026-12-01' }, '2026-12-01')).toBe(true)
  expect(isConvertible({ status: 'error' }, '2026-12-01')).toBe(false)
  expect(isConvertible({ status: 'ready' }, '2026-12-01')).toBe(false)
})
