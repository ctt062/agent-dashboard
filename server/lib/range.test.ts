import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DATE_RANGES,
  billingCycleStartDate,
  daysInRange,
  inclusiveDayCount,
  parseRange,
  rangeLabel,
  rangeStartDate,
} from './range.ts'

describe('billing cycle range', () => {
  it('only supports this billing cycle', () => {
    assert.deepEqual(DATE_RANGES, ['month'])
    assert.equal(parseRange(undefined), 'month')
    assert.equal(parseRange('7d'), 'month')
    assert.equal(rangeLabel(), 'This billing cycle')
  })

  it('uses provider cycleStart for the billing-cycle window', () => {
    const now = new Date(2026, 6, 28, 15, 30, 0) // Jul 28, 2026 local
    assert.equal(
      billingCycleStartDate('2026-07-15T02:05:00.000Z', now),
      '2026-07-15',
    )
    assert.equal(rangeStartDate('month', now, '2026-07-15T02:05:00.000Z'), '2026-07-15')
    assert.equal(daysInRange('month', now, '2026-07-15T02:05:00.000Z'), 14)
    assert.equal(inclusiveDayCount('2026-07-28', '2026-07-28'), 1)
    assert.equal(rangeStartDate('month', now, null), '2026-07-01')
  })
})
