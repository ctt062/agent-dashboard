import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bearerFromAuthorization,
  issueBearerToken,
  verifyBearerToken,
} from './bearer-token.ts'

describe('bearer-token', () => {
  const secret = 'test-secret-key'
  const user = {
    email: 'you@example.com',
    name: 'You',
    picture: null,
    method: 'google' as const,
  }

  it('issues a verifiable token', () => {
    const token = issueBearerToken(user, secret, 60_000, 1_000)
    const parsed = verifyBearerToken(token, secret, 1_500)
    assert.deepEqual(parsed, user)
  })

  it('rejects expired, tampered, or wrong-secret tokens', () => {
    const token = issueBearerToken(user, secret, 100, 1_000)
    assert.equal(verifyBearerToken(token, secret, 1_200), null)
    assert.equal(verifyBearerToken(token, 'other', 1_050), null)
    assert.equal(verifyBearerToken(`${token}x`, secret, 1_050), null)
    assert.equal(verifyBearerToken('not-a-token', secret), null)
  })

  it('parses Authorization Bearer headers', () => {
    assert.equal(bearerFromAuthorization('Bearer abc.def'), 'abc.def')
    assert.equal(bearerFromAuthorization('bearer abc.def'), 'abc.def')
    assert.equal(bearerFromAuthorization('Basic abc'), null)
    assert.equal(bearerFromAuthorization(undefined), null)
  })
})
