export type PinRateLimitState = {
  fails: number
  lockedUntil: number
}

export type PinRateLimitStore = Map<string, PinRateLimitState>

const MAX_ATTEMPTS_BEFORE_LOCK = 5
const BASE_LOCK_MS = 60_000
const MAX_LOCK_MS = 15 * 60_000

export function createPinRateLimitStore(): PinRateLimitStore {
  return new Map()
}

export function pinLockMsForFails(fails: number): number {
  if (fails < MAX_ATTEMPTS_BEFORE_LOCK) return 0
  const extra = fails - MAX_ATTEMPTS_BEFORE_LOCK
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** extra)
}

export function checkPinRateLimit(
  store: PinRateLimitStore,
  ip: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterMs: number } {
  const entry = store.get(ip)
  if (!entry || entry.lockedUntil <= now) return { ok: true }
  return { ok: false, retryAfterMs: entry.lockedUntil - now }
}

export function recordPinFailure(
  store: PinRateLimitStore,
  ip: string,
  now = Date.now(),
): { lockedUntil: number; retryAfterMs: number } {
  const prev = store.get(ip)
  const fails = (prev?.fails ?? 0) + 1
  const lockMs = pinLockMsForFails(fails)
  const lockedUntil = lockMs > 0 ? now + lockMs : 0
  store.set(ip, { fails, lockedUntil })
  return {
    lockedUntil,
    retryAfterMs: lockMs > 0 ? lockMs : 0,
  }
}

export function clearPinFailures(store: PinRateLimitStore, ip: string): void {
  store.delete(ip)
}
