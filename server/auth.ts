import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import cookieSession from 'cookie-session'
import type { Express, NextFunction, Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import {
  type AuthMode,
  authModeForHostAndOrigin,
  corsAllowedOrigins,
  isLanBindHost,
  publicOriginFromEnv,
} from './lib/auth-mode.js'
import {
  bearerFromAuthorization,
  issueBearerToken,
  verifyBearerToken,
} from './lib/bearer-token.js'
import {
  checkPinRateLimit,
  clearPinFailures,
  createPinRateLimitStore,
  recordPinFailure,
} from './lib/pin-rate-limit.js'

export type AuthUser = {
  email: string
  name: string | null
  picture: string | null
  method: 'google' | 'pin'
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

type SessionData = {
  user?: AuthUser
}

const pinAttemptStore = createPinRateLimitStore()

function configDir(): string {
  const dir = join(homedir(), '.config', 'agent-deck')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function sessionSecret(): string {
  if (process.env.SESSION_SECRET?.trim()) return process.env.SESSION_SECRET.trim()
  const file = join(configDir(), 'session-secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  writeFileSync(file, `${secret}\n`, { encoding: 'utf8', mode: 0o600 })
  return secret
}

export function googleClientId(): string | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim()
  return id || null
}

export function dashboardPin(): string | null {
  const pin = process.env.DASHBOARD_PIN?.trim()
  return pin || null
}

export function allowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAILS?.trim()
  if (!raw) return null
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function publicOrigin(): string {
  return publicOriginFromEnv()
}

export function authModeForRequest(req: Request): AuthMode {
  return authModeForHostAndOrigin({
    hostHeader: req.get('x-forwarded-host') || req.get('host'),
    origin: req.get('origin'),
    publicOrigin: publicOrigin(),
  })
}

export function googleAuthReady(): boolean {
  return Boolean(googleClientId())
}

export function pinAuthReady(): boolean {
  return Boolean(dashboardPin())
}

/** True when the server can authenticate at least one supported mode. */
export function authConfigured(): boolean {
  return googleAuthReady() || pinAuthReady()
}

export function assertLanAuthRequirements(host: string): void {
  if (!isLanBindHost(host)) return
  const missing: string[] = []
  if (!allowedEmails()?.size) missing.push('ALLOWED_EMAILS')
  if (!dashboardPin()) missing.push('DASHBOARD_PIN')
  if (!googleClientId()) missing.push('GOOGLE_CLIENT_ID')
  if (missing.length === 0) return
  console.error(
    `LAN bind (HOST=${host}) requires ${missing.join(', ')} in .env. Refusing to start.`,
  )
  process.exit(1)
}

function pinMatches(input: string): boolean {
  const expected = dashboardPin()
  if (!expected) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

function clientIp(req: Request): string {
  const forwarded = req.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.ip || req.socket.remoteAddress || 'unknown'
}

export function attachCors(app: Express): void {
  const allowed = corsAllowedOrigins()
  app.use((req, res, next) => {
    const origin = req.get('origin')
    if (origin && allowed.has(origin.replace(/\/$/, ''))) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      )
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,OPTIONS',
      )
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })
}

export function attachSession(app: Express): void {
  app.set('trust proxy', 1)
  const secret = sessionSecret()
  app.use(
    cookieSession({
      name: 'agent_deck_session',
      keys: [secret],
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    }),
  )
}

function readSession(req: Request): SessionData {
  return (req.session ?? {}) as SessionData
}

function modeConfigured(mode: AuthMode): boolean {
  return mode === 'google' ? googleAuthReady() : pinAuthReady()
}

function resolveUser(req: Request): AuthUser | null {
  const bearer = bearerFromAuthorization(req.get('authorization'))
  if (bearer) {
    const user = verifyBearerToken(bearer, sessionSecret())
    if (user) return user
  }
  return readSession(req).user ?? null
}

function issueAuthResponse(req: Request, res: Response, user: AuthUser): void {
  const session = readSession(req)
  session.user = user
  req.session = session
  const token = issueBearerToken(user, sessionSecret())
  res.json({ user, token })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const mode = authModeForRequest(req)
  if (!modeConfigured(mode)) {
    res.status(503).json({
      error: 'auth_not_configured',
      mode,
      message:
        mode === 'google'
          ? 'Set GOOGLE_CLIENT_ID (and ALLOWED_EMAILS when LAN bind is enabled) in .env, then restart Agent Deck.'
          : 'Set DASHBOARD_PIN in .env for LAN / non-Google hosts, then restart Agent Deck.',
    })
    return
  }
  const user = resolveUser(req)
  if (!user?.email) {
    res.status(401).json({ error: 'unauthorized', mode })
    return
  }
  req.user = user
  next()
}

export function mountAuthRoutes(app: Express): void {
  app.get('/api/auth/config', (req, res) => {
    const mode = authModeForRequest(req)
    const configured = modeConfigured(mode)
    res.json({
      mode,
      configured,
      clientId: mode === 'google' ? googleClientId() : null,
      allowedEmailsConfigured: Boolean(allowedEmails()?.size),
      publicOrigin: publicOrigin(),
      pinConfigured: pinAuthReady(),
    })
  })

  app.get('/api/auth/me', (req, res) => {
    const mode = authModeForRequest(req)
    if (!modeConfigured(mode)) {
      res.status(503).json({
        error: 'auth_not_configured',
        configured: false,
        mode,
      })
      return
    }
    const user = resolveUser(req)
    if (!user?.email) {
      res.status(401).json({ error: 'unauthorized', configured: true, mode })
      return
    }
    res.json({ user, configured: true, mode })
  })

  app.post('/api/auth/google', async (req, res) => {
    const mode = authModeForRequest(req)
    if (mode !== 'google') {
      res.status(400).json({
        error: 'wrong_auth_mode',
        message: 'This host uses PIN sign-in, not Google.',
        mode,
      })
      return
    }
    const clientId = googleClientId()
    if (!clientId) {
      res.status(503).json({ error: 'auth_not_configured', mode })
      return
    }
    const credential =
      typeof req.body?.credential === 'string' ? req.body.credential : null
    if (!credential) {
      res.status(400).json({ error: 'missing_credential' })
      return
    }

    try {
      const client = new OAuth2Client(clientId)
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      })
      const payload = ticket.getPayload()
      if (!payload?.email) {
        res.status(401).json({ error: 'invalid_token' })
        return
      }
      if (!payload.email_verified) {
        res.status(403).json({
          error: 'email_not_verified',
          message: 'Google account email must be verified.',
        })
        return
      }

      const email = payload.email.toLowerCase()
      const allow = allowedEmails()
      const lanBound = isLanBindHost(process.env.HOST ?? '127.0.0.1')
      if (lanBound && !allow?.size) {
        res.status(503).json({
          error: 'allowlist_required',
          message: 'ALLOWED_EMAILS is required when LAN bind is enabled.',
        })
        return
      }
      if (allow && !allow.has(email)) {
        res.status(403).json({
          error: 'email_not_allowed',
          message: 'This Google account is not allowed to open Agent Deck.',
        })
        return
      }

      const user: AuthUser = {
        email,
        name: payload.name ?? null,
        picture: payload.picture ?? null,
        method: 'google',
      }
      issueAuthResponse(req, res, user)
    } catch (err) {
      res.status(401).json({
        error: 'verify_failed',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  app.post('/api/auth/pin', (req, res) => {
    const mode = authModeForRequest(req)
    if (mode !== 'pin') {
      res.status(400).json({
        error: 'wrong_auth_mode',
        message: 'This host uses Google sign-in, not PIN.',
        mode,
      })
      return
    }
    if (!dashboardPin()) {
      res.status(503).json({ error: 'auth_not_configured', mode })
      return
    }

    const ip = clientIp(req)
    const limited = checkPinRateLimit(pinAttemptStore, ip)
    if (!limited.ok) {
      const retryAfterSec = Math.max(1, Math.ceil(limited.retryAfterMs / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({
        error: 'pin_rate_limited',
        message: `Too many incorrect PIN attempts. Try again in ${retryAfterSec}s.`,
        retryAfterMs: limited.retryAfterMs,
      })
      return
    }

    const pin = typeof req.body?.pin === 'string' ? req.body.pin : ''
    if (!pinMatches(pin)) {
      const result = recordPinFailure(pinAttemptStore, ip)
      if (result.retryAfterMs > 0) {
        const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
        res.setHeader('Retry-After', String(retryAfterSec))
        res.status(429).json({
          error: 'pin_rate_limited',
          message: `Too many incorrect PIN attempts. Try again in ${retryAfterSec}s.`,
          retryAfterMs: result.retryAfterMs,
        })
        return
      }
      res.status(401).json({ error: 'invalid_pin', message: 'Incorrect PIN.' })
      return
    }

    clearPinFailures(pinAttemptStore, ip)
    const user: AuthUser = {
      email: 'pin@local',
      name: 'PIN access',
      picture: null,
      method: 'pin',
    }
    issueAuthResponse(req, res, user)
  })

  app.post('/api/auth/logout', (req, res) => {
    req.session = null
    res.json({ ok: true })
  })
}
