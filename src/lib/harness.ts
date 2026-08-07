import type { AgentId, AgentShare } from './types.ts'

export type { AgentId }

/** All harnesses the dashboard can collect and display. */
export const AGENT_IDS: readonly AgentId[] = [
  'cursor',
  'grok',
  'claude',
  'gemini',
  'codex',
] as const

/** Default selection - core three; Claude/Gemini opt-in via picker. */
export const DEFAULT_VISIBLE_HARNESSES: readonly AgentId[] = [
  'cursor',
  'grok',
  'codex',
] as const

export const HARNESS_STORAGE_KEY = 'agent-deck-visible-harnesses'

export type MarkerKind = 'circle' | 'square' | 'diamond'

export const HARNESS_META: Record<
  AgentId,
  {
    label: string
    shortLabel: string
    colorVar: string
    dash?: string
    width: number
    marker: MarkerKind
  }
> = {
  cursor: {
    label: 'Cursor',
    shortLabel: 'Cursor',
    colorVar: 'var(--cursor)',
    width: 2.75,
    marker: 'circle',
  },
  grok: {
    label: 'Grok (xAI)',
    shortLabel: 'Grok',
    colorVar: 'var(--grok)',
    dash: '7 5',
    width: 2.5,
    marker: 'square',
  },
  claude: {
    label: 'Claude Code',
    shortLabel: 'Claude',
    colorVar: 'var(--claude)',
    dash: '4 4',
    width: 2.5,
    marker: 'diamond',
  },
  gemini: {
    label: 'Gemini',
    shortLabel: 'Gemini',
    colorVar: 'var(--gemini)',
    dash: '1 4',
    width: 2.4,
    marker: 'circle',
  },
  codex: {
    label: 'Codex',
    shortLabel: 'Codex',
    colorVar: 'var(--codex)',
    dash: '2 5',
    width: 2.5,
    marker: 'diamond',
  },
}

export function isAgentId(value: unknown): value is AgentId {
  return (
    value === 'cursor' ||
    value === 'grok' ||
    value === 'claude' ||
    value === 'gemini' ||
    value === 'codex'
  )
}

export function defaultVisibleHarnesses(): AgentId[] {
  return [...DEFAULT_VISIBLE_HARNESSES]
}

export function readStoredHarnesses(): AgentId[] | null {
  try {
    const raw = localStorage.getItem(HARNESS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter(isAgentId)
    // Keep stable display order; drop unknown ids.
    const ordered = AGENT_IDS.filter((id) => ids.includes(id))
    return ordered.length > 0 ? [...ordered] : null
  } catch {
    return null
  }
}

export function resolveVisibleHarnesses(
  stored: AgentId[] | null = readStoredHarnesses(),
): AgentId[] {
  if (stored && stored.length > 0) return stored
  return defaultVisibleHarnesses()
}

export function persistVisibleHarnesses(ids: AgentId[]): void {
  try {
    const ordered = AGENT_IDS.filter((id) => ids.includes(id))
    const next = ordered.length > 0 ? ordered : defaultVisibleHarnesses()
    localStorage.setItem(HARNESS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
}

/** Toggle one harness. Always keeps at least one selected. */
export function toggleHarness(
  current: AgentId[],
  id: AgentId,
): AgentId[] {
  const set = new Set(current)
  if (set.has(id)) {
    if (set.size <= 1) return AGENT_IDS.filter((x) => set.has(x))
    set.delete(id)
  } else {
    set.add(id)
  }
  return AGENT_IDS.filter((x) => set.has(x))
}

export function filterAgentsByHarness(
  agents: AgentShare[],
  visible: AgentId[],
): AgentShare[] {
  const allow = new Set(visible)
  // Preserve stable AGENT_IDS order rather than API / click order.
  const byId = new Map(agents.map((a) => [a.id, a]))
  return AGENT_IDS.flatMap((id) => {
    if (!allow.has(id)) return []
    const a = byId.get(id)
    return a ? [a] : []
  })
}
