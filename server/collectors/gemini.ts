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
import { formatLocalDate, localDateFromTimestamp } from '../lib/range.js'
import type { AgentUsage, DailyPoint } from '../types.js'

const GEMINI_HOME = join(homedir(), '.gemini')
const ANTIGRAVITY_DB = join(
  homedir(),
  'Library/Application Support/Antigravity/User/globalStorage/state.vscdb',
)

const HINT =
  'Install Gemini CLI / Antigravity and run a session so local logs appear under ~/.gemini or Antigravity app data.'

type DayBucket = {
  tokens: number
  messages: number
  events: number
  input: number
  output: number
}

function walkFiles(
  dir: string,
  pred: (name: string) => boolean,
  out: string[] = [],
): string[] {
  if (!existsSync(dir)) return out
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walkFiles(p, pred, out)
    else if (pred(name)) out.push(p)
  }
  return out
}

function emptyDay(): DayBucket {
  return { tokens: 0, messages: 0, events: 0, input: 0, output: 0 }
}

function bump(
  byDay: Map<string, DayBucket>,
  date: string,
  patch: Partial<DayBucket>,
) {
  const cur = byDay.get(date) ?? emptyDay()
  cur.tokens += patch.tokens ?? 0
  cur.messages += patch.messages ?? 0
  cur.events += patch.events ?? 0
  cur.input += patch.input ?? 0
  cur.output += patch.output ?? 0
  byDay.set(date, cur)
}

function pickUsage(obj: unknown): Record<string, number> | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  for (const key of ['usage', 'token_usage', 'tokenUsage', 'tokens']) {
    const u = o[key]
    if (u && typeof u === 'object') return u as Record<string, number>
  }
  return null
}

function dayFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    // HTTP-date or ISO
    return localDateFromTimestamp(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000
    return formatLocalDate(new Date(ms))
  }
  return null
}

/** Best-effort Antigravity install signal (session telemetry dates). */
function collectAntigravityDays(byDay: Map<string, DayBucket>): number {
  if (!existsSync(ANTIGRAVITY_DB)) return 0
  let sessions = 0
  try {
    const db = new DatabaseSync(ANTIGRAVITY_DB, { readOnly: true })
    for (const key of [
      'telemetry.currentSessionDate',
      'telemetry.firstSessionDate',
      'telemetry.lastSessionDate',
    ]) {
      const row = db
        .prepare(`SELECT value FROM ItemTable WHERE key = ?`)
        .get(key) as { value: string } | undefined
      if (!row?.value) continue
      const day = dayFromUnknown(row.value)
      if (!day) continue
      bump(byDay, day, { events: 1, messages: 1 })
      sessions += 1
    }
    db.close()
  } catch {
    // ignore unreadable db
  }
  return sessions
}

export async function collectGemini(): Promise<AgentUsage> {
  const byDay = new Map<string, DayBucket>()
  let sessions = 0
  let messages = 0
  let events = 0
  let inputTokens = 0
  let outputTokens = 0
  let note: string | undefined

  const homeExists = existsSync(GEMINI_HOME)
  const antiExists = existsSync(ANTIGRAVITY_DB)

  if (!homeExists && !antiExists) {
    return {
      id: 'gemini',
      name: 'Gemini',
      score: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: buildStats([], 30),
      note: 'Gemini / Antigravity data not found.',
      hint: HINT,
    }
  }

  try {
    // JSONL logs under ~/.gemini (CLI / tools) when present.
    const jsonl = walkFiles(
      GEMINI_HOME,
      (name) => name.endsWith('.jsonl') || name.endsWith('.json'),
    )
    for (const file of jsonl) {
      if (file.endsWith('.json') && !file.endsWith('.jsonl')) {
        // Skip pure config JSON; only parse lightweight log-like names.
        if (!/history|session|log|chat|usage/i.test(file)) continue
      }
      sessions += 1
      if (!file.endsWith('.jsonl')) continue
      const rl = createInterface({
        input: createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      })
      for await (const line of rl) {
        if (!line.trim()) continue
        let o: Record<string, unknown>
        try {
          o = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue
        }
        events += 1
        const ts =
          dayFromUnknown(o.timestamp) ??
          dayFromUnknown(o.ts) ??
          dayFromUnknown(o.created_at) ??
          dayFromUnknown(o.time) ??
          null
        const type = String(o.type ?? o.role ?? o.kind ?? '')
        const isMessage = /user|assistant|model|message|turn/i.test(type)
        if (isMessage) messages += 1
        if (ts) {
          bump(byDay, ts, {
            events: 1,
            messages: isMessage ? 1 : 0,
          })
        }
        const usage = pickUsage(o) ?? pickUsage(o.message)
        if (!usage) continue
        const inn =
          Number(
            usage.input_tokens ??
              usage.inputTokens ??
              usage.promptTokenCount ??
              usage.prompt_tokens ??
              0,
          ) || 0
        const outn =
          Number(
            usage.output_tokens ??
              usage.outputTokens ??
              usage.candidatesTokenCount ??
              usage.completion_tokens ??
              0,
          ) || 0
        const total =
          Number(usage.total_tokens ?? usage.totalTokens ?? 0) || inn + outn
        inputTokens += inn
        outputTokens += outn
        if (ts && total > 0) {
          bump(byDay, ts, {
            tokens: total,
            input: inn,
            output: outn,
          })
        }
      }
    }

    const antiSessions = collectAntigravityDays(byDay)
    sessions += antiSessions
  } catch (err) {
    note = err instanceof Error ? err.message : String(err)
  }

  const totalTokens = inputTokens + outputTokens
  const daily: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, v]) => {
      const useTokens = v.tokens > 0
      return {
        date,
        primary: useTokens ? v.tokens : v.messages || v.events,
        secondary: useTokens ? v.output : undefined,
        primaryLabel: useTokens
          ? 'tokens'
          : v.messages > 0
            ? 'messages'
            : 'events',
        secondaryLabel: useTokens ? 'output' : undefined,
        extras: {
          tokens: v.tokens,
          messages: v.messages,
          events: v.events,
          input: v.input,
          output: v.output,
        },
      }
    })

  const stats = buildStats(daily, 30)
  const score =
    totalTokens > 0
      ? totalTokens
      : messages * 800 + events * 120 + sessions * 500
  const available =
    !note && (sessions > 0 || messages > 0 || events > 0 || daily.length > 0)

  return {
    id: 'gemini',
    name: 'Gemini',
    score,
    available,
    metrics: {
      sessions,
      messages,
      events,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    daily,
    stats,
    note:
      note ??
      (!available
        ? 'No Gemini / Antigravity session activity found yet.'
        : totalTokens === 0
          ? 'Local Gemini footprint found; token fields sparse. Score uses activity volume.'
          : undefined),
    hint: !available && !note ? HINT : undefined,
  }
}
