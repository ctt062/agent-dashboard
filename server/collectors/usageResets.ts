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
    planUsage?: {
      totalPercentUsed?: number
      autoPercentUsed?: number
      apiPercentUsed?: number
      totalSpend?: number
      includedSpend?: number
      bonusSpend?: number
      limit?: number
    }
    displayMessage?: string
  }
  const at = msOrSecToIso(data.billingCycleEnd)
  const start = msOrSecToIso(data.billingCycleStart)
  const plan = data.planUsage
  const used = plan?.totalPercentUsed
  const auto =
    typeof plan?.autoPercentUsed === 'number'
      ? Math.round(plan.autoPercentUsed * 10) / 10
      : null
  const api =
    typeof plan?.apiPercentUsed === 'number'
      ? Math.round(plan.apiPercentUsed * 10) / 10
      : null
  const windows: UsageResetWindow[] = [
    {
      label: 'Billing cycle',
      at,
      usedPercent:
        typeof used === 'number' ? Math.round(used * 10) / 10 : undefined,
      unit: 'plan',
      // Prefer Auto + API breakdown over Cursor's generic displayMessage,
      // which can lag behind totalPercentUsed.
      note:
        auto != null || api != null
          ? [
              auto != null ? `Auto ${auto}%` : null,
              api != null ? `API ${api}%` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined,
    },
  ]
  return { ok: Boolean(at || start), windows, cycleStart: start }
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

function codexCycleStartIso(window: UsageResetWindow, raw: unknown): string | null {
  if (!window.at) return null
  const w = raw && typeof raw === 'object'
    ? (raw as { limit_window_seconds?: number })
    : null
  const secs = w?.limit_window_seconds
  if (typeof secs !== 'number' || secs <= 0) return null
  const end = Date.parse(window.at)
  if (!Number.isFinite(end)) return null
  return new Date(end - secs * 1000).toISOString()
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
  const primaryRaw = data.rate_limit?.primary_window
  const secondaryRaw = data.rate_limit?.secondary_window
  const primary = windowFromCodex(primaryRaw, 'Primary')
  const secondary = windowFromCodex(secondaryRaw, 'Secondary')
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
  const monthly =
    windows.find((w) => /month|weekly|primary/i.test(w.label)) ?? windows[0]
  const cycleStart =
    codexCycleStartIso(monthly, primaryRaw) ??
    (secondary ? codexCycleStartIso(secondary, secondaryRaw) : null)
  return { ok: true, windows, cycleStart }
}

const GROK_AUTH = join(homedir(), '.grok', 'auth.json')

type GrokAuthEntry = {
  key?: string
  refresh_token?: string
  expires_at?: string
  oidc_issuer?: string
  oidc_client_id?: string
  auth_mode?: string
}

type GrokAuthFile = Record<string, GrokAuthEntry>

function grokAuthSnapshot(): {
  scope: string | null
  entry: GrokAuthEntry | null
} {
  if (!existsSync(GROK_AUTH)) return { scope: null, entry: null }
  try {
    const raw = JSON.parse(readFileSync(GROK_AUTH, 'utf8')) as GrokAuthFile
    const [scope, entry] = Object.entries(raw)[0] ?? [null, null]
    return { scope, entry }
  } catch {
    return { scope: null, entry: null }
  }
}

function grokTokenExpired(entry: GrokAuthEntry | null): boolean {
  if (!entry?.expires_at) return false
  const exp = Date.parse(entry.expires_at)
  if (!Number.isFinite(exp)) return false
  // Refresh 60s early.
  return Date.now() >= exp - 60_000
}

async function refreshGrokAccessToken(
  scope: string,
  entry: GrokAuthEntry,
): Promise<string | null> {
  if (!entry.refresh_token || !entry.oidc_client_id) return null
  const issuer = (entry.oidc_issuer ?? 'https://auth.x.ai').replace(/\/$/, '')
  const res = await fetchJson(`${issuer}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: entry.refresh_token,
      client_id: entry.oidc_client_id,
    }).toString(),
  })
  if (!res.ok || !res.json || typeof res.json !== 'object') return null
  const data = res.json as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null

  // Fail closed: rotated refresh tokens must land on disk or Grok CLI breaks.
  if (!existsSync(GROK_AUTH)) return null
  try {
    const raw = JSON.parse(readFileSync(GROK_AUTH, 'utf8')) as GrokAuthFile
    const cur = raw[scope] ?? entry
    const expiresAt =
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : cur.expires_at
    raw[scope] = {
      ...cur,
      key: data.access_token,
      refresh_token: data.refresh_token ?? cur.refresh_token,
      expires_at: expiresAt,
    }
    const tmp = join(dirname(GROK_AUTH), `.auth.json.${process.pid}.tmp`)
    writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(tmp, GROK_AUTH)
  } catch {
    return null
  }
  return data.access_token
}

async function grokAccessToken(): Promise<string | null> {
  const { scope, entry } = grokAuthSnapshot()
  if (!scope || !entry) return null
  if (entry.key && !grokTokenExpired(entry)) return entry.key
  if (entry.refresh_token) {
    const refreshed = await refreshGrokAccessToken(scope, entry)
    if (refreshed) return refreshed
  }
  return entry.key ?? null
}

function moneyVal(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw && typeof raw === 'object' && 'val' in raw) {
    const v = (raw as { val?: unknown }).val
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

export async function collectGrokUsageReset(): Promise<UsageReset> {
  const access = await grokAccessToken()
  if (!access) {
    return {
      ok: false,
      windows: [],
      error: 'Grok/xAI auth not found. Run `grok login`.',
    }
  }

  const res = await fetchJson('https://cli-chat-proxy.grok.com/v1/billing', {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/json',
      'User-Agent': 'agent-dashboard/0.1',
    },
  })
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return {
      ok: false,
      windows: [],
      error: `Grok billing API HTTP ${res.status}`,
    }
  }

  const data = res.json as {
    config?: {
      monthlyLimit?: unknown
      used?: unknown
      onDemandCap?: unknown
      billingPeriodStart?: string
      billingPeriodEnd?: string
    }
  }
  const cfg = data.config
  if (!cfg) {
    return {
      ok: false,
      windows: [],
      error: 'Grok billing payload missing config.',
    }
  }

  const limit = moneyVal(cfg.monthlyLimit)
  const used = moneyVal(cfg.used)
  const onDemandCap = moneyVal(cfg.onDemandCap)
  const usedPercent =
    limit != null && limit > 0 && used != null
      ? Math.round((used / limit) * 1000) / 10
      : undefined

  const noteParts: string[] = []
  if (used != null && limit != null) {
    noteParts.push(`$${used.toFixed(used % 1 === 0 ? 0 : 2)} / $${limit.toFixed(limit % 1 === 0 ? 0 : 2)}`)
  }
  if (onDemandCap != null && onDemandCap > 0) {
    noteParts.push(`On-demand cap $${onDemandCap}`)
  }

  const windows: UsageResetWindow[] = [
    {
      label: 'Billing cycle',
      at: cfg.billingPeriodEnd ?? null,
      usedPercent,
      used: used ?? undefined,
      limit: limit ?? undefined,
      unit: 'usd',
      note: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
    },
  ]

  return {
    ok: true,
    windows,
    cycleStart: cfg.billingPeriodStart ?? null,
  }
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
      if (windows.length > 0) {
        const weekly =
          windows.find((w) => /week/i.test(w.label)) ??
          windows[windows.length - 1]
        let cycleStart: string | null = null
        if (weekly?.at) {
          const end = Date.parse(weekly.at)
          if (Number.isFinite(end)) {
            // Claude weekly caps are rolling ~7 days.
            cycleStart = new Date(end - 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
        if (!cycleStart) {
          const d = new Date()
          d.setDate(d.getDate() - 6)
          d.setHours(0, 0, 0, 0)
          cycleStart = d.toISOString()
        }
        return { ok: true, windows, cycleStart }
      }
    }
  }

  // Claude Code Pro/Max limits are rolling windows; exact times live in `/usage`.
  const fallbackStart = new Date()
  fallbackStart.setDate(fallbackStart.getDate() - 6)
  fallbackStart.setHours(0, 0, 0, 0)
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
    cycleStart: fallbackStart.toISOString(),
  }
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

/** Gemini / Antigravity do not expose a local plan-% API yet. */
export async function collectGeminiUsageReset(): Promise<UsageReset> {
  return {
    ok: false,
    windows: [],
    error:
      'Gemini plan % is not available from local credentials yet. Activity still plots when local logs exist.',
  }
}

export async function collectUsageResets(): Promise<{
  cursor: UsageReset
  grok: UsageReset
  claude: UsageReset
  gemini: UsageReset
  codex: UsageReset
}> {
  const [cursor, grok, claude, gemini, codex] = await Promise.all([
    collectCursorUsageReset(),
    collectGrokUsageReset(),
    collectClaudeUsageReset(),
    collectGeminiUsageReset(),
    collectCodexUsageReset(),
  ])
  return { cursor, grok, claude, gemini, codex }
}
