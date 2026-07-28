declare global {
  interface Window {
    __AGENT_DECK_API_BASE__?: string
  }
}

const TOKEN_KEY = 'agent_deck_token'

function trimSlash(value: string): string {
  return value.replace(/\/$/, '')
}

/** Build-time VITE_API_BASE, overridden by runtime `window.__AGENT_DECK_API_BASE__`. */
export function apiBase(): string {
  const runtime =
    typeof window !== 'undefined' ? window.__AGENT_DECK_API_BASE__ : undefined
  if (typeof runtime === 'string' && runtime.trim()) {
    return trimSlash(runtime.trim())
  }
  const baked = import.meta.env.VITE_API_BASE
  if (typeof baked === 'string' && baked.trim()) {
    return trimSlash(baked.trim())
  }
  return ''
}

export function apiUrl(path: string): string {
  const base = apiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAuthToken(): void {
  setAuthToken(null)
}

export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  })
}
