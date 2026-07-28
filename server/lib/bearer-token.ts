import { createHmac, timingSafeEqual } from 'node:crypto'

export type BearerUser = {
  email: string
  name: string | null
  picture: string | null
  method: 'google' | 'pin'
}

type TokenPayload = {
  u: BearerUser
  exp: number
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function issueBearerToken(
  user: BearerUser,
  secret: string,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now(),
): string {
  const body: TokenPayload = { u: user, exp: now + ttlMs }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifyBearerToken(
  token: string,
  secret: string,
  now = Date.now(),
): BearerUser | null {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(payload, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const raw = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as TokenPayload
    if (!raw?.u?.email || typeof raw.exp !== 'number') return null
    if (raw.exp < now) return null
    if (raw.u.method !== 'google' && raw.u.method !== 'pin') return null
    return {
      email: raw.u.email,
      name: raw.u.name ?? null,
      picture: raw.u.picture ?? null,
      method: raw.u.method,
    }
  } catch {
    return null
  }
}

export function bearerFromAuthorization(
  header: string | null | undefined,
): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
