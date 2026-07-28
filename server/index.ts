import 'dotenv/config'
import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectClaude } from './collectors/claude.js'
import { collectCodex } from './collectors/codex.js'
import { collectCursor } from './collectors/cursor.js'
import { collectGithub } from './collectors/github.js'
import { collectSystem } from './collectors/system.js'
import { collectUsageResets } from './collectors/usageResets.js'
import { applyRange, withShares } from './lib/agents.js'
import { assertLocalhostOnly } from './lib/localhost.js'
import { parseRange, rangeStartDate, daysInRange } from './lib/range.js'
import type { DashboardPayload, RawCollectors, UsageReset } from './types.js'

const PORT = Number(process.env.PORT ?? 3847)
/** Localhost only. Non-loopback HOST values are rejected at startup. */
const HOST = process.env.HOST ?? '127.0.0.1'
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 10_000)
const USAGE_RESETS_TTL_MS = Number(process.env.USAGE_RESETS_TTL_MS ?? 180_000)
const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '../dist')

assertLocalhostOnly(HOST)

type UsageResetsPayload = {
  cursor: UsageReset
  claude: UsageReset
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

async function collectRaw(force = false): Promise<{ data: RawCollectors; cached: boolean }> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { data: cache.data, cached: true }
  }

  const execute = async (): Promise<RawCollectors> => {
    const [cursor, claude, codex, system, github, resets] = await Promise.all([
      collectCursor(),
      collectClaude(),
      collectCodex(),
      Promise.resolve().then(() => collectSystem()),
      Promise.resolve().then(() => collectGithub()),
      getUsageResets(force),
    ])
    cursor.usageReset = resets.cursor
    claude.usageReset = resets.claude
    codex.usageReset = resets.codex
    return { cursor, claude, codex, system, github }
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

async function buildPayload(
  rangeRaw: unknown,
  force = false,
): Promise<DashboardPayload> {
  const range = parseRange(typeof rangeRaw === 'string' ? rangeRaw : undefined)
  const { data, cached } = await collectRaw(force)
  // Dashboard "this billing cycle" follows Cursor's plan cycle when known,
  // so Claude's rolling weekly window does not pull the shared range back.
  const sharedCycleStart = data.cursor.usageReset?.cycleStart ?? null
  const agents = withShares(
    [data.cursor, data.claude, data.codex].map((a) => {
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

const app = express()
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dist: existsSync(DIST),
    host: HOST,
    cacheTtlMs: CACHE_TTL_MS,
    usageResetsTtlMs: USAGE_RESETS_TTL_MS,
  })
})

app.get('/api/dashboard', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true'
    const payload = await buildPayload(req.query.range, force)
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

app.get('/api/system', (_req, res) => {
  res.json(collectSystem())
})

if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(join(DIST, 'index.html'))
  })
}

app.listen(PORT, HOST, () => {
  const servingUi = existsSync(DIST)
  const mode = servingUi ? 'API + UI' : 'API only'
  console.log(`agent-dashboard ${mode} on http://127.0.0.1:${PORT}`)
  if (!servingUi) {
    console.log('Tip: run `npm run build` (or `npm run serve`) to serve the UI from this port.')
  }
})
