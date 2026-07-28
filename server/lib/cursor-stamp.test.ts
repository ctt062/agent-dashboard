import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { localDateFromCursorStamp } from './cursor-stamp.ts'

describe('cursor transcript stamps', () => {
  it('parses Cursor agent transcript timestamps to local YYYY-MM-DD', () => {
    assert.equal(
      localDateFromCursorStamp('Monday, Jul 27, 2026, 9:18 AM (UTC+8)'),
      '2026-07-27',
    )
    assert.equal(
      localDateFromCursorStamp('Tuesday, Jul 28, 2026, 1:35 PM (UTC+8)'),
      '2026-07-28',
    )
    assert.equal(localDateFromCursorStamp('not a stamp'), null)
  })
})
