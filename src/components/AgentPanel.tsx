import {
  formatResetAt,
  type AgentShare,
  type UsageResetWindow,
} from '../lib/types'

type Props = {
  agents: AgentShare[]
}

function primaryUsageWindow(agent: AgentShare): UsageResetWindow | null {
  const windows = agent.usageReset?.windows ?? []
  return (
    windows.find((w) => w.usedPercent != null) ??
    windows.find((w) => /billing|month|week|primary/i.test(w.label)) ??
    windows[0] ??
    null
  )
}

function UsageRing({
  percent,
  color,
}: {
  percent: number | null
  color: string
}) {
  const size = 168
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const offset = c * (1 - value / 100)

  return (
    <div className="ring" aria-hidden={percent == null}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="ring-center">
        {percent == null ? (
          <span className="ring-na">n/a</span>
        ) : (
          <>
            <strong>{percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}</strong>
            <span>%</span>
          </>
        )}
      </div>
    </div>
  )
}

const RING_COLOR: Record<AgentShare['id'], string> = {
  cursor: '#f0f0f0',
  claude: '#c8c8c8',
  codex: '#9a9a9a',
}

export function AgentPanel({ agents }: Props) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>This billing cycle</h2>
          <p>Plan usage for each agent</p>
        </div>
      </header>

      <div className="usage-row">
        {agents.map((a) => {
          const usage = primaryUsageWindow(a)
          const percent = usage?.usedPercent ?? null

          return (
            <article
              key={a.id}
              className={`usage-card${percent == null ? ' muted' : ''}`}
            >
              <h3>{a.name}</h3>
              <UsageRing percent={percent} color={RING_COLOR[a.id]} />
              {usage?.at ? (
                <p className="usage-detail">Resets {formatResetAt(usage.at)}</p>
              ) : (
                <p className="usage-detail">
                  {a.usageReset?.error ??
                    'Usage % not available from this provider yet'}
                </p>
              )}
              {usage?.note ? <p className="usage-note">{usage.note}</p> : null}
            </article>
          )
        })}
      </div>

      <style>{`
        .panel {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 1.4rem 1.35rem 1.55rem;
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
        }
        .panel-head h2 { font-size: 1.45rem; }
        .panel-head p {
          margin: 0.4rem 0 0;
          color: var(--muted);
          font-size: 0.82rem;
          line-height: 1.45;
        }
        .usage-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }
        @media (max-width: 900px) {
          .usage-row { grid-template-columns: 1fr; }
        }
        .usage-card {
          border: 1px solid var(--line);
          background:
            radial-gradient(ellipse at top, #121212 0%, transparent 60%),
            #080808;
          padding: 1.25rem 1rem 1.2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          text-align: center;
          min-height: 18rem;
        }
        .usage-card.muted { opacity: 0.78; }
        .usage-card h3 {
          margin: 0;
          font-family: Syne, sans-serif;
          font-weight: 700;
          font-size: 1.15rem;
        }
        .ring {
          position: relative;
          width: 168px;
          height: 168px;
          margin: 0.35rem 0;
        }
        .ring-center {
          position: absolute;
          inset: 0;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 0.05rem;
        }
        .ring-center strong {
          font-size: 2.35rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .ring-center span {
          font-size: 0.85rem;
          color: var(--muted);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .ring-na {
          font-size: 1.4rem;
          color: var(--dim);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .usage-detail {
          margin: 0;
          font-size: 0.78rem;
          color: var(--text);
          line-height: 1.4;
          max-width: 16rem;
        }
        .usage-note {
          margin: 0;
          font-size: 0.68rem;
          color: var(--dim);
          line-height: 1.4;
          max-width: 16rem;
        }
      `}</style>
    </section>
  )
}
