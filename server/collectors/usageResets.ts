import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { UsageReset, UsageResetWindow } from '../types.js'

const CURSOR_DB = join(
  homedir(),
  'Library/Application Support/Cursor/User/globalStorage/state.vscdb',
)
const CODEX_AUTH = join(homedir(), '.codex', 'auth.json')

function msOrSecToIso(value: unknown): string | null {
  const n = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  // Cursor sends ms; ChatGPT sends seconds
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString()
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(8_000),
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json, text }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: err instanceof Error ? err.message : String(err),
    }
  }
}

function cursorAccessToken(): string | null {
  if (!existsSync(CURSOR_DB)) return null
  try {
    const db = new DatabaseSync(CURSOR_DB, { readOnly: true })
    const row = db
      .prepare(`SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'`)
      .get() as { value: string } | undefined
    db.close()
    return row?.value ?? null
  } catch {
    return null
  }
}

export async function collectCursorUsageReset(): Promise<UsageReset> {
  const token = cursorAccessToken()
  if (!token) {
    return {
      ok: false,
      windows: [],
      error: 'Cursor auth token not found locally.',
    }
  }
  const res = await fetchJson(
    'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  )
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return {
      ok: false,
      windows: [],
      error: `Cursor usage API HTTP ${res.status}`,
    }
  }
  const data = res.json as {
    billingCycleStart?: string | number
    billingCycleEnd?: string | number
    planUsage?: { totalPercentUsed?: number; includedSpend?: number; limit?: number }
  }
  const at = msOrSecToIso(data.billingCycleEnd)
  const start = msOrSecToIso(data.billingCycleStart)
  const used = data.planUsage?.totalPercentUsed
  const windows: UsageResetWindow[] = [
    {
      label: 'Billing cycle',
      at,
      usedPercent:
        typeof used === 'number' ? Math.round(used * 10) / 10 : undefined,
      note: start
        ? `Cycle started ${new Date(start).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}`
        : 'Monthly Cursor included usage',
    },
  ]
  return { ok: Boolean(at), windows }
}

type CodexAuthFile = {
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
  }
  last_refresh?: string
}

async function refreshCodexAccessToken(
  refreshToken: string,
): Promise<string | null> {
  const res = await fetchJson('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      grant_type: 'refresh_token',
      redirect_uri: 'http://localhost:1455/auth/callback',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok || !res.json || typeof res.json !== 'object') return null
  const data = res.json as {
    access_token?: string
    refresh_token?: string
    id_token?: string
  }
  if (!data.access_token) return null

  // Fail closed: rotated refresh tokens must land on disk or Codex CLI breaks.
  if (!existsSync(CODEX_AUTH)) return null
  try {
    const raw = JSON.parse(readFileSync(CODEX_AUTH, 'utf8')) as CodexAuthFile
    raw.tokens = {
      ...raw.tokens,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? raw.tokens?.refresh_token,
      id_token: data.id_token ?? raw.tokens?.id_token,
    }
    raw.last_refresh = new Date().toISOString()
    const tmp = join(dirname(CODEX_AUTH), `.auth.json.${process.pid}.tmp`)
    writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(tmp, CODEX_AUTH)
  } catch {
    return null
  }
  return data.access_token
}

function codexAccessToken(): { access: string | null; refresh: string | null } {
  if (!existsSync(CODEX_AUTH)) return { access: null, refresh: null }
  try {
    const raw = JSON.parse(readFileSync(CODEX_AUTH, 'utf8')) as CodexAuthFile
    return {
      access: raw.tokens?.access_token ?? null,
      refresh: raw.tokens?.refresh_token ?? null,
    }
  } catch {
    return { access: null, refresh: null }
  }
}

function windowFromCodex(raw: unknown, fallbackLabel: string): UsageResetWindow | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as {
    used_percent?: number
    limit_window_seconds?: number
    reset_after_seconds?: number
    reset_at?: number
  }
  const at = msOrSecToIso(w.reset_at)
  const secs = w.limit_window_seconds
  let label = fallbackLabel
  if (secs === 18_000) label = '5h window'
  else if (secs === 604_800) label = 'Weekly'
  else if (secs === 2_592_000) label = 'Monthly'
  else if (typeof secs === 'number' && secs > 0) {
    const h = Math.round(secs / 3600)
    label = h >= 24 ? `${Math.round(h / 24)}d window` : `${h}h window`
  }
  return {
    label,
    at,
    usedPercent:
      typeof w.used_percent === 'number'
        ? Math.round(w.used_percent * 10) / 10
        : undefined,
    note:
      typeof w.reset_after_seconds === 'number'
        ? `Resets in ~${Math.max(0, Math.round(w.reset_after_seconds / 3600))}h`
        : undefined,
  }
}

