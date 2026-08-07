import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCumulativeChart,
  chartDomainStart,
  enumerateDays,
} from '../../src/lib/cumulativeUsage.ts'
import type { AgentShare } from '../../src/lib/types.ts'

function agent(
  partial: Pick<AgentShare, 'id' | 'name' | 'daily'> & Partial<AgentShare>,
): AgentShare {
  return {
    score: 0,
    percent: 0,
    available: true,
    metrics: {},
    stats: {
      activeDays: partial.daily.length,
      avgPerDay: 0,
      peakDay: null,
      peakValue: 0,
      periodTotal: partial.daily.reduce((s, d) => s + d.primary, 0),
    },
    ...partial,
  }
}

describe('enumerateDays', () => {
  it('lists inclusive local calendar days', () => {
    assert.deepEqual(enumerateDays('2026-07-28', '2026-07-30'), [
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ])
  })
})

describe('chartDomainStart', () => {
  it('prefers Cursor billing cycle over Grok calendar start', () => {
    const start = chartDomainStart(
      [
        agent({
          id: 'cursor',
          name: 'Cursor',
          usageReset: {
            ok: true,
            cycleStart: '2026-07-27T18:05:50.000Z',
            windows: [{ label: 'Billing cycle', at: null, usedPercent: 28 }],
          },
          daily: [],
        }),
        agent({
          id: 'grok',
          name: 'Grok (xAI)',
          usageReset: {
            ok: true,
            cycleStart: '2026-07-01T00:00:00.000Z',
            windows: [{ label: 'Billing cycle', at: null }],
          },
          daily: [],
        }),
      ],
      '2026-07-28',
    )
    const cursorLocal = new Date('2026-07-27T18:05:50.000Z')
    const y = cursorLocal.getFullYear()
    const m = String(cursorLocal.getMonth() + 1).padStart(2, '0')
    const d = String(cursorLocal.getDate()).padStart(2, '0')
    assert.equal(start, `${y}-${m}-${d}`)
  })

  it('falls back to today when no cycle starts exist', () => {
    assert.equal(chartDomainStart([], '2026-07-28'), '2026-07-28')
  })
})

describe('buildCumulativeChart', () => {
  it('spans billing-cycle start through today and scales plan percent', () => {
    const agents: AgentShare[] = [
      agent({
        id: 'cursor',
        name: 'Cursor',
        usageReset: {
          ok: true,
          cycleStart: '2026-07-27T12:00:00.000Z',
          windows: [{ label: 'Billing cycle', at: null, usedPercent: 40 }],
        },
        daily: [
          {
            date: '2026-07-28',
            primary: 10,
            primaryLabel: 'agentMessages',
          },
          {
            date: '2026-07-29',
            primary: 30,
            primaryLabel: 'agentMessages',
          },
        ],
      }),
      agent({
        id: 'grok',
        name: 'Grok (xAI)',
        usageReset: {
          ok: true,
          cycleStart: '2026-07-27T12:00:00.000Z',
          windows: [{ label: 'Billing cycle', at: null }],
        },
        daily: [
          { date: '2026-07-28', primary: 2, primaryLabel: 'tokens' },
          { date: '2026-07-29', primary: 2, primaryLabel: 'tokens' },
        ],
      }),
      agent({
        id: 'codex',
        name: 'Codex',
        usageReset: {
          ok: true,
          cycleStart: '2026-07-27T12:00:00.000Z',
          windows: [{ label: 'Monthly', at: null, usedPercent: 0 }],
        },
        daily: [],
      }),
    ]

    const chart = buildCumulativeChart(agents, '2026-07-29')
    assert.equal(chart.hasData, true)
    assert.equal(chart.endDate, '2026-07-29')
    assert.equal(chart.points.at(-1)?.date, '2026-07-29')
    assert.equal(chart.points[0]?.date, chart.startDate)
    assert.equal(chart.points.at(-1)?.cursor, 40)
    assert.equal(chart.points.at(-1)?.grok, 100)
    assert.equal(chart.points.at(-1)?.codex, 0)
    // time_0 is cycle start with cumulative 0 before later activity lands.
    const first = chart.points[0]
    assert.ok(first)
    assert.equal(first.cursor, 0)
  })

  it('ends at today even when activity stopped earlier', () => {
    const agents: AgentShare[] = [
      agent({
        id: 'cursor',
        name: 'Cursor',
        usageReset: {
          ok: true,
          cycleStart: '2026-07-01T12:00:00.000Z',
          windows: [{ label: 'Billing cycle', at: null, usedPercent: 20 }],
        },
        daily: [
          { date: '2026-07-02', primary: 5, primaryLabel: 'agentMessages' },
        ],
      }),
    ]
    const chart = buildCumulativeChart(agents, '2026-07-10')
    assert.equal(chart.endDate, '2026-07-10')
    assert.equal(chart.points.at(-1)?.date, '2026-07-10')
    assert.equal(chart.points.at(-1)?.cursor, 20)
    assert.ok(chart.points.length >= 10)
  })

  it('plots a flat plan-% line when local activity is missing', () => {
    const agents: AgentShare[] = [
      agent({
        id: 'grok',
        name: 'Grok (xAI)',
        available: false,
        usageReset: {
          ok: true,
          cycleStart: '2026-08-01T00:00:00.000Z',
          windows: [{ label: 'Billing cycle', at: null, usedPercent: 12.5 }],
        },
        daily: [],
      }),
    ]
    const chart = buildCumulativeChart(agents, '2026-08-03')
    assert.equal(chart.hasData, true)
    assert.equal(chart.points.at(-1)?.grok, 12.5)
    assert.equal(chart.points[0]?.grok, 12.5)
  })
})
