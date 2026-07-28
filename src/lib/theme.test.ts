import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isTheme, resolveTheme } from '../../src/lib/theme.ts'

describe('theme helpers', () => {
  it('accepts only dark and light', () => {
    assert.equal(isTheme('dark'), true)
    assert.equal(isTheme('light'), true)
    assert.equal(isTheme('system'), false)
  })

  it('prefers an explicit stored theme', () => {
    assert.equal(resolveTheme('light'), 'light')
    assert.equal(resolveTheme('dark'), 'dark')
  })
})
