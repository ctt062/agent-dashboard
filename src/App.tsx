import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentPanel } from './components/AgentPanel'
import { GithubPanel } from './components/GithubPanel'
import { Login } from './components/Login'
import { SystemPanel } from './components/SystemPanel'
import type { DashboardPayload, DateRange } from './lib/types'

const REFRESH_MS = 15_000

type AuthUser = {
  email: string
  name: string | null
  picture: string | null
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [range, setRange] = useState<DateRange>('7d')
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const json = (await res.json()) as { user: AuthUser }
          setUser(json.user)
        } else {
          setUser(null)
        }
      } catch {
        setUser(null)
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [])

  const load = useCallback(
    async (opts?: { refresh?: boolean; mode?: 'replace' | 'poll' }) => {
      const mode = opts?.mode ?? 'replace'

      if (mode === 'poll') {
        if (inFlightRef.current) return
      } else {
        abortRef.current?.abort()
      }

      const controller = new AbortController()
      abortRef.current = controller
      inFlightRef.current = true
      try {
        const params = new URLSearchParams({ range })
        if (opts?.refresh) params.set('refresh', '1')
        const res = await fetch(`/api/dashboard?${params}`, {
          signal: controller.signal,
        })
        if (res.status === 401 || res.status === 503) {
          setUser(null)
          setData(null)
          throw new Error(
            res.status === 503
              ? 'Google sign-in is not configured on this Mac.'
              : 'Signed out',
          )
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as DashboardPayload
        if (controller.signal.aborted) return
        setData(json)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (abortRef.current === controller) inFlightRef.current = false
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [range],
  )

  useEffect(() => {
    if (!user) return
    setLoading(true)
    void load({ mode: 'replace' })
    const id = window.setInterval(() => void load({ mode: 'poll' }), REFRESH_MS)
    return () => {
      window.clearInterval(id)
      abortRef.current?.abort()
    }
  }, [load, user])

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    setUser(null)
    setData(null)
  }

  if (!authChecked) {
    return (
      <div className="shell">
        <p className="banner">Checking Google sign-in…</p>
      </div>
    )
  }

  if (!user) {
    return <Login onSignedIn={setUser} />
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">Local Mac</p>
          <h1>Agent Deck</h1>
        </div>
        <div className="top-right">
          <p className="stamp">
            {user.email}
            {data
              ? ` · Updated ${new Date(data.generatedAt).toLocaleTimeString()}${
                  data.cached ? ' · cached' : ''
                }`
              : loading
                ? ' · Loading…'
                : ' · Offline'}
          </p>
          <div className="top-actions">
            <button type="button" onClick={() => void load({ refresh: true })}>
              Refresh
            </button>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p className="banner">
          API unreachable ({error}). If Agent Deck is not running, use{' '}
          <code>npm run setup</code> once so it starts automatically at login.
        </p>
      ) : null}

      {data && data.range === range ? (
        <main className="stack">
          <AgentPanel
            agents={data.agents}
            range={range}
            onRangeChange={setRange}
          />
          <SystemPanel system={data.system} />
          <GithubPanel github={data.github} />
        </main>
      ) : !error ? (
        <p className="banner">Reading local agent + Mac metrics…</p>
      ) : null}

      <footer className="foot">
        Runs only on this Mac. Agent % is relative share of local activity
        scores for the selected date range (Cursor accepted lines / Claude &
        Codex tokens or session volume).
      </footer>

      <style>{`
        .shell {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.25rem 1rem 2.5rem;
          padding-top: max(1.25rem, env(safe-area-inset-top));
          padding-left: max(1rem, env(safe-area-inset-left));
          padding-right: max(1rem, env(safe-area-inset-right));
          padding-bottom: max(2.5rem, env(safe-area-inset-bottom));
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }
        @media (min-width: 720px) {
          .shell {
            padding-top: max(2rem, env(safe-area-inset-top));
            padding-left: max(1.25rem, env(safe-area-inset-left));
            padding-right: max(1.25rem, env(safe-area-inset-right));
            padding-bottom: max(3rem, env(safe-area-inset-bottom));
          }
        }
        .top {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
        }
        .top-right {
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: end;
          gap: 0.45rem;
        }
        .top-actions { display: flex; gap: 0.4rem; }
        @media (max-width: 600px) {
          .top { align-items: start; }
          .top-right {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            text-align: left;
          }
          .top-actions { justify-content: flex-start; }
        }
        .eyebrow {
          margin: 0 0 0.35rem;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
        .stamp { margin: 0; font-size: 0.72rem; color: var(--muted); }
        .stack { display: flex; flex-direction: column; gap: 1rem; }
        .banner {
          margin: 0;
          border: 1px solid var(--line);
          padding: 0.85rem 1rem;
          color: var(--muted);
          font-size: 0.85rem;
        }
        .foot {
          margin-top: 0.5rem;
          font-size: 0.68rem;
          color: var(--dim);
          line-height: 1.5;
        }
        code {
          font-family: inherit;
          border: 1px solid var(--line);
          padding: 0.05rem 0.3rem;
          color: var(--text);
        }
      `}</style>
    </div>
  )
}
