import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { buildStats } from '../lib/agents.js'
import { localDateFromTimestamp } from '../lib/range.js'
import type { AgentUsage, DailyPoint } from '../types.js'

const SESSIONS = join(homedir(), '.grok', 'sessions')

const HINT =
  'Run Grok (xAI) so session logs appear under ~/.grok/sessions/.'

type DayBucket = {
  tokens: number
  turns: number
  input: number
  output: number
  cacheTokens: number
  reasoningTokens: number
}

function walkSessionFiles(
  dir: string,
  out: { updates: string[]; summaries: string[] } = {
    updates: [],
    summaries: [],
  },
): { updates: string[]; summaries: string[] } {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkSessionFiles(p, out)
    else if (name === 'updates.jsonl') out.updates.push(p)
    else if (name === 'summary.json') out.summaries.push(p)
  }
  return out
}

function dayFromUnixSec(sec: number | undefined): string | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return null
  // Grok timestamps are unix seconds; tolerate ms if present.
  const ms = sec > 1e12 ? sec : sec * 1000
  return localDateFromTimestamp(new Date(ms).toISOString())
}

function emptyDay(): DayBucket {
  return {
    tokens: 0,
    turns: 0,
    input: 0,
    output: 0,
    cacheTokens: 0,
    reasoningTokens: 0,
  }
}

export async function collectGrok(): Promise<AgentUsage> {
  const byDay = new Map<string, DayBucket>()
  let sessions = 0
  let turns = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheTokens = 0
  let reasoningTokens = 0
  let totalTokens = 0
  let note: string | undefined
  const rootExists = existsSync(SESSIONS)

  if (!rootExists) {
    return {
      id: 'grok',
      name: 'Grok (xAI)',
      score: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: buildStats([], 30),
      note: 'Grok sessions folder not found.',
      hint: HINT,
    }
  }

  try {
    const files = walkSessionFiles(SESSIONS)
    sessions = files.summaries.length

    // Prefer turn_completed usage rows in updates.jsonl (authoritative tokens).
    for (const file of files.updates) {
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
        const params = o.params as Record<string, unknown> | undefined
        const update = params?.update as Record<string, unknown> | undefined
        if (!update || update.sessionUpdate !== 'turn_completed') continue

        const usage = update.usage as Record<string, number> | undefined
        if (!usage) continue

        const inn = Number(usage.inputTokens ?? usage.input_tokens ?? 0) || 0
        const outn = Number(usage.outputTokens ?? usage.output_tokens ?? 0) || 0
        const cache =
          (Number(usage.cachedReadTokens ?? usage.cache_read_input_tokens ?? 0) ||
            0) +
          (Number(
            usage.cacheCreationTokens ?? usage.cache_creation_input_tokens ?? 0,
          ) || 0)
        const reason =
          Number(usage.reasoningTokens ?? usage.reasoning_tokens ?? 0) || 0
        // Prefer provider totalTokens (already includes cache/reasoning breakdown).
        const total =
          Number(usage.totalTokens ?? usage.total_tokens ?? 0) ||
          inn + outn

        turns += 1
        inputTokens += inn
        outputTokens += outn
        cacheTokens += cache
        reasoningTokens += reason
        totalTokens += total

        const meta = params?._meta as Record<string, unknown> | undefined
        const ts =
          dayFromUnixSec(typeof o.timestamp === 'number' ? o.timestamp : undefined) ??
          dayFromUnixSec(
            typeof meta?.agentTimestampMs === 'number'
              ? (meta.agentTimestampMs as number)
              : undefined,
          )
        if (!ts) continue
        const cur = byDay.get(ts) ?? emptyDay()
        cur.turns += 1
        cur.tokens += total
        cur.input += inn
        cur.output += outn
        cur.cacheTokens += cache
        cur.reasoningTokens += reason
        byDay.set(ts, cur)
      }
    }

    // If no updates.jsonl usage yet, fall back to summary message counts by day.
    if (turns === 0 && files.summaries.length > 0) {
      for (const file of files.summaries) {
        try {
          const raw = JSON.parse(readFileSync(file, 'utf8')) as {
            updated_at?: string
            created_at?: string
            last_active_at?: string
            num_messages?: number
            num_chat_messages?: number
          }
          const ts = localDateFromTimestamp(
            raw.last_active_at ?? raw.updated_at ?? raw.created_at ?? '',
          )
          if (!ts) continue
          const messages =
            Number(raw.num_messages ?? raw.num_chat_messages ?? 0) || 0
          if (messages <= 0) continue
          const cur = byDay.get(ts) ?? emptyDay()
          cur.turns += messages
          byDay.set(ts, cur)
          turns += messages
        } catch {
          // skip bad summary
        }
      }
    }
  } catch (err) {
    note = err instanceof Error ? err.message : String(err)
  }

  const daily: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, v]) => {
      const useTokens = v.tokens > 0
      return {
        date,
        primary: useTokens ? v.tokens : v.turns,
        secondary: useTokens ? v.output : undefined,
        primaryLabel: useTokens ? 'tokens' : 'turns',
        secondaryLabel: useTokens ? 'output' : undefined,
        extras: {
          tokens: v.tokens,
          turns: v.turns,
          messages: v.turns,
          input: v.input,
          output: v.output,
          cacheTokens: v.cacheTokens,
          reasoningTokens: v.reasoningTokens,
        },
      }
    })

  const stats = buildStats(daily, 30)
  const score =
    totalTokens > 0 ? totalTokens : turns * 800 + sessions * 2000
  const available = !note && (sessions > 0 || turns > 0)

  return {
    id: 'grok',
    name: 'Grok (xAI)',
    score,
    available,
    metrics: {
      sessions,
      turns,
      inputTokens,
      outputTokens,
      cacheTokens,
      reasoningTokens,
      totalTokens,
    },
    daily,
    stats,
    note:
      note ??
      (!available
        ? 'No Grok session logs yet.'
        : totalTokens === 0 && turns > 0
          ? 'Sessions found; token fields sparse in local logs. Score uses turn volume.'
          : undefined),
    hint: !available && !note ? HINT : undefined,
  }
}
