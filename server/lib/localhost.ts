/** Localhost bind helpers. Agent Deck refuses non-loopback HOST values. */

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

export function isNonLoopbackBindHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (!h) return false
  if (h === '0.0.0.0' || h === '::' || h === '[::]') return true
  return !isLoopbackHostname(h)
}

export function assertLocalhostOnly(host: string): void {
  if (!isNonLoopbackBindHost(host)) return
  console.error(
    `HOST=${host} is not allowed. Agent Deck is localhost-only (use 127.0.0.1).`,
  )
  process.exit(1)
}
