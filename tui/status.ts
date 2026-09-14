import type {
  AgentShare,
  DashboardPayload,
  GithubSnapshot,
  SystemSnapshot,
  UsageResetWindow,
} from '../server/types.js'

export type Availability = 'available' | 'no data'

export type ProviderStatusLine = {
  id: AgentShare['id']
  name: string
  plan: string
  availability: Availability
  detail: string
}

export function primaryUsageWindow(
  agent: AgentShare,
): UsageResetWindow | null {
  const windows = agent.usageReset?.windows ?? []
  return (
    windows.find((w) => w.usedPercent != null) ??
    windows.find((w) => /billing|month|week|primary/i.test(w.label)) ??
    windows[0] ??
    null
  )
}

export function formatPlanPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return 'n/a'
  return percent % 1 === 0 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`
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

export function providerStatus(agent: AgentShare): ProviderStatusLine {
  const usage = primaryUsageWindow(agent)
  const availability: Availability = agent.available ? 'available' : 'no data'
  let detail: string
  if (!agent.available) {
    detail =
      agent.hint ?? agent.note ?? 'No local data found for this agent.'
  } else if (usage?.at) {
    detail = `Resets ${formatResetAt(usage.at)}`
  } else if (usage?.note) {
    detail = usage.note
  } else {
    detail =
      agent.usageReset?.error ??
      agent.hint ??
      agent.note ??
      'Usage % not available from this provider yet'
  }
  return {
    id: agent.id,
    name: agent.name,
    plan: formatPlanPercent(usage?.usedPercent),
    availability,
    detail,
  }
}

function formatPct(n: number): string {
  return `${Math.round(n)}%`
}

export function formatSystemLine(system: SystemSnapshot): string {
  return `Mac   CPU ${formatPct(system.cpu.utilization)}  MEM ${formatPct(system.memory.utilization)}  GPU ${formatPct(system.gpu.utilization)}`
}

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

function sparkline(values: number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(1, ...values)
  return values
    .map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]!)
    .join('')
}

export function formatGithubLine(github: GithubSnapshot): string {
  if (!github.ok) {
    return `GitHub  ${github.hint ?? github.error ?? 'Contribution calendar unavailable.'}`
  }
  const who = github.login ? `@${github.login}` : 'authenticated'
  const last7 = github.days.slice(-7).map((d) => d.count)
  const spark = last7.length ? `  ${sparkline(last7)} last 7d` : ''
  return `GitHub  ${who}  ${github.totalContributions} contributions this year${spark}`
}

function formatStamp(payload: DashboardPayload): string {
  const t = new Date(payload.generatedAt)
  const time = Number.isNaN(t.getTime())
    ? payload.generatedAt
    : t.toLocaleTimeString(undefined, { hour12: false })
  return payload.cached ? `${time} · cached` : time
}

export function formatProviderRow(line: ProviderStatusLine, nameWidth: number): string {
  const name = line.name.padEnd(nameWidth)
  const plan = line.plan.padStart(6)
  const avail = line.availability.padEnd(9)
  return `${name}  ${plan}  ${avail}  ${line.detail}`
}

const WINDOW_INNER = 78

export function formatDeck(payload: DashboardPayload): string {
  const rows = payload.agents.map((agent) => providerStatus(agent))
  const nameWidth = Math.max(12, ...rows.map((r) => r.name.length))
  const body = [
    'This billing cycle',
    `Updated ${formatStamp(payload)}`,
    '',
    ...rows.map((row) => formatProviderRow(row, nameWidth)),
    '',
    formatSystemLine(payload.system),
    formatGithubLine(payload.github),
  ]
  return wrapWindow('Agent Deck', body, WINDOW_INNER)
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const out: string[] = []
  let rest = line
  while (rest.length > width) {
    let breakAt = rest.lastIndexOf(' ', width)
    if (breakAt < width / 2) breakAt = width
    out.push(rest.slice(0, breakAt).trimEnd())
    rest = rest.slice(breakAt).trimStart()
  }
  if (rest) out.push(rest)
  return out.length > 0 ? out : ['']
}

function wrapWindow(title: string, lines: string[], inner: number): string {
  const wrapped = lines.flatMap((line) => wrapLine(line, inner))
  const top = `┌─ ${title} ${'─'.repeat(Math.max(1, inner - title.length - 1))}┐`
  const bottom = `└${'─'.repeat(inner + 2)}┘`
  const mid = wrapped.map((line) => `│ ${line.padEnd(inner)} │`)
  return [top, ...mid, bottom].join('\n')
}

export const HELP_TEXT = `Agent Deck

Show this billing cycle's plan usage for Cursor, Grok (xAI), Claude Code,
Gemini, and Codex in a terminal window.

Usage:
  agent-deck           Open the terminal UI
  agent-deck --once    Print provider status and exit
  agent-deck --help    Show this help

Collectors run in-process. No local HTTP server, browser, or LaunchAgent
is required.
`
