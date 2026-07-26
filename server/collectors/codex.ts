import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AgentUsage, DailyPoint } from '../types.js'

const SESSIONS = join(homedir(), '.codex', 'sessions')

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkJsonl(p, out)
    else if (name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

function pickUsage(obj: unknown): Record<string, number> | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  for (const key of ['usage', 'token_usage', 'tokenUsage', 'tokens']) {
    const u = o[key]
    if (u && typeof u === 'object') return u as Record<string, number>
  }
  const payload = o.payload
  if (payload && typeof payload === 'object') {
    return pickUsage(payload)
  }
  return null
}

export async function collectCodex(): Promise<AgentUsage> {
  const byDay = new Map<
    string,
    { tokens: number; events: number }
  >()
  let sessions = 0
  let events = 0
  let inputTokens = 0
  let outputTokens = 0
  let note: string | undefined

  try {
    const files = walkJsonl(SESSIONS)
    sessions = files.length
    for (const file of files) {
      const dayFromName = file.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
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
          typeof o.timestamp === 'string'
            ? o.timestamp.slice(0, 10)
            : dayFromName
        if (ts) {
          const cur = byDay.get(ts) ?? { tokens: 0, events: 0 }
          cur.events += 1
          byDay.set(ts, cur)
        }
        const usage = pickUsage(o)
        if (!usage) continue
        const inn =
          usage.input_tokens ??
          usage.inputTokens ??
          usage.input ??
          0
        const outn =
          usage.output_tokens ??
          usage.outputTokens ??
          usage.output ??
          usage.reasoning_output_tokens ??
          0
        const total = Number(inn) + Number(outn)
        inputTokens += Number(inn) || 0
        outputTokens += Number(outn) || 0
        if (ts && total > 0) {
          const cur = byDay.get(ts) ?? { tokens: 0, events: 0 }
          cur.tokens += total
          byDay.set(ts, cur)
        }
      }
    }
  } catch (err) {
    note = err instanceof Error ? err.message : String(err)
  }

  const daily: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-60)
    .map(([date, v]) => ({
      date,
      value: v.tokens > 0 ? v.tokens : v.events,
      label: v.tokens > 0 ? 'tokens' : 'events',
    }))

  const totalTokens = inputTokens + outputTokens
  const score =
    totalTokens > 0 ? totalTokens : events * 120 + sessions * 1500

  return {
    id: 'codex',
    name: 'Codex',
    score,
    metrics: {
      sessions,
      events,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    daily,
    note:
      note ??
      (totalTokens === 0 && sessions > 0
        ? 'Session logs found; token usage sparse in local rollouts. Score uses event volume.'
        : undefined),
  }
}
