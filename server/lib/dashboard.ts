import { collectClaude } from '../collectors/claude.js'
import { collectCodex } from '../collectors/codex.js'
import { collectCursor } from '../collectors/cursor.js'
import { collectGemini } from '../collectors/gemini.js'
import { collectGithub } from '../collectors/github.js'
import { collectGrok } from '../collectors/grok.js'
import { collectSystem } from '../collectors/system.js'
import { collectUsageResets } from '../collectors/usageResets.js'
import type { DashboardPayload, RawCollectors, UsageReset } from '../types.js'
import { applyRange, withShares } from './agents.js'
import { daysInRange, parseRange, rangeStartDate } from './range.js'

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 10_000)
const USAGE_RESETS_TTL_MS = Number(process.env.USAGE_RESETS_TTL_MS ?? 180_000)

type UsageResetsPayload = {
  cursor: UsageReset
  grok: UsageReset
  claude: UsageReset
  gemini: UsageReset
  codex: UsageReset
}

let cache: { at: number; data: RawCollectors } | null = null
let inflight: Promise<RawCollectors> | null = null
let usageResetsCache: { at: number; data: UsageResetsPayload } | null = null
let usageResetsInflight: Promise<UsageResetsPayload> | null = null

async function getUsageResets(force = false): Promise<UsageResetsPayload> {
  if (force) {
    usageResetsCache = null
  }
  if (
    !force &&
    usageResetsCache &&
    Date.now() - usageResetsCache.at < USAGE_RESETS_TTL_MS
  ) {
    return usageResetsCache.data
  }
  if (!usageResetsInflight) {
    usageResetsInflight = collectUsageResets()
      .then((data) => {
        usageResetsCache = { at: Date.now(), data }
        return data
      })
      .finally(() => {
        usageResetsInflight = null
      })
  }
  return usageResetsInflight
}

async function collectRaw(
  force = false,
): Promise<{ data: RawCollectors; cached: boolean }> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { data: cache.data, cached: true }
  }

  const execute = async (): Promise<RawCollectors> => {
    const [cursor, grok, claude, gemini, codex, system, github, resets] =
      await Promise.all([
        collectCursor(),
        collectGrok(),
        collectClaude(),
        collectGemini(),
        collectCodex(),
        Promise.resolve().then(() => collectSystem()),
        Promise.resolve().then(() => collectGithub()),
        getUsageResets(force),
      ])
    cursor.usageReset = resets.cursor
    grok.usageReset = resets.grok
    claude.usageReset = resets.claude
    gemini.usageReset = resets.gemini
    codex.usageReset = resets.codex
    return { cursor, grok, claude, gemini, codex, system, github }
  }

  if (!inflight) {
    inflight = execute()
      .then((data) => {
        cache = { at: Date.now(), data }
        return data
      })
      .finally(() => {
        inflight = null
      })
  }

  const data = await inflight
  return { data, cached: false }
}

/** Collect provider status in-process. Does not start an HTTP server. */
export async function buildDashboard(
  force = false,
): Promise<DashboardPayload> {
  const range = parseRange()
  const { data, cached } = await collectRaw(force)
  // Dashboard "this billing cycle" follows Cursor's plan cycle when known,
  // so other calendar windows do not pull the shared range back.
  const sharedCycleStart = data.cursor.usageReset?.cycleStart ?? null
  const agents = withShares(
    [data.cursor, data.grok, data.claude, data.gemini, data.codex].map((a) => {
      const since = rangeStartDate(range, new Date(), sharedCycleStart)
      const days = daysInRange(range, new Date(), sharedCycleStart)
      return applyRange(a, range, since, days)
    }),
  )
  return {
    generatedAt: new Date().toISOString(),
    range,
    cached,
    agents,
    system: data.system,
    github: data.github,
  }
}
