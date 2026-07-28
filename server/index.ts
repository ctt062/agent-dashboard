import express from 'express'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectClaude } from './collectors/claude.js'
import { collectCodex } from './collectors/codex.js'
import { collectCursor } from './collectors/cursor.js'
import { collectGithub } from './collectors/github.js'
import { collectSystem } from './collectors/system.js'
import { collectUsageResets } from './collectors/usageResets.js'
import { applyRange, withShares } from './lib/agents.js'
import { parseRange, rangeStartDate } from './lib/range.js'
import type { DashboardPayload, RawCollectors, UsageReset } from './types.js'

const PORT = Number(process.env.PORT ?? 3847)
/** Default loopback. Set HOST=0.0.0.0 to reach from phone on the same LAN. */
const HOST = process.env.HOST ?? '127.0.0.1'
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 10_000)
const USAGE_RESETS_TTL_MS = Number(process.env.USAGE_RESETS_TTL_MS ?? 180_000)
const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '../dist')

type UsageResetsPayload = {
  cursor: UsageReset
  claude: UsageReset
  codex: UsageReset
}

let cache: { at: number; data: RawCollectors } | null = null
let inflight: Promise<RawCollectors> | null = null
let usageResetsCache: { at: number; data: UsageResetsPayload } | null = null
let usageResetsInflight: Promise<UsageResetsPayload> | null = null

function lanUrls(port: number): string[] {
  const out: string[] = []
  const nets = networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push(`http://${net.address}:${port}`)
      }
    }
  }
  return out
}

async function getUsageResets(): Promise<UsageResetsPayload> {
  if (
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
  if (!inflight) {
    inflight = (async () => {
      const [cursor, claude, codex, system, github, resets] = await Promise.all([
        Promise.resolve().then(() => collectCursor()),
        collectClaude(),
        collectCodex(),
        Promise.resolve().then(() => collectSystem()),
        Promise.resolve().then(() => collectGithub()),
        getUsageResets(),
      ])
      cursor.usageReset = resets.cursor
      claude.usageReset = resets.claude
      codex.usageReset = resets.codex
      const data: RawCollectors = { cursor, claude, codex, system, github }
      cache = { at: Date.now(), data }
      return data
    })().finally(() => {
      inflight = null
    })
  }
  const data = await inflight
  return { data, cached: false }
}

async function buildPayload(
  rangeParam: unknown,
  force = false,
): Promise<DashboardPayload> {
  const range = parseRange(rangeParam)
  const since = rangeStartDate(range)
  const { data, cached } = await collectRaw(force)
  const agents = withShares(
    [data.cursor, data.claude, data.codex].map((a) =>
      applyRange(a, range, since),
    ),
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
  console.log(`agent-dashboard ${mode} on http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`)
  if (HOST === '0.0.0.0' || HOST === '::') {
    const urls = lanUrls(PORT)
    if (urls.length > 0) {
      if (servingUi) {
        console.log('Phone / LAN (same Wi-Fi):')
        for (const url of urls) console.log(`  ${url}`)
      } else {
        console.log('API only (LAN, same Wi-Fi):')
        for (const url of urls) console.log(`  ${url}`)
        console.log(
          'Phone UI: open the Vite network URL on port 5174 (from `npm run dev:lan`), not these API URLs.',
        )
      }
    } else {
      console.log('LAN bind enabled, but no non-loopback IPv4 address was found.')
    }
    console.log('Only use on a trusted network. This exposes local agent + Mac metrics.')
  }
  if (!servingUi) {
    console.log('Tip: run `npm run build` (or `npm run serve`) to serve the UI from this port.')
  }
})
