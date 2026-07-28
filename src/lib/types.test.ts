import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatResetAt, rangeLabel, DATE_RANGES } from '../../src/lib/types.ts'

describe('frontend billing-cycle helpers', () => {
  it('only exposes this billing cycle', () => {
    assert.deepEqual(DATE_RANGES, ['month'])
    assert.equal(rangeLabel('month'), 'This billing cycle')
  })

  it('formats provider reset timestamps for display (not local midnight only)', () => {
    const formatted = formatResetAt('2026-08-01T14:30:00.000Z')
    assert.match(formatted, /Aug/)
    assert.match(formatted, /01|1/)
    assert.doesNotMatch(formatted, /^00:00$/)
  })
})
