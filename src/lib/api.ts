declare global {
  interface Window {
    __AGENT_DECK_API_BASE__?: string
  }
}

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

export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
  })
}
