import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatResetAt, rangeLabel, DATE_RANGES } from '../../src/lib/types.ts'

describe('frontend range + reset display helpers', () => {
  it('keeps This month in the UI date-range set', () => {
    assert.deepEqual(DATE_RANGES, ['1d', '7d', '30d', 'month'])
    assert.equal(rangeLabel('month'), 'This month')
  })

  it('formats provider reset timestamps for display (not local midnight only)', () => {
    const formatted = formatResetAt('2026-08-01T14:30:00.000Z')
    assert.match(formatted, /Aug/)
    assert.match(formatted, /01|1/)
    assert.doesNotMatch(formatted, /^00:00$/)
  })
})
