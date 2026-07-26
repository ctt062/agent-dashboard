export type DailyPoint = {
  date: string
  value: number
  label: string
}

export type AgentUsage = {
  id: 'cursor' | 'claude' | 'codex'
  name: string
  /** Comparable activity score used for percentage share */
  score: number
  metrics: Record<string, number>
  daily: DailyPoint[]
  note?: string
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
}

export type DashboardPayload = {
  generatedAt: string
  agents: AgentShare[]
  system: SystemSnapshot
  github: GithubSnapshot
}
