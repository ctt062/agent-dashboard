import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isLoopbackHostname,
  isNonLoopbackBindHost,
} from './localhost.ts'

describe('localhost bind helpers', () => {
  it('treats loopback hostnames as local', () => {
    assert.equal(isLoopbackHostname('localhost'), true)
    assert.equal(isLoopbackHostname('127.0.0.1'), true)
    assert.equal(isLoopbackHostname('::1'), true)
    assert.equal(isLoopbackHostname('192.168.1.10'), false)
  })

  it('rejects LAN / all-interfaces binds', () => {
    assert.equal(isNonLoopbackBindHost('0.0.0.0'), true)
    assert.equal(isNonLoopbackBindHost('::'), true)
    assert.equal(isNonLoopbackBindHost('192.168.1.10'), true)
    assert.equal(isNonLoopbackBindHost('127.0.0.1'), false)
    assert.equal(isNonLoopbackBindHost('localhost'), false)
  })
})
