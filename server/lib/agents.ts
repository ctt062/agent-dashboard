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
 * Cursor: accepted AI lines, else agent transcript/session volume.
 * Token agents (Grok/Claude/Gemini/Codex): tokens, else message/event volume.
 */
function computePeriodScore(agent: AgentUsage, daily: DailyPoint[]): number {
  if (agent.id === 'cursor') {
    const accepted = sumExtra(daily, 'accepted')
    if (accepted > 0) return accepted
    const sumPrimary = daily.reduce((s, d) => s + d.primary, 0)
    if (sumPrimary > 0 && daily.some((d) => d.primaryLabel === 'accepted')) {
      return sumPrimary
    }
    const agentMessages = sumExtra(daily, 'agentMessages')
    const agentSessions = sumExtra(daily, 'agentSessions')
    if (agentMessages > 0 || agentSessions > 0) {
      return agentMessages * 50 + agentSessions * 100
    }
    return sumPrimary
  }

  const totalTokens = sumExtra(daily, 'tokens')
  if (agent.id === 'grok') {
    return totalTokens > 0
      ? totalTokens
      : sumExtra(daily, 'turns') * 800 || sumExtra(daily, 'messages') * 800
  }

  if (agent.id === 'claude' || agent.id === 'gemini') {
    return totalTokens > 0
      ? totalTokens
      : sumExtra(daily, 'messages') * 800 || sumExtra(daily, 'events') * 120
  }

  // codex
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

/** Align non-Cursor day primaries to one unit for the filtered window. */
function normalizePeriodDaily(agent: AgentUsage, daily: DailyPoint[]): DailyPoint[] {
  if (agent.id === 'cursor' || daily.length === 0) return daily

  const useTokens = sumExtra(daily, 'tokens') > 0
  const volumeKey =
    agent.id === 'grok'
      ? 'turns'
      : agent.id === 'codex'
        ? 'events'
        : 'messages'

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
    const volume =
      d.extras?.[volumeKey] ??
      (agent.id === 'grok'
        ? (d.extras?.messages ?? 0)
        : agent.id === 'gemini'
          ? (d.extras?.events ?? 0)
          : 0)
    return {
      ...d,
      primary: volume,
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
    const accepted = sumExtra(daily, 'accepted')
    const suggested = sumExtra(daily, 'suggested')
    const agentMessages = sumExtra(daily, 'agentMessages')
    const agentSessions = sumExtra(daily, 'agentSessions')
    return {
      ...base,
      acceptedLines: accepted,
      suggestedLines: suggested,
      acceptanceRate:
        suggested > 0 ? Math.round((accepted / suggested) * 1000) / 10 : 0,
      agentMessages,
      agentSessions,
      periodScore: score,
    }
  }

  if (agent.id === 'grok') {
    const inputTokens = sumExtra(daily, 'input')
    const outputTokens = sumExtra(daily, 'output')
    const totalTokens = sumExtra(daily, 'tokens')
    const cacheTokens = sumExtra(daily, 'cacheTokens')
    const reasoningTokens = sumExtra(daily, 'reasoningTokens')
    const turns = sumExtra(daily, 'turns') || sumExtra(daily, 'messages')
    return {
      ...base,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheTokens,
      reasoningTokens,
      turns,
      periodScore: score,
    }
  }

  if (agent.id === 'claude' || agent.id === 'gemini') {
    const inputTokens = sumExtra(daily, 'input')
    const outputTokens = sumExtra(daily, 'output')
    const totalTokens = sumExtra(daily, 'tokens')
    const cacheTokens = sumExtra(daily, 'cacheTokens')
    const messages = sumExtra(daily, 'messages')
    const events = sumExtra(daily, 'events')
    return {
      ...base,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheTokens,
      messages,
      events,
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
export function applyRange(
  agent: AgentUsage,
  range: DateRange,
  since: string,
  rangeDays?: number,
): AgentUsage {
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
  const stats = buildStats(
    daily,
    rangeDays ?? daysInRange(range, new Date(), agent.usageReset?.cycleStart),
  )
  const metrics = periodMetrics(agent, daily)

  const note =
    agent.note ??
    (!hasInRangeActivity(daily)
      ? `No activity in the selected ${
          range === 'month' ? 'billing cycle' : 'period'
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
