import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber, type AgentShare } from '../lib/types'

const COLORS: Record<AgentShare['id'], string> = {
  cursor: '#f5f5f5',
  claude: '#bdbdbd',
  codex: '#8a8a8a',
}

type Props = {
  agents: AgentShare[]
}

function metricLines(agent: AgentShare): string[] {
  const m = agent.metrics
  const lines: string[] = []
  if (agent.id === 'cursor') {
    if (m.acceptedLines != null)
      lines.push(`${formatNumber(m.acceptedLines)} accepted lines`)
    if (m.composers != null) lines.push(`${formatNumber(m.composers)} chats`)
    if (m.messages != null) lines.push(`${formatNumber(m.messages)} messages`)
  } else {
    if (m.totalTokens) lines.push(`${formatNumber(m.totalTokens)} tokens`)
    if (m.sessions != null) lines.push(`${formatNumber(m.sessions)} sessions`)
    if (m.messages != null) lines.push(`${formatNumber(m.messages)} messages`)
    if (m.events != null) lines.push(`${formatNumber(m.events)} events`)
  }
  return lines.slice(0, 3)
}

export function AgentPanel({ agents }: Props) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>AI agents</h2>
        <p>Share of local activity across Cursor, Claude Code, and Codex</p>
      </header>

      <div className="share-row">
        {agents.map((a) => (
          <div key={a.id} className="share-card">
            <div className="share-top">
              <span className="name">{a.name}</span>
              <span className="pct">{a.percent.toFixed(1)}%</span>
            </div>
            <div className="bar" aria-hidden>
              <div
                className="bar-fill"
                style={{
                  width: `${Math.max(a.percent, 0.5)}%`,
                  background: COLORS[a.id],
                }}
              />
            </div>
            <ul>
              {metricLines(a).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {a.note ? <p className="note">{a.note}</p> : null}
          </div>
        ))}
      </div>

      <div className="charts">
        {agents.map((a) => (
          <div key={`${a.id}-chart`} className="chart-card">
            <div className="chart-label">{a.name} · recent</div>
            <div className="chart-box">
              {a.daily.length === 0 ? (
                <p className="empty">No daily series yet</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={a.daily}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{
                        background: '#0c0c0c',
                        border: '1px solid #1c1c1c',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: '#7a7a7a' }}
                      formatter={(value) => [
                        formatNumber(Number(value ?? 0)),
                        a.daily[0]?.label ?? 'value',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={COLORS[a.id]}
                      fill={COLORS[a.id]}
                      fillOpacity={0.12}
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .panel {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 1.25rem 1.35rem 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .panel-head h2 { font-size: 1.35rem; }
        .panel-head p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.78rem; }
        .share-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }
        @media (max-width: 900px) {
          .share-row { grid-template-columns: 1fr; }
        }
        .share-card {
          border: 1px solid var(--line);
          padding: 0.9rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          min-height: 9.5rem;
        }
        .share-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.75rem;
        }
        .name {
          font-family: Syne, sans-serif;
          font-weight: 700;
          font-size: 1.05rem;
        }
        .pct { font-size: 1.35rem; font-weight: 600; }
        .bar { height: 2px; background: var(--line); }
        .bar-fill { height: 100%; }
        ul { list-style: none; margin: 0; padding: 0; color: var(--muted); font-size: 0.72rem; }
        li + li { margin-top: 0.2rem; }
        .note { margin: 0; font-size: 0.68rem; color: var(--dim); line-height: 1.35; }
        .charts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }
        @media (max-width: 900px) {
          .charts { grid-template-columns: 1fr; }
        }
        .chart-card {
          border: 1px solid var(--line);
          padding: 0.75rem 0.85rem 0.5rem;
        }
        .chart-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          margin-bottom: 0.4rem;
        }
        .chart-box { height: 110px; }
        .empty {
          margin: 0; height: 100%; display: grid; place-items: center;
          color: var(--dim); font-size: 0.75rem;
        }
      `}</style>
    </section>
  )
}
