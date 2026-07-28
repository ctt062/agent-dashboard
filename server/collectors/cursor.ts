import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { buildStats } from '../lib/agents.js'
import type { AgentUsage, DailyPoint } from '../types.js'

const DB = join(
  homedir(),
  'Library/Application Support/Cursor/User/globalStorage/state.vscdb',
)

const INSTALL_HINT =
  'Install Cursor and use Agent / Tab / Chat so AI line stats land in the local SQLite DB.'
const EMPTY_HINT =
  'Use Agent / Tab / Chat so AI line stats land in the local SQLite DB.'

export function collectCursor(): AgentUsage {
  const dailyMap = new Map<string, { accepted: number; suggested: number }>()
  let acceptedLines = 0
  let suggestedLines = 0
  let composers = 0
  let bubbles = 0
  let costCents = 0
  let note: string | undefined
  const dbExists = existsSync(DB)

  if (!dbExists) {
    return {
      id: 'cursor',
      name: 'Cursor',
      score: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: buildStats([], 30),
      note: 'Cursor state database not found.',
      hint: INSTALL_HINT,
    }
  }

  try {
    const db = new DatabaseSync(DB, { readOnly: true })
    const rows = db
      .prepare(
        `SELECT key, value FROM ItemTable WHERE key LIKE 'aiCodeTracking.dailyStats%' ORDER BY key ASC`,
      )
      .all() as Array<{ key: string; value: string }>

    for (const row of rows) {
      try {
        const d = JSON.parse(row.value) as {
          date?: string
          composerAcceptedLines?: number
          composerSuggestedLines?: number
          tabAcceptedLines?: number
          tabSuggestedLines?: number
        }
        const date = d.date ?? row.key.slice(-10)
        const accepted =
          (d.composerAcceptedLines ?? 0) + (d.tabAcceptedLines ?? 0)
        const suggested =
          (d.composerSuggestedLines ?? 0) + (d.tabSuggestedLines ?? 0)
        acceptedLines += accepted
        suggestedLines += suggested
        const cur = dailyMap.get(date) ?? { accepted: 0, suggested: 0 }
        cur.accepted += accepted
        cur.suggested += suggested
        dailyMap.set(date, cur)
      } catch {
        /* skip bad row */
      }
    }

    composers = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM cursorDiskKV WHERE key LIKE 'composerData:%'`,
        )
        .get() as { c: number }
    ).c
    bubbles = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'`,
        )
        .get() as { c: number }
    ).c

    const composersWithUsage = db
      .prepare(
        `SELECT value FROM cursorDiskKV WHERE key LIKE 'composerData:%'`,
      )
      .all() as Array<{ value: string }>
    for (const row of composersWithUsage) {
      try {
        const d = JSON.parse(row.value) as {
          usageData?: Record<string, { costInCents?: number }>
        }
        for (const u of Object.values(d.usageData ?? {})) {
          costCents += u.costInCents ?? 0
        }
      } catch {
        /* skip */
      }
    }
    db.close()
  } catch (err) {
    note = err instanceof Error ? err.message : String(err)
  }

  const daily: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, v]) => ({
      date,
      primary: v.accepted,
      secondary: v.suggested,
      primaryLabel: 'accepted',
      secondaryLabel: 'suggested',
      extras: { accepted: v.accepted, suggested: v.suggested },
    }))

  const stats = buildStats(daily, 30)
  const score = acceptedLines + composers * 50 + bubbles * 0.05
  const available = !note && (daily.length > 0 || composers > 0 || bubbles > 0)

  return {
    id: 'cursor',
    name: 'Cursor',
    score,
    available,
    metrics: {
      acceptedLines,
      suggestedLines,
      acceptanceRate:
        suggestedLines > 0
          ? Math.round((acceptedLines / suggestedLines) * 1000) / 10
          : 0,
      composers,
      messages: bubbles,
      costUsd: Math.round((costCents / 100) * 100) / 100,
    },
    daily,
    stats,
    note:
      note ??
      (daily.length === 0
        ? 'Cursor is installed but AI daily stats are empty yet.'
        : undefined),
    hint: !available && !note ? EMPTY_HINT : undefined,
  }
}
