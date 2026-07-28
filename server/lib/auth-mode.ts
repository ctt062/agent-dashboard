export const DEFAULT_PUBLIC_ORIGIN = 'https://agent-dashboard-ctt.vercel.app'

export type AuthMode = 'google' | 'pin'

export function publicOriginFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN
  return raw.replace(/\/$/, '')
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

export function isLanBindHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (!h || h === '0.0.0.0' || h === '::' || h === '[::]') return true
  if (isLoopbackHostname(h)) return false
  return true
}

function hostnameOf(hostOrUrl: string): string | null {
  const raw = hostOrUrl.trim()
  if (!raw) return null
  try {
    if (raw.includes('://')) return new URL(raw).hostname.toLowerCase()
    return new URL(`http://${raw}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Google GIS works on loopback and configured PUBLIC_ORIGIN; everything else uses PIN. */
export function authModeForHostAndOrigin(input: {
  hostHeader: string | null | undefined
  origin: string | null | undefined
  publicOrigin?: string
}): AuthMode {
  const pub = (input.publicOrigin ?? DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '')
  const pubHost = hostnameOf(pub)

  const origin = input.origin?.trim()
  if (origin) {
    const normalized = origin.replace(/\/$/, '')
    if (normalized === pub) return 'google'
    const originHost = hostnameOf(origin)
    if (originHost && isLoopbackHostname(originHost)) return 'google'
    return 'pin'
  }

  const host = hostnameOf(input.hostHeader ?? '')
  if (!host) return 'pin'
  if (isLoopbackHostname(host)) return 'google'
  if (pubHost && host === pubHost) return 'google'
  return 'pin'
}

export function corsAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const pub = publicOriginFromEnv(env)
  const origins = new Set<string>([
    pub,
    'http://127.0.0.1:3847',
    'http://localhost:3847',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
  ])
  const port = env.PORT?.trim()
  if (port && port !== '3847') {
    origins.add(`http://127.0.0.1:${port}`)
    origins.add(`http://localhost:${port}`)
  }
  return origins
}