export async function collectCodexUsageReset(): Promise<UsageReset> {
  let { access, refresh } = codexAccessToken()
  if (!access && refresh) {
    access = await refreshCodexAccessToken(refresh)
  }
  if (!access) {
    return {
      ok: false,
      windows: [],
      error: 'Codex/ChatGPT auth not found. Run `codex login`.',
    }
  }

  let res = await fetchJson('https://chatgpt.com/backend-api/wham/usage', {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/json',
    },
  })
  if ((!res.ok || res.status === 401) && refresh) {
    access = await refreshCodexAccessToken(refresh)
    if (access) {
      res = await fetchJson('https://chatgpt.com/backend-api/wham/usage', {
        headers: {
          Authorization: `Bearer ${access}`,
          Accept: 'application/json',
        },
      })
    }
  }
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return {
      ok: false,
      windows: [],
      error: `Codex usage API HTTP ${res.status}`,
    }
  }
  const data = res.json as {
    plan_type?: string
    rate_limit?: {
      primary_window?: unknown
      secondary_window?: unknown
    }
  }
  const windows: UsageResetWindow[] = []
  const primary = windowFromCodex(data.rate_limit?.primary_window, 'Primary')
  const secondary = windowFromCodex(
    data.rate_limit?.secondary_window,
    'Secondary',
  )
  if (primary) windows.push(primary)
  if (secondary) windows.push(secondary)
  if (windows.length === 0) {
    return {
      ok: false,
      windows: [],
      error: 'Codex usage payload had no reset windows.',
    }
  }
  if (data.plan_type) {
    windows[0] = {
      ...windows[0],
      note: [windows[0].note, `Plan: ${data.plan_type}`]
        .filter(Boolean)
        .join(' · '),
    }
  }
  return { ok: true, windows }
}

function claudeOAuthAccessToken(): string | null {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', timeout: 3000 },
    ).trim()
    if (!out) return null
    const parsed = JSON.parse(out) as {
      claudeAiOauth?: { accessToken?: string }
    }
    return parsed.claudeAiOauth?.accessToken ?? null
  } catch {
    return null
  }
}

function claudeWindowUsedPercent(block: {
  utilization?: number
  utilized?: number
  usage?: number
}): number | undefined {
  if (typeof block.utilization === 'number') {
    return Math.round(block.utilization * 10) / 10
  }
  if (typeof block.utilized === 'number') {
    return Math.round(block.utilized * 10) / 10
  }
  if (typeof block.usage === 'number') {
    return Math.round(block.usage * 10) / 10
  }
  return undefined
}

export async function collectClaudeUsageReset(): Promise<UsageReset> {
  // Prefer Claude Code / Anthropic OAuth-style usage when available.
  const accessToken = claudeOAuthAccessToken()
  if (accessToken) {
    const res = await fetchJson('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-code/2.1.212',
        Accept: 'application/json',
      },
    })
    if (res.ok && res.json && typeof res.json === 'object') {
      const data = res.json as Record<string, unknown>
      const windows: UsageResetWindow[] = []
      for (const [label, keyName] of [
        ['5h session', 'five_hour'],
        ['Weekly', 'seven_day'],
        ['Weekly', 'weekly'],
      ] as const) {
        const block = data[keyName]
        if (block && typeof block === 'object') {
          const b = block as {
            resets_at?: string
            reset_at?: string
            utilization?: number
            utilized?: number
            usage?: number
          }
          windows.push({
            label,
            at: b.resets_at ?? b.reset_at ?? null,
            usedPercent: claudeWindowUsedPercent(b),
          })
        }
      }
      if (windows.length > 0) return { ok: true, windows }
    }
  }

  // Claude Code Pro/Max limits are rolling windows; exact times live in `/usage`.
  return {
    ok: true,
    windows: [
      {
        label: '5h session',
        at: null,
        note: 'Rolling window · run `/usage` in Claude Code for exact time',
      },
      {
        label: 'Weekly',
        at: null,
        note: 'Rolling 7-day cap · not calendar Monday',
      },
    ],
  }
}

export async function collectUsageResets(): Promise<{
  cursor: UsageReset
  claude: UsageReset
  codex: UsageReset
}> {
  const [cursor, claude, codex] = await Promise.all([
    collectCursorUsageReset(),
    collectClaudeUsageReset(),
    collectCodexUsageReset(),
  ])
  return { cursor, claude, codex }
}
