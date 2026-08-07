import type { DateRange } from './lib/range.js'

export type DailyPoint = {
  date: string
  primary: number
  secondary?: number
  primaryLabel: string
  secondaryLabel?: string
  /** Extra numeric breakdown for tooltips and period rollups */
  extras?: Record<string, number>
}

export type AgentStats = {
  activeDays: number
  avgPerDay: number
  peakDay: string | null
  peakValue: number
  periodTotal: number
}

/** Provider-specific token/usage limit reset windows. */
export type UsageResetWindow = {
  label: string
  /** ISO timestamp when this window resets; null if unknown / N/A */
  at: string | null
  usedPercent?: number
  /** Absolute usage in provider units when known (plan credits, etc.) */
  used?: number
  limit?: number
  unit?: string
  note?: string
}

export type UsageReset = {
  ok: boolean
  windows: UsageResetWindow[]
  /** ISO start of the primary billing / plan cycle when known */
  cycleStart?: string | null
  error?: string
}

export type AgentId = 'cursor' | 'grok' | 'claude' | 'gemini' | 'codex'

export type AgentUsage = {
  id: AgentId
  name: string
  /** Comparable activity score used for percentage share */
  score: number
  available: boolean
  metrics: Record<string, number>
  daily: DailyPoint[]
  stats: AgentStats
  usageReset?: UsageReset
  note?: string
  /** How to enable this collector when data is missing */
  hint?: string
}

export type AgentShare = AgentUsage & {
  percent: number
}

export type SystemSnapshot = {
  hostname: string
  uptimeSec: number
  loadAvg: number[]
  cpu: { model: string; cores: number; utilization: number }
  memory: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    utilization: number
  }
  gpu: { utilization: number; name: string; cores: number | null }
  sampledAt: string
}

export type GithubDay = {
  date: string
  count: number
  color: string
}

export type GithubSnapshot = {
  ok: boolean
  error: string | null
  login: string | null
  totalContributions: number
  days: GithubDay[]
  hint?: string
}

export type DashboardPayload = {
  generatedAt: string
  range: DateRange
  cached: boolean
  agents: AgentShare[]
  system: SystemSnapshot
  github: GithubSnapshot
}

export type RawCollectors = {
  cursor: AgentUsage
  grok: AgentUsage
  claude: AgentUsage
  gemini: AgentUsage
  codex: AgentUsage
  system: SystemSnapshot
  github: GithubSnapshot
}
