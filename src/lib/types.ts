export const DATE_RANGES = ['month'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export type DailyPoint = {
  date: string
  primary: number
  secondary?: number
  primaryLabel: string
  secondaryLabel?: string
  extras?: Record<string, number>
}

export type AgentStats = {
  activeDays: number
  avgPerDay: number
  peakDay: string | null
  peakValue: number
  periodTotal: number
}

export type UsageResetWindow = {
  label: string
  at: string | null
  usedPercent?: number
  used?: number
  limit?: number
  unit?: string
  note?: string
}

export type UsageReset = {
  ok: boolean
  windows: UsageResetWindow[]
  cycleStart?: string | null
  error?: string
}

export type AgentId = 'cursor' | 'grok' | 'claude' | 'gemini' | 'codex'

export type AgentShare = {
  id: AgentId
  name: string
  score: number
  percent: number
  available: boolean
  metrics: Record<string, number>
  daily: DailyPoint[]
  stats: AgentStats
  usageReset?: UsageReset
  note?: string
  hint?: string
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

export function formatBytes(n: number): string {
  const gb = n / 1024 ** 3
  return `${gb.toFixed(1)} GB`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function rangeLabel(_range: DateRange = 'month'): string {
  return 'This billing cycle'
}

export function formatResetAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
