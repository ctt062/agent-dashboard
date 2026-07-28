import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkPinRateLimit,
  clearPinFailures,
  createPinRateLimitStore,
  pinLockMsForFails,
  recordPinFailure,
} from './pin-rate-limit.ts'

describe('pin-rate-limit', () => {
  it('locks after five failures with progressive backoff', () => {
    assert.equal(pinLockMsForFails(4), 0)
    assert.equal(pinLockMsForFails(5), 60_000)
    assert.equal(pinLockMsForFails(6), 120_000)
    assert.equal(pinLockMsForFails(10), 15 * 60_000)
  })

  it('rate-limits an IP after repeated failures and clears on success path', () => {
    const store = createPinRateLimitStore()
    const now = 1_000_000

    for (let i = 0; i < 4; i++) {
      const result = recordPinFailure(store, '10.0.0.1', now + i)
      assert.equal(result.retryAfterMs, 0)
      assert.equal(checkPinRateLimit(store, '10.0.0.1', now + i).ok, true)
    }

    const locked = recordPinFailure(store, '10.0.0.1', now + 10)
    assert.equal(locked.retryAfterMs, 60_000)
    const blocked = checkPinRateLimit(store, '10.0.0.1', now + 11)
    assert.equal(blocked.ok, false)
    if (!blocked.ok) assert.ok(blocked.retryAfterMs > 0)

    assert.equal(
      checkPinRateLimit(store, '10.0.0.1', now + 10 + 60_000).ok,
      true,
    )

    clearPinFailures(store, '10.0.0.1')
    assert.equal(checkPinRateLimit(store, '10.0.0.1', now + 20).ok, true)
  })
})
