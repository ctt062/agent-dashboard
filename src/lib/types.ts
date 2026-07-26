export type DailyPoint = {
  date: string
  value: number
  label: string
}

export type AgentShare = {
  id: 'cursor' | 'claude' | 'codex'
  name: string
  score: number
  percent: number
  metrics: Record<string, number>
  daily: DailyPoint[]
  note?: string
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
}

export type DashboardPayload = {
  generatedAt: string
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
