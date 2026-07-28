export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'agent-deck-theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(raw) ? raw : null
  } catch {
    return null
  }
}

export function resolveTheme(stored: Theme | null = readStoredTheme()): Theme {
  if (stored) return stored
  if (typeof window !== 'undefined') {
    try {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light'
      }
    } catch {
      // ignore
    }
  }
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
  const metaScheme = document.querySelector('meta[name="color-scheme"]')
  if (metaScheme) metaScheme.setAttribute('content', theme)
  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#eef0f2' : '#050505')
  }
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore quota / private mode
  }
}
