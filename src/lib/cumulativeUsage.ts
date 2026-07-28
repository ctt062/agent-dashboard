import type { AgentShare, UsageResetWindow } from './types'

export type CumulativeSeriesPoint = {
  date: string
  cursor: number | null
  claude: number | null
  codex: number | null
}

export type CumulativeChartModel = {
  points: CumulativeSeriesPoint[]
  /** Inclusive YYYY-MM-DD chart domain start (billing cycle). */
  startDate: string
  /** Inclusive YYYY-MM-DD chart domain end (now). */
  endDate: string
  yLabel: string
  hasData: boolean
}

const AGENT_IDS = ['cursor', 'claude', 'codex'] as const

function primaryUsageWindow(agent: AgentShare): UsageResetWindow | null {
  const windows = agent.usageReset?.windows ?? []
  return (
    windows.find((w) => w.usedPercent != null) ??
    windows.find((w) => /billing|month|week|primary/i.test(w.label)) ??
    windows[0] ??
    null
  )
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Inclusive local YYYY-MM-DD range. */
export function enumerateDays(startYmd: string, endYmd: string): string[] {
  const out: string[] = []
  const cur = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) {
    return out
  }
  while (cur <= end) {
    out.push(formatYmd(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function localYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return formatYmd(d)
}

/** Shared chart domain start: Cursor billing cycle when known, else today. */
export function chartDomainStart(
  agents: AgentShare[],
  todayYmd = formatYmd(new Date()),
): string {
  const byId = new Map(agents.map((a) => [a.id, a]))
  const cursorStart = localYmdFromIso(byId.get('cursor')?.usageReset?.cycleStart)
  if (cursorStart && cursorStart <= todayYmd) return cursorStart

  // Prefer real billing/month windows; take the most recently started one.
  const billingStarts = agents
    .filter((a) =>
      (a.usageReset?.windows ?? []).some((w) =>
        /billing|month/i.test(w.label),
      ),
    )
    .map((a) => localYmdFromIso(a.usageReset?.cycleStart))
    .flatMap((d) => (d != null && d <= todayYmd ? [d] : []))
  if (billingStarts.length > 0) {
    return billingStarts.reduce((max, d) => (d > max ? d : max))
  }

  return todayYmd
}

function agentStartDate(
  _agent: AgentShare,
  chartStart: string,
): string {
  // Shared time_0 for all agents: this billing cycle start.
  return chartStart
}

/**
 * Build one cumulative curve per agent for this billing cycle.
 * X domain is always [billingCycleStart, today].
 * When plan used% is known, the line ends at that percent (activity weighted).
 * Otherwise the line ends at 100% of that agent's own cycle activity.
 */
export function buildCumulativeChart(
  agents: AgentShare[],
  todayYmd = formatYmd(new Date()),
): CumulativeChartModel {
  const byId = new Map(agents.map((a) => [a.id, a]))
  const start = chartDomainStart(agents, todayYmd)
  const end = todayYmd
  const days = enumerateDays(start, end)

  if (days.length === 0) {
    return {
      points: [],
      startDate: start,
      endDate: end,
      yLabel: 'Cumulative usage %',
      hasData: false,
    }
  }

  const anyPlanPercent = AGENT_IDS.some((id) => {
    const agent = byId.get(id)
    if (!agent) return false
    return primaryUsageWindow(agent)?.usedPercent != null
  })

  const series: Record<(typeof AGENT_IDS)[number], Array<number | null>> = {
    cursor: [],
    claude: [],
    codex: [],
  }

  for (const id of AGENT_IDS) {
    const agent = byId.get(id)
    if (!agent?.available) {
      series[id] = days.map(() => null)
      continue
    }

    const agentStart = agentStartDate(agent, start)
    const dailyAmount = new Map(agent.daily.map((d) => [d.date, d.primary]))
    // Only count activity inside the chart window for scaling.
    const total = days.reduce((s, date) => {
      if (date < agentStart) return s
      return s + (dailyAmount.get(date) ?? 0)
    }, 0)
    const planPercent = primaryUsageWindow(agent)?.usedPercent
    const scale =
      total > 0
        ? planPercent != null
          ? planPercent / total
          : 100 / total
        : 0

    let running = 0
    series[id] = days.map((date) => {
      if (date < agentStart) return null
      running += dailyAmount.get(date) ?? 0
      if (total <= 0) {
        // Flat line from cycle start: known plan % or 0.
        return planPercent != null ? Math.min(planPercent, 100) : 0
      }
      return Math.round(running * scale * 10) / 10
    })
  }

  const points: CumulativeSeriesPoint[] = days.map((date, i) => ({
    date,
    cursor: series.cursor[i] ?? null,
    claude: series.claude[i] ?? null,
    codex: series.codex[i] ?? null,
  }))

  const hasData = points.some(
    (p) =>
      p.cursor != null || p.claude != null || p.codex != null,
  )

  return {
    points,
    startDate: start,
    endDate: end,
    yLabel: anyPlanPercent
      ? 'Cumulative plan usage %'
      : 'Cumulative activity %',
    hasData,
  }
}
