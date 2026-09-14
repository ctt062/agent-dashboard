import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentShare, DashboardPayload } from '../server/types.ts'
import {
  formatDeck,
  formatGithubLine,
  formatPlanPercent,
  formatProviderRow,
  formatSystemLine,
  providerStatus,
} from './status.ts'

function agent(
  partial: Pick<AgentShare, 'id' | 'name'> & Partial<AgentShare>,
): AgentShare {
  return {
    score: 0,
    percent: 0,
    available: true,
    metrics: {},
    daily: [],
    stats: {
      activeDays: 0,
      avgPerDay: 0,
      peakDay: null,
      peakValue: 0,
      periodTotal: 0,
    },
    ...partial,
  }
}

const payload: DashboardPayload = {
  generatedAt: '2026-09-14T12:00:00.000Z',
  range: 'month',
  cached: false,
  agents: [
    agent({
      id: 'cursor',
      name: 'Cursor',
      available: true,
      usageReset: {
        ok: true,
        cycleStart: '2026-09-01T00:00:00.000Z',
        windows: [
          {
            label: 'Auto + API',
            at: '2026-10-01T00:00:00.000Z',
            usedPercent: 42.1,
          },
        ],
      },
    }),
    agent({
      id: 'grok',
      name: 'Grok (xAI)',
      available: false,
      note: 'Grok sessions folder not found.',
      hint: 'Run grok so sessions appear under ~/.grok/sessions/.',
    }),
    agent({
      id: 'claude',
      name: 'Claude Code',
      available: true,
      usageReset: { ok: false, windows: [], error: 'plan lookup failed' },
    }),
    agent({
      id: 'gemini',
      name: 'Gemini',
      available: false,
      hint: 'Use Gemini / Antigravity so local logs appear.',
    }),
    agent({
      id: 'codex',
      name: 'Codex',
      available: true,
      usageReset: {
        ok: true,
        windows: [{ label: 'Weekly', at: null, usedPercent: 8, note: 'included' }],
      },
    }),
  ],
  system: {
    hostname: 'mac.local',
    uptimeSec: 3600,
    loadAvg: [1, 1, 1],
    cpu: { model: 'Apple', cores: 8, utilization: 12.4 },
    memory: {
      totalBytes: 16,
      usedBytes: 8,
      freeBytes: 8,
      utilization: 64.2,
    },
    gpu: { utilization: 3.1, name: 'Apple', cores: 10 },
    sampledAt: '2026-09-14T12:00:00.000Z',
  },
  github: {
    ok: true,
    error: null,
    login: 'ctt062',
    totalContributions: 1234,
    days: [
      { date: '2026-09-08', count: 0, color: '#eee' },
      { date: '2026-09-09', count: 2, color: '#c6' },
      { date: '2026-09-10', count: 4, color: '#c6' },
      { date: '2026-09-11', count: 1, color: '#c6' },
      { date: '2026-09-12', count: 8, color: '#c6' },
      { date: '2026-09-13', count: 0, color: '#eee' },
      { date: '2026-09-14', count: 3, color: '#c6' },
    ],
  },
}

describe('provider status rendering', () => {
  it('shows billing-cycle plan % and availability for each provider', () => {
    const cursor = providerStatus(payload.agents[0]!)
    assert.equal(cursor.plan, '42.1%')
    assert.equal(cursor.availability, 'available')
    assert.match(cursor.detail, /Resets /)

    const grok = providerStatus(payload.agents[1]!)
    assert.equal(grok.plan, 'n/a')
    assert.equal(grok.availability, 'no data')
    assert.equal(
      grok.detail,
      'Run grok so sessions appear under ~/.grok/sessions/.',
    )

    const claude = providerStatus(payload.agents[2]!)
    assert.equal(claude.plan, 'n/a')
    assert.equal(claude.availability, 'available')
    assert.equal(claude.detail, 'plan lookup failed')

    const gemini = providerStatus(payload.agents[3]!)
    assert.equal(gemini.availability, 'no data')
    assert.match(gemini.detail, /Gemini/)

    const codex = providerStatus(payload.agents[4]!)
    assert.equal(codex.plan, '8%')
    assert.equal(codex.availability, 'available')
    assert.match(codex.detail, /Resets|included/)
  })

  it('formats a terminal window with every provider', () => {
    const frame = formatDeck(payload)
    assert.match(frame, /┌─ Agent Deck /)
    assert.match(frame, /This billing cycle/)
    for (const name of [
      'Cursor',
      'Grok (xAI)',
      'Claude Code',
      'Gemini',
      'Codex',
    ]) {
      assert.match(frame, new RegExp(name.replace(/[()]/g, '\\$&')))
    }
    assert.match(frame, /42\.1%/)
    assert.match(frame, /available/)
    assert.match(frame, /no data/)
    assert.match(frame, /Mac   CPU 12%  MEM 64%  GPU 3%/)
    assert.match(frame, /@ctt062/)
    assert.match(frame, /1234 contributions this year/)
    assert.match(frame, /└/)
    const widths = frame.split('\n').map((l) => l.length)
    assert.ok(widths.every((w) => w === widths[0]))
    assert.ok((widths[0] ?? 0) <= 80)
  })

  it('wraps long provider hints without collapsing the status columns', () => {
    const long = {
      ...payload,
      agents: payload.agents.map((a) =>
        a.id === 'gemini'
          ? {
              ...a,
              hint: 'Use Gemini / Antigravity so local logs appear and the collector can show activity for this billing cycle when plan percent is missing.',
            }
          : a,
      ),
    }
    const frame = formatDeck(long)
    assert.match(frame, /Gemini\s+n\/a\s+no data/)
    assert.match(frame, /Antigravity/)
    const geminiLine = frame.split('\n').find((l) => l.includes('Gemini'))
    assert.ok(geminiLine)
    assert.match(geminiLine, /Gemini +n\/a +no data/)
  })

  it('pads provider rows so columns line up', () => {
    const row = formatProviderRow(
      {
        id: 'cursor',
        name: 'Cursor',
        plan: '42.1%',
        availability: 'available',
        detail: 'Resets soon',
      },
      12,
    )
    assert.match(row, /^Cursor\s+42\.1%\s+available\s+Resets soon$/)
    const cursor = providerStatus(payload.agents[0]!)
    const grok = providerStatus(payload.agents[1]!)
    const width = Math.max(cursor.name.length, grok.name.length)
    const a = formatProviderRow(cursor, width)
    const b = formatProviderRow(grok, width)
    assert.equal(a.indexOf(cursor.availability), b.indexOf(grok.availability))
  })

  it('prints n/a for missing plan percent', () => {
    assert.equal(formatPlanPercent(undefined), 'n/a')
    assert.equal(formatPlanPercent(null), 'n/a')
    assert.equal(formatPlanPercent(Number.NaN), 'n/a')
    assert.equal(formatPlanPercent(100), '100%')
  })

  it('shows a GitHub hint when the collector has no calendar', () => {
    assert.equal(
      formatGithubLine({
        ok: false,
        error: 'gh failed',
        login: null,
        totalContributions: 0,
        days: [],
        hint: 'Run `gh auth login`, then refresh.',
      }),
      'GitHub  Run `gh auth login`, then refresh.',
    )
  })

  it('shows Mac utilization from the system snapshot', () => {
    assert.equal(
      formatSystemLine(payload.system),
      'Mac   CPU 12%  MEM 64%  GPU 3%',
    )
  })
})
