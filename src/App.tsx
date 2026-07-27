import { useCallback, useEffect, useState } from 'react'
import { AgentPanel } from './components/AgentPanel'
import { GithubPanel } from './components/GithubPanel'
import { SystemPanel } from './components/SystemPanel'
import type { DashboardPayload } from './lib/types'

const REFRESH_MS = 15_000

export default function App() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as DashboardPayload
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">Localhost only</p>
          <h1>Agent Deck</h1>
        </div>
        <div className="top-right">
          <p className="stamp">
            {data
              ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}`
              : loading
                ? 'Loading…'
                : 'Offline'}
          </p>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <p className="banner">
          API unreachable ({error}). Start with{' '}
          <code>npm run dev</code> so both Vite and the local collector are up.
        </p>
      ) : null}

      {data ? (
        <main className="stack">
          <AgentPanel agents={data.agents} />
          <SystemPanel system={data.system} />
          <GithubPanel github={data.github} />
        </main>
      ) : !error ? (
        <p className="banner">Reading local agent + Mac metrics…</p>
      ) : null}

      <footer className="foot">
        Runs only on this Mac. Agent % is relative share of local activity
        scores (Cursor accepted lines / Claude & Codex tokens or session volume).
      </footer>

      <style>{`
        .shell {
          max-width: 1100px;
          margin: 0 auto;
          padding: 2rem 1.25rem 3rem;
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }
        .top {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--line);
        }
        .eyebrow {
          margin: 0 0 0.35rem;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
        .top-right { text-align: right; display: flex; flex-direction: column; align-items: end; gap: 0.45rem; }
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
