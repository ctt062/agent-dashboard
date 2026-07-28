import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DATE_RANGES,
  daysInRange,
  parseRange,
  rangeLabel,
  rangeStartDate,
} from './range.ts'

describe('date range helpers', () => {
  it('includes This month alongside Today/7d/30d', () => {
    assert.deepEqual(DATE_RANGES, ['1d', '7d', '30d', 'month'])
    assert.equal(rangeLabel('1d'), 'Today')
    assert.equal(rangeLabel('7d'), '7 days')
    assert.equal(rangeLabel('30d'), '30 days')
    assert.equal(rangeLabel('month'), 'This month')
  })

  it('parses month and rejects unknown values', () => {
    assert.equal(parseRange('month'), 'month')
    assert.equal(parseRange('7d'), '7d')
    assert.equal(parseRange('nope'), '7d')
    assert.equal(parseRange(undefined), '7d')
  })

  it('starts This month on the 1st of the local calendar month', () => {
    const now = new Date(2026, 6, 28, 15, 30, 0) // Jul 28, 2026 local
    assert.equal(rangeStartDate('month', now), '2026-07-01')
    assert.equal(daysInRange('month', now), 28)
    assert.equal(rangeStartDate('1d', now), '2026-07-28')
    assert.equal(rangeStartDate('7d', now), '2026-07-22')
    assert.equal(rangeStartDate('30d', now), '2026-06-29')
  })
})
