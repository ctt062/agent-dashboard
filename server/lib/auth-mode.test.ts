import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PUBLIC_ORIGIN,
  authModeForHostAndOrigin,
  corsAllowedOrigins,
  isLanBindHost,
  isLoopbackHostname,
  publicOriginFromEnv,
} from './auth-mode.ts'

describe('auth-mode', () => {
  it('treats loopback as Google-compatible', () => {
    assert.equal(isLoopbackHostname('127.0.0.1'), true)
    assert.equal(isLoopbackHostname('localhost'), true)
    assert.equal(isLoopbackHostname('::1'), true)
    assert.equal(isLoopbackHostname('192.168.1.10'), false)
  })

  it('requires LAN extras when binding non-loopback', () => {
    assert.equal(isLanBindHost('0.0.0.0'), true)
    assert.equal(isLanBindHost('::'), true)
    assert.equal(isLanBindHost('127.0.0.1'), false)
    assert.equal(isLanBindHost('localhost'), false)
  })

  it('selects google for localhost Host and PUBLIC_ORIGIN Origin', () => {
    assert.equal(
      authModeForHostAndOrigin({
        hostHeader: '127.0.0.1:3847',
        origin: undefined,
      }),
      'google',
    )
    assert.equal(
      authModeForHostAndOrigin({
        hostHeader: '192.168.1.20:3847',
        origin: DEFAULT_PUBLIC_ORIGIN,
      }),
      'google',
    )
  })

  it('selects pin for raw LAN IP Host without Google-compatible Origin', () => {
    assert.equal(
      authModeForHostAndOrigin({
        hostHeader: '192.168.1.20:3847',
        origin: undefined,
      }),
      'pin',
    )
    assert.equal(
      authModeForHostAndOrigin({
        hostHeader: '192.168.1.20:3847',
        origin: 'http://192.168.1.20:3847',
      }),
      'pin',
    )
  })

  it('defaults PUBLIC_ORIGIN and CORS allowlist', () => {
    assert.equal(publicOriginFromEnv({}), DEFAULT_PUBLIC_ORIGIN)
    const origins = corsAllowedOrigins({ PORT: '3847' })
    assert.ok(origins.has(DEFAULT_PUBLIC_ORIGIN))
    assert.ok(origins.has('http://127.0.0.1:3847'))
    assert.ok(origins.has('http://127.0.0.1:5174'))
    assert.equal(origins.has('http://192.168.1.20:3847'), false)
  })
})
