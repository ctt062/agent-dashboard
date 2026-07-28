import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { buildStats } from '../lib/agents.js'
import { localDateFromCursorStamp } from '../lib/cursor-stamp.js'
import { formatLocalDate } from '../lib/range.js'
import type { AgentUsage, DailyPoint } from '../types.js'

const DB = join(
  homedir(),
  'Library/Application Support/Cursor/User/globalStorage/state.vscdb',
)
const PROJECTS = join(homedir(), '.cursor', 'projects')
const ACP_SESSIONS = join(homedir(), '.cursor', 'acp-sessions')

const INSTALL_HINT =
  'Install Cursor and use Agent / Tab / Chat so local activity is recorded.'
const EMPTY_HINT =
  'Use Agent / Tab / Chat in Cursor so activity appears in local stats.'

const TIMESTAMP_RE = /<timestamp>([^<]+)<\/timestamp>/i

type DayBucket = {
  accepted: number
  suggested: number
  agentMessages: number
  agentSessions: number
}

function emptyDay(): DayBucket {
  return { accepted: 0, suggested: 0, agentMessages: 0, agentSessions: 0 }
}

function walkAgentTranscripts(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walkAgentTranscripts(p, out)
    else if (name.endsWith('.jsonl') && p.includes('agent-transcripts')) {
      out.push(p)
    }
  }
  return out
}

function bump(
  map: Map<string, DayBucket>,
  date: string,
  patch: Partial<DayBucket>,
): void {
  const cur = map.get(date) ?? emptyDay()
  cur.accepted += patch.accepted ?? 0
  cur.suggested += patch.suggested ?? 0
  cur.agentMessages += patch.agentMessages ?? 0
  cur.agentSessions += patch.agentSessions ?? 0
  map.set(date, cur)
}

async function ingestAgentTranscripts(dailyMap: Map<string, DayBucket>): Promise<{
  files: number
  messages: number
}> {
  const files = walkAgentTranscripts(PROJECTS)
  let messages = 0
  for (const file of files) {
    const rl = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })
    for await (const line of rl) {
      if (!line.trim()) continue
      let o: { role?: string; message?: unknown }
      try {
        o = JSON.parse(line) as { role?: string; message?: unknown }
      } catch {
        continue
      }
      if (o.role !== 'user' && o.role !== 'assistant') continue
      const stamp = TIMESTAMP_RE.exec(JSON.stringify(o.message ?? o))
      const date = stamp ? localDateFromCursorStamp(stamp[1]) : null
      if (!date) continue
      messages += 1
      bump(dailyMap, date, { agentMessages: 1 })
    }
  }
  return { files: files.length, messages }
}

function ingestAcpSessions(dailyMap: Map<string, DayBucket>): number {
  if (!existsSync(ACP_SESSIONS)) return 0
  let sessions = 0
  for (const name of readdirSync(ACP_SESSIONS)) {
    const p = join(ACP_SESSIONS, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    sessions += 1
    bump(dailyMap, formatLocalDate(new Date(st.mtimeMs)), { agentSessions: 1 })
  }
  return sessions
}

export async function collectCursor(): Promise<AgentUsage> {
  const dailyMap = new Map<string, DayBucket>()
  let acceptedLines = 0
  let suggestedLines = 0
  let composers = 0
  let bubbles = 0
  let costCents = 0
  let agentTranscriptFiles = 0
  let agentMessages = 0
  let agentSessions = 0
  let note: string | undefined
  const dbExists = existsSync(DB)

  if (dbExists) {
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
          bump(dailyMap, date, { accepted, suggested })
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
  }

  try {
    const transcripts = await ingestAgentTranscripts(dailyMap)
    agentTranscriptFiles = transcripts.files
    agentMessages = transcripts.messages
    agentSessions = ingestAcpSessions(dailyMap)
  } catch (err) {
    note =
      note ??
      (err instanceof Error ? err.message : String(err))
  }

  const daily: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, v]) => {
      const primary =
        v.accepted > 0 ? v.accepted : v.agentMessages > 0 ? v.agentMessages : v.agentSessions
      const secondary =
        v.accepted > 0
          ? v.suggested
          : v.agentMessages > 0
            ? v.agentSessions
            : undefined
      return {
        date,
        primary,
        secondary,
        primaryLabel:
          v.accepted > 0
            ? 'accepted'
            : v.agentMessages > 0
              ? 'agentMessages'
              : 'agentSessions',
        secondaryLabel:
          v.accepted > 0
            ? 'suggested'
            : v.agentMessages > 0
              ? 'agentSessions'
              : undefined,
        extras: {
          accepted: v.accepted,
          suggested: v.suggested,
          agentMessages: v.agentMessages,
          agentSessions: v.agentSessions,
        },
      }
    })

  const stats = buildStats(daily, 30)
  const score =
    acceptedLines +
    agentMessages * 50 +
    agentSessions * 100 +
    composers * 5 +
    bubbles * 0.02
  const available =
    !note &&
    (daily.length > 0 ||
      composers > 0 ||
      bubbles > 0 ||
      agentMessages > 0 ||
      agentSessions > 0 ||
      dbExists)

  return {
    id: 'cursor',
    name: 'Cursor',
    score,
    available: Boolean(available),
    metrics: {
      acceptedLines,
      suggestedLines,
      acceptanceRate:
        suggestedLines > 0
          ? Math.round((acceptedLines / suggestedLines) * 1000) / 10
          : 0,
      composers,
      messages: bubbles,
      agentTranscriptFiles,
      agentMessages,
      agentSessions,
      costUsd: Math.round((costCents / 100) * 100) / 100,
    },
    daily,
    stats,
    note:
      note ??
      (!dbExists && agentMessages === 0 && agentSessions === 0
        ? 'Cursor state database not found.'
        : daily.length === 0
          ? 'Cursor is installed but no local AI activity was found yet.'
          : undefined),
    hint:
      !available && !note
        ? !dbExists && agentMessages === 0
          ? INSTALL_HINT
          : EMPTY_HINT
        : undefined,
  }
}
