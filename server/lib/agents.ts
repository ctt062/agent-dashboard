import type { AgentShare, AgentStats, AgentUsage, DailyPoint } from '../types.js'
import { daysInRange, type DateRange } from './range.js'

function emptyStats(): AgentStats {
  return {
    activeDays: 0,
    avgPerDay: 0,
    peakDay: null,
    peakValue: 0,
    periodTotal: 0,
  }
}

export function buildStats(daily: DailyPoint[], rangeDays: number): AgentStats {
  if (daily.length === 0) return emptyStats()
  let periodTotal = 0
  let activeDays = 0
  let peakDay: string | null = null
  let peakValue = 0
  for (const d of daily) {
    periodTotal += d.primary
    if (d.primary > 0) activeDays += 1
    if (d.primary > peakValue) {
      peakValue = d.primary
      peakDay = d.date
    }
  }
  return {
    activeDays,
    avgPerDay: Math.round((periodTotal / Math.max(rangeDays, 1)) * 10) / 10,
    peakDay,
    peakValue,
    periodTotal,
  }
}

function sumExtra(daily: DailyPoint[], key: string): number {
  return daily.reduce((s, d) => s + (d.extras?.[key] ?? 0), 0)
}

/**
 * Period activity score for the filtered window.
 * Cursor: accepted AI lines only. Claude/Codex: tokens, else message/event volume.
 */
function computePeriodScore(agent: AgentUsage, daily: DailyPoint[]): number {
  if (agent.id === 'cursor') {
    const sumPrimary = daily.reduce((s, d) => s + d.primary, 0)
    return sumExtra(daily, 'accepted') || sumPrimary
  }

  const totalTokens = sumExtra(daily, 'tokens')
  if (agent.id === 'claude') {
    return totalTokens > 0 ? totalTokens : sumExtra(daily, 'messages') * 800
  }

  return totalTokens > 0 ? totalTokens : sumExtra(daily, 'events') * 120
}

function hasInRangeActivity(daily: DailyPoint[]): boolean {
  return daily.some(
    (d) =>
      d.primary > 0 ||
      (d.secondary ?? 0) > 0 ||
      Object.values(d.extras ?? {}).some((v) => v > 0),
  )
}

/** Align Claude/Codex day primaries to one unit for the filtered window. */
function normalizePeriodDaily(agent: AgentUsage, daily: DailyPoint[]): DailyPoint[] {
  if (agent.id === 'cursor' || daily.length === 0) return daily

  const useTokens = sumExtra(daily, 'tokens') > 0
  const volumeKey = agent.id === 'claude' ? 'messages' : 'events'

  return daily.map((d) => {
    if (useTokens) {
      return {
        ...d,
        primary: d.extras?.tokens ?? 0,
        secondary: d.extras?.output,
        primaryLabel: 'tokens',
        secondaryLabel: 'output',
      }
    }
    return {
      ...d,
      primary: d.extras?.[volumeKey] ?? 0,
      secondary: undefined,
      primaryLabel: volumeKey,
      secondaryLabel: undefined,
    }
  })
}

function periodMetrics(agent: AgentUsage, daily: DailyPoint[]): Record<string, number> {
  const score = computePeriodScore(agent, daily)
  const base = { ...agent.metrics }

  if (agent.id === 'cursor') {
    const sumPrimary = daily.reduce((s, d) => s + d.primary, 0)
    const accepted = sumExtra(daily, 'accepted') || sumPrimary
    const suggested = sumExtra(daily, 'suggested')
    return {
      ...base,
      acceptedLines: accepted,
      suggestedLines: suggested,
      acceptanceRate:
        suggested > 0 ? Math.round((accepted / suggested) * 1000) / 10 : 0,
      periodScore: score,
    }
  }

  if (agent.id === 'claude') {
    const inputTokens = sumExtra(daily, 'input')
    const outputTokens = sumExtra(daily, 'output')
    const totalTokens = sumExtra(daily, 'tokens')
    const cacheTokens = sumExtra(daily, 'cacheTokens')
    const messages = sumExtra(daily, 'messages')
    return {
      ...base,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheTokens,
      messages,
      periodScore: score,
    }
  }

  const inputTokens = sumExtra(daily, 'input')
  const outputTokens = sumExtra(daily, 'output')
  const totalTokens = sumExtra(daily, 'tokens')
  const events = sumExtra(daily, 'events')
  return {
    ...base,
    inputTokens,
    outputTokens,
    totalTokens,
    events,
    periodScore: score,
  }
}

/** Filter full-history agent data down to the selected date range and recompute score/stats. */
export function applyRange(agent: AgentUsage, range: DateRange, since: string): AgentUsage {
  if (!agent.available) {
    return {
      ...agent,
      score: 0,
      metrics: {},
      daily: [],
      stats: emptyStats(),
      usageReset: agent.usageReset,
      note: agent.note ?? 'No local data found for this agent.',
      hint: agent.hint,
    }
  }

  const filtered = agent.daily.filter((d) => d.date >= since)
  const daily = normalizePeriodDaily(agent, filtered)
  const stats = buildStats(daily, daysInRange(range))
  const metrics = periodMetrics(agent, daily)

  const note =
    agent.note ??
    (!hasInRangeActivity(daily)
      ? `No activity in the selected ${
          range === '1d' ? 'day' : range === 'month' ? 'month' : 'period'
        }.`
      : undefined)

  return {
    ...agent,
    score: metrics.periodScore,
    metrics,
    daily,
    stats,
    usageReset: agent.usageReset,
    note,
    hint: agent.hint,
  }
}

export function withShares(agents: AgentUsage[]): AgentShare[] {
  const total = agents.reduce((s, a) => s + Math.max(0, a.score), 0)
  return agents.map((a) => ({
    ...a,
    percent:
      total > 0 ? Math.round((Math.max(0, a.score) / total) * 1000) / 10 : 0,
  }))
}
