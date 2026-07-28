import { execFileSync } from 'node:child_process'
import type { GithubSnapshot } from '../types.js'

const QUERY =
  'query { viewer { login contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount color } } } } } }'

export function collectGithub(): GithubSnapshot {
  try {
    const raw = execFileSync(
      'gh',
      ['api', 'graphql', '-f', `query=${QUERY}`],
      { encoding: 'utf8', timeout: 20000 },
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
