import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AgentUsage, DailyPoint } from '../types.js'

const DB = join(
  homedir(),
  'Library/Application Support/Cursor/User/globalStorage/state.vscdb',
)

export function collectCursor(): AgentUsage {
  const daily: DailyPoint[] = []
  let acceptedLines = 0
  let suggestedLines = 0
  let composers = 0
  let bubbles = 0
  let costCents = 0
  let note: string | undefined

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
        daily.push({
          date,
          value: accepted,
          label: 'accepted lines',
        })
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

  // Activity score: accepted AI lines (primary) + chat volume weight
  const score = acceptedLines + composers * 50 + bubbles * 0.05

  return {
    id: 'cursor',
    name: 'Cursor',
    score,
    metrics: {
      acceptedLines,
      suggestedLines,
      composers,
      messages: bubbles,
      costUsd: costCents / 100,
    },
    daily: daily.slice(-60),
    note,
  }
}
