import cors from 'cors'
import express from 'express'
import { collectClaude } from './collectors/claude.js'
import { collectCodex } from './collectors/codex.js'
import { collectCursor } from './collectors/cursor.js'
import { collectGithub } from './collectors/github.js'
import { collectSystem } from './collectors/system.js'
import type { AgentShare, DashboardPayload } from './types.js'

const PORT = Number(process.env.PORT ?? 3847)

function withShares(
  agents: Awaited<ReturnType<typeof collectClaude>>[],
): AgentShare[] {
  const total = agents.reduce((s, a) => s + Math.max(0, a.score), 0)
  return agents.map((a) => ({
    ...a,
    percent:
      total > 0
        ? Math.round((Math.max(0, a.score) / total) * 1000) / 10
        : 0,
  }))
}

async function buildPayload(): Promise<DashboardPayload> {
  const [claude, codex] = await Promise.all([
    collectClaude(),
    collectCodex(),
  ])
  const cursor = collectCursor()
  const agents = withShares([cursor, claude, codex])
  return {
    generatedAt: new Date().toISOString(),
    agents,
    system: collectSystem(),
    github: collectGithub(),
  }
}

const app = express()
app.use(cors())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/dashboard', async (_req, res) => {
  try {
    const payload = await buildPayload()
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`agent-dashboard API on http://127.0.0.1:${PORT}`)
})
