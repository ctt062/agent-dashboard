export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const p = path.startsWith('/') ? path : `/${path}`
  return fetch(p, init)
}

/** Parse API JSON; surface a clear error when HTML is returned by mistake. */
export async function readApiJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  const trimmed = text.trimStart()
  const looksLikeHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html')

  if (looksLikeHtml || contentType.includes('text/html')) {
    throw new Error(
      'API returned HTML instead of JSON. Is Agent Deck running on this Mac?',
    )
  }

  if (!trimmed) {
    throw new Error(`Empty API response (HTTP ${res.status})`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`API response was not JSON (HTTP ${res.status}).`)
  }
}
