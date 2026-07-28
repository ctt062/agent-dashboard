import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import cookieSession from 'cookie-session'
import type { Express, NextFunction, Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'

export type AuthUser = {
  email: string
  name: string | null
  picture: string | null
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

type SessionData = {
  user?: AuthUser
}

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

export function authConfigured(): boolean {
  return Boolean(googleClientId())
}

function allowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAILS?.trim()
  if (!raw) return null
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function attachSession(app: Express): void {
  app.set('trust proxy', 1)
  app.use(
    cookieSession({
      name: 'agent_deck_session',
      keys: [sessionSecret()],
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local / LAN HTTP
    }),
  )
}

function readSession(req: Request): SessionData {
  return (req.session ?? {}) as SessionData
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authConfigured()) {
    res.status(503).json({
      error: 'auth_not_configured',
      message:
        'Set GOOGLE_CLIENT_ID (and optional ALLOWED_EMAILS) in .env, then restart Agent Deck.',
    })
    return
  }
  const user = readSession(req).user
  if (!user?.email) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  req.user = user
  next()
}

export function mountAuthRoutes(app: Express): void {
  app.get('/api/auth/config', (_req, res) => {
    res.json({
      configured: authConfigured(),
      clientId: googleClientId(),
      allowedEmailsConfigured: Boolean(allowedEmails()),
    })
  })

  app.get('/api/auth/me', (req, res) => {
    if (!authConfigured()) {
      res.status(503).json({
        error: 'auth_not_configured',
        configured: false,
      })
      return
    }
    const user = readSession(req).user
    if (!user?.email) {
      res.status(401).json({ error: 'unauthorized', configured: true })
      return
    }
    res.json({ user, configured: true })
  })

  app.post('/api/auth/google', async (req, res) => {
    const clientId = googleClientId()
    if (!clientId) {
      res.status(503).json({ error: 'auth_not_configured' })
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
      }
      const session = readSession(req)
      session.user = user
      req.session = session
      res.json({ user })
    } catch (err) {
      res.status(401).json({
        error: 'verify_failed',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  app.post('/api/auth/logout', (req, res) => {
    req.session = null
    res.json({ ok: true })
  })
}
