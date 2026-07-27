import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { GithubSnapshot } from '../types.js'

const QUERY =
  'query { viewer { login contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount color } } } } } }'

function ghEnv(): NodeJS.ProcessEnv {
  const extras = [
    join(homedir(), '.local/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const path = [...extras, process.env.PATH ?? ''].filter(Boolean).join(delimiter)
  return { ...process.env, PATH: path }
}

function resolveGh(): string {
  if (process.env.GH_PATH && existsSync(process.env.GH_PATH)) {
    return process.env.GH_PATH
  }
  for (const candidate of [
    join(homedir(), '.local/bin/gh'),
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return 'gh'
}

export function collectGithub(): GithubSnapshot {
  try {
    const raw = execFileSync(
      resolveGh(),
      ['api', 'graphql', '-f', `query=${QUERY}`],
      { encoding: 'utf8', timeout: 20000, env: ghEnv() },
    )
    const data = JSON.parse(raw) as {
      data?: {
        viewer?: {
          login: string
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: number
              weeks: Array<{
                contributionDays: Array<{
                  date: string
                  contributionCount: number
                  color: string
                }>
              }>
            }
          }
        }
      }
      errors?: unknown
    }
    const viewer = data.data?.viewer
    if (!viewer) {
      return {
        ok: false,
        error: 'GitHub GraphQL returned no viewer (check gh auth)',
        login: null,
        totalContributions: 0,
        days: [],
      }
    }
    const cal = viewer.contributionsCollection.contributionCalendar
    const days = cal.weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({
        date: d.date,
        count: d.contributionCount,
        color: d.color,
      })),
    )
    return {
      ok: true,
      error: null,
      login: viewer.login,
      totalContributions: cal.totalContributions,
      days,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      login: null,
      totalContributions: 0,
      days: [],
    }
  }
}
