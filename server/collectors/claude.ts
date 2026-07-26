import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AgentUsage, DailyPoint } from '../types.js'

const PROJECTS = join(homedir(), '.claude', 'projects')

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

export async function collectClaude(): Promise<AgentUsage> {
  const byDay = new Map<
    string,
    { tokens: number; messages: number; input: number; output: number }
  >()
  let sessions = 0
  let messages = 0
  let inputTokens = 0
  let outputTokens = 0
  let note: string | undefined

  try {
    const files = walkJsonl(PROJECTS)
    sessions = files.length
    for (const file of files) {
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
        const ts = typeof o.timestamp === 'string' ? o.timestamp.slice(0, 10) : null
        const type = o.type
        if (type === 'user' || type === 'assistant') {
          messages += 1
          if (ts) {
            const cur = byDay.get(ts) ?? {
              tokens: 0,
              messages: 0,
              input: 0,
              output: 0,
            }
            cur.messages += 1
            byDay.set(ts, cur)
          }
        }
        const msg = o.message as
          | { usage?: Record<string, number> }
          | undefined
        const usage = (msg?.usage ?? o.usage) as
          | Record<string, number>
          | undefined
        if (!usage) continue
        const inn = usage.input_tokens ?? 0
        const outn = usage.output_tokens ?? 0
        const cache =
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0)
        const total = inn + outn + cache
        inputTokens += inn
        outputTokens += outn
        if (ts && total > 0) {
          const cur = byDay.get(ts) ?? {
            tokens: 0,
            messages: 0,
            input: 0,
            output: 0,
          }
          cur.tokens += total
          cur.input += inn
          cur.output += outn
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
      value: v.tokens > 0 ? v.tokens : v.messages,
      label: v.tokens > 0 ? 'tokens' : 'messages',
    }))

  const totalTokens = inputTokens + outputTokens
  // Prefer tokens; fall back to message volume when token logs are empty
  const score = totalTokens > 0 ? totalTokens : messages * 800 + sessions * 2000

  return {
    id: 'claude',
    name: 'Claude Code',
    score,
    metrics: {
      sessions,
      messages,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    daily,
    note:
      note ??
      (totalTokens === 0 && messages > 0
        ? 'Local sessions found; token fields mostly empty (billing/API gaps). Score uses message volume.'
        : undefined),
  }
}
