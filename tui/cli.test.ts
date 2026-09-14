import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { DashboardPayload } from '../server/types.ts'
import { parseArgv, runCli, type CliDeps, type CliIo } from './cli.ts'
import { HELP_TEXT } from './status.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function io() {
  let stdout = ''
  let stderr = ''
  const captured: CliIo = {
    stdout: { write: (chunk) => void (stdout += chunk) },
    stderr: { write: (chunk) => void (stderr += chunk) },
    stdinIsTTY: true,
    stdoutIsTTY: true,
  }
  return {
    captured,
    stdout: () => stdout,
    stderr: () => stderr,
  }
}

const stubPayload: DashboardPayload = {
  generatedAt: '2026-09-14T12:00:00.000Z',
  range: 'month',
  cached: false,
  agents: [
    {
      id: 'cursor',
      name: 'Cursor',
      score: 1,
      percent: 100,
      available: true,
      metrics: {},
      daily: [],
      stats: {
        activeDays: 1,
        avgPerDay: 1,
        peakDay: '2026-09-14',
        peakValue: 1,
        periodTotal: 1,
      },
      usageReset: {
        ok: true,
        windows: [{ label: 'Plan', at: null, usedPercent: 10 }],
      },
    },
    {
      id: 'grok',
      name: 'Grok (xAI)',
      score: 0,
      percent: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: {
        activeDays: 0,
        avgPerDay: 0,
        peakDay: null,
        peakValue: 0,
        periodTotal: 0,
      },
      hint: 'No Grok sessions on this Mac.',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      score: 0,
      percent: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: {
        activeDays: 0,
        avgPerDay: 0,
        peakDay: null,
        peakValue: 0,
        periodTotal: 0,
      },
      hint: 'Claude Code logs missing.',
    },
    {
      id: 'gemini',
      name: 'Gemini',
      score: 0,
      percent: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: {
        activeDays: 0,
        avgPerDay: 0,
        peakDay: null,
        peakValue: 0,
        periodTotal: 0,
      },
      hint: 'Gemini footprint missing.',
    },
    {
      id: 'codex',
      name: 'Codex',
      score: 0,
      percent: 0,
      available: false,
      metrics: {},
      daily: [],
      stats: {
        activeDays: 0,
        avgPerDay: 0,
        peakDay: null,
        peakValue: 0,
        periodTotal: 0,
      },
      hint: 'Codex sessions missing.',
    },
  ],
  system: {
    hostname: 'mac.local',
    uptimeSec: 10,
    loadAvg: [0, 0, 0],
    cpu: { model: 't', cores: 1, utilization: 1 },
    memory: {
      totalBytes: 1,
      usedBytes: 1,
      freeBytes: 0,
      utilization: 2,
    },
    gpu: { utilization: 3, name: 't', cores: null },
    sampledAt: '2026-09-14T12:00:00.000Z',
  },
  github: {
    ok: false,
    error: 'offline',
    login: null,
    totalContributions: 0,
    days: [],
    hint: 'GitHub CLI is not authenticated.',
  },
}

function deps(overrides: Partial<CliDeps> & { io: CliIo }): CliDeps {
  return {
    loadDashboard: async () => stubPayload,
    renderTui: async () => {
      throw new Error('TUI should not start in this test')
    },
    readVersion: () => '0.1.0',
    ...overrides,
  }
}

describe('command entrypoint', () => {
  it('parses help, version, once, and default TUI', () => {
    assert.deepEqual(parseArgv([]), { kind: 'tui' })
    assert.deepEqual(parseArgv(['--once']), { kind: 'once' })
    assert.deepEqual(parseArgv(['--help']), { kind: 'help' })
    assert.deepEqual(parseArgv(['-h']), { kind: 'help' })
    assert.deepEqual(parseArgv(['--version']), { kind: 'version' })
    assert.equal(parseArgv(['--print']).kind, 'error')
    assert.equal(parseArgv(['--serve']).kind, 'error')
    assert.equal(parseArgv(['--lan']).kind, 'error')
  })

  it('prints help for --help without loading collectors', async () => {
    const out = io()
    let loaded = false
    const code = await runCli(
      ['--help'],
      deps({
        io: out.captured,
        loadDashboard: async () => {
          loaded = true
          return stubPayload
        },
      }),
    )
    assert.equal(code, 0)
    assert.equal(loaded, false)
    assert.equal(out.stdout(), HELP_TEXT)
    assert.equal(out.stderr(), '')
    assert.match(out.stdout(), /agent-deck --once/)
    assert.match(out.stdout(), /No local HTTP server/)
  })

  it('prints provider status for --once and does not open Ink', async () => {
    const out = io()
    let tui = false
    const code = await runCli(
      ['--once'],
      deps({
        io: out.captured,
        renderTui: async () => {
          tui = true
        },
      }),
    )
    assert.equal(code, 0)
    assert.equal(tui, false)
    const text = out.stdout()
    assert.match(text, /Agent Deck/)
    assert.match(text, /Cursor/)
    assert.match(text, /10%/)
    assert.match(text, /Grok \(xAI\)/)
    assert.match(text, /no data/)
    assert.match(text, /No Grok sessions on this Mac/)
    assert.match(text, /GitHub CLI is not authenticated/)
  })

  it('keeps plan % and omits no data when local activity is missing', async () => {
    const out = io()
    const payload: DashboardPayload = {
      ...stubPayload,
      agents: [
        {
          ...stubPayload.agents[1]!,
          available: false,
          hint: 'No Grok sessions on this Mac.',
          usageReset: {
            ok: true,
            windows: [{ label: 'Plan', at: null, usedPercent: 55 }],
          },
        },
      ],
    }
    const code = await runCli(
      ['--once'],
      deps({
        io: out.captured,
        loadDashboard: async () => payload,
        renderTui: async () => {
          throw new Error('TUI should not start in this test')
        },
      }),
    )
    assert.equal(code, 0)
    const text = out.stdout()
    assert.match(text, /┌─ Agent Deck /)
    assert.match(text, /Grok \(xAI\)/)
    assert.match(text, /55%/)
    assert.match(text, /No Grok sessions on this Mac/)
    assert.doesNotMatch(text, /no data/)
    const grokLine = text.split('\n').find((l) => l.includes('Grok (xAI)'))
    assert.ok(grokLine)
    assert.match(grokLine, /55%/)
    assert.doesNotMatch(grokLine, /no data/)
  })

  it('opens the TUI on a TTY without --once', async () => {
    const out = io()
    let opened = false
    const code = await runCli(
      [],
      deps({
        io: out.captured,
        renderTui: async () => {
          opened = true
        },
      }),
    )
    assert.equal(code, 0)
    assert.equal(opened, true)
    assert.equal(out.stdout(), '')
  })

  it('prints once when stdout is not a TTY', async () => {
    const out = io()
    out.captured.stdoutIsTTY = false
    let tui = false
    const code = await runCli(
      [],
      deps({
        io: { ...out.captured, stdoutIsTTY: false },
        renderTui: async () => {
          tui = true
        },
      }),
    )
    assert.equal(code, 0)
    assert.equal(tui, false)
    assert.match(out.stdout(), /Agent Deck/)
  })

  it('runs the package bin --help', async () => {
    const bin = join(root, 'bin/agent-deck.js')
    const result = await new Promise<{
      code: number | null
      stdout: string
      stderr: string
    }>((resolvePromise) => {
      const child = spawn(process.execPath, [bin, '--help'], {
        cwd: root,
        env: process.env,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
    })
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /agent-deck/)
  })
})
