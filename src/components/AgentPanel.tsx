import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatNumber,
  formatResetAt,
  rangeLabel,
  type AgentShare,
  type DailyPoint,
  type DateRange,
  DATE_RANGES,
} from '../lib/types'

const COLORS: Record<AgentShare['id'], string> = {
  cursor: '#f5f5f5',
  claude: '#bdbdbd',
  codex: '#8a8a8a',
}

const SECONDARY: Record<AgentShare['id'], string> = {
  cursor: '#6a6a6a',
  claude: '#5a5a5a',
  codex: '#4a4a4a',
}

type Props = {
  agents: AgentShare[]
  range: DateRange
  onRangeChange: (range: DateRange) => void
}

function metricLines(agent: AgentShare): string[] {
  const m = agent.metrics
  const lines: string[] = []
  if (agent.id === 'cursor') {
    if (m.acceptedLines != null)
      lines.push(`${formatNumber(m.acceptedLines)} accepted lines`)
    if (m.suggestedLines != null)
      lines.push(`${formatNumber(m.suggestedLines)} suggested lines`)
    if (m.acceptanceRate != null && m.suggestedLines)
      lines.push(`${m.acceptanceRate}% acceptance`)
    if (m.composers != null)
      lines.push(`${formatNumber(m.composers)} chats (all-time)`)
    if (m.costUsd != null && m.costUsd > 0)
      lines.push(`$${m.costUsd.toFixed(2)} tracked cost (all-time)`)
  } else {
    if (m.totalTokens)
      lines.push(`${formatNumber(m.totalTokens)} tokens`)
    if (m.inputTokens)
      lines.push(`${formatNumber(m.inputTokens)} input`)
    if (m.outputTokens)
      lines.push(`${formatNumber(m.outputTokens)} output`)
    if (m.cacheTokens)
      lines.push(`${formatNumber(m.cacheTokens)} cache`)
    if (m.sessions != null) lines.push(`${formatNumber(m.sessions)} sessions (all-time)`)
    if (m.messages != null && agent.id === 'claude')
      lines.push(`${formatNumber(m.messages)} messages`)
    if (m.events != null && agent.id === 'codex')
      lines.push(`${formatNumber(m.events)} events`)
  }
  return lines.slice(0, 6)
}

function shortDate(date: string): string {
  return date.slice(5)
}

/** Per-day score contribution matching server computePeriodScore / share %. */
function dayWeightedScore(agent: AgentShare, day: DailyPoint | undefined): number {
  if (!day) return 0
  if (agent.id === 'cursor') return day.primary
  if (day.primaryLabel === 'messages') return day.primary * 800
  if (day.primaryLabel === 'events') return day.primary * 120
  return day.primary
}

export function AgentPanel({ agents, range, onRangeChange }: Props) {
  const availableAgents = useMemo(
    () => agents.filter((a) => a.available && a.daily.length > 0),
    [agents],
  )

  const comparison = useMemo(() => {
    const dates = new Set<string>()
    for (const a of availableAgents) {
      for (const d of a.daily) dates.add(d.date)
    }
    return [...dates]
      .sort()
      .map((date) => {
        const row: Record<string, string | number> = { date: shortDate(date) }
        for (const a of availableAgents) {
          row[a.id] = dayWeightedScore(
            a,
            a.daily.find((d) => d.date === date),
          )
        }
        return row
      })
  }, [availableAgents])

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>AI agents</h2>
          <p>
            Relative share of local activity · {rangeLabel(range)} window
          </p>
        </div>
        <div className="range-wrap">
          <div className="range" role="group" aria-label="Date range">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={r === range ? 'active' : undefined}
                onClick={() => onRangeChange(r)}
              >
                {rangeLabel(r)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="share-row">
        {agents.map((a) => (
          <div
            key={a.id}
            className={`share-card${a.available ? '' : ' muted'}`}
          >
            <div className="share-top">
              <span className="name">{a.name}</span>
              <span className="pct">
                {a.available ? `${a.percent.toFixed(1)}%` : '-'}
              </span>
            </div>
            <div className="bar" aria-hidden>
              <div
                className="bar-fill"
                style={{
                  width: a.available ? `${Math.max(a.percent, 0.5)}%` : '0%',
                  background: COLORS[a.id],
                }}
              />
            </div>
            <div className="stat-grid">
              <div>
                <span className="stat-label">Period</span>
                <strong>{formatNumber(a.stats.periodTotal)}</strong>
              </div>
              <div>
                <span className="stat-label">Avg / day</span>
                <strong>{a.stats.avgPerDay.toFixed(1)}</strong>
              </div>
              <div>
                <span className="stat-label">Active days</span>
                <strong>{a.stats.activeDays}</strong>
              </div>
              <div>
                <span className="stat-label">Peak</span>
                <strong>
                  {a.stats.peakDay
                    ? `${shortDate(a.stats.peakDay)} · ${formatNumber(a.stats.peakValue)}`
                    : '-'}
                </strong>
              </div>
            </div>
            <div className="reset-block">
              <span className="stat-label">Usage reset</span>
              {a.usageReset?.windows?.length ? (
                <ul className="reset-list">
                  {a.usageReset.windows.map((w) => (
                    <li key={`${a.id}-${w.label}-${w.at ?? w.note ?? ''}`}>
                      <strong>{w.label}</strong>
                      {w.at ? (
                        <span> · {formatResetAt(w.at)}</span>
                      ) : w.note ? null : (
                        <span> · unknown</span>
                      )}
                      {w.usedPercent != null ? (
                        <span className="reset-used"> · {w.usedPercent}% used</span>
                      ) : null}
                      {w.note ? <span className="reset-note"> · {w.note}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="reset-fallback">
                  {a.usageReset?.error ?? 'Reset time unavailable'}
                </p>
              )}
            </div>
            <ul>
              {metricLines(a).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {a.note ? <p className="note">{a.note}</p> : null}
            {a.hint ? <p className="hint">{a.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="charts">
        {agents.map((a) => (
          <div key={`${a.id}-chart`} className="chart-card">
            <div className="chart-label">
              {a.name} · {a.daily[0]?.primaryLabel ?? 'activity'}
              {a.daily[0]?.secondaryLabel
                ? ` + ${a.daily[0].secondaryLabel}`
                : ''}
            </div>
            <div className="chart-box">
              {!a.available ? (
                <p className="empty">
                  {a.hint ?? a.note ?? 'Collector unavailable'}
                </p>
              ) : a.daily.length === 0 ? (
                <p className="empty">No daily series in this range</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={a.daily}>
                    <CartesianGrid stroke="#151515" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      tick={{ fill: '#5a5a5a', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: '#5a5a5a', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                      tickFormatter={(v) => formatNumber(Number(v))}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0c0c0c',
                        border: '1px solid #1c1c1c',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: '#7a7a7a' }}
                      formatter={(value, name) => [
                        formatNumber(Number(value ?? 0)),
                        String(name),
                      ]}
                      labelFormatter={(label) => String(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="primary"
                      name={a.daily[0]?.primaryLabel ?? 'primary'}
                      stroke={COLORS[a.id]}
                      fill={COLORS[a.id]}
                      fillOpacity={0.12}
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                    {a.daily.some((d) => d.secondary != null) ? (
                      <Area
                        type="monotone"
                        dataKey="secondary"
                        name={a.daily[0]?.secondaryLabel ?? 'secondary'}
                        stroke={SECONDARY[a.id]}
                        fill={SECONDARY[a.id]}
                        fillOpacity={0.06}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        isAnimationActive={false}
                      />
                    ) : null}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="compare-card">
        <div className="chart-label">
          Comparison · weighted activity (share-aligned)
        </div>
        <div className="compare-box">
          {comparison.length === 0 ? (
            <p className="empty">No overlapping daily series yet</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison}>
                <CartesianGrid stroke="#151515" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#5a5a5a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: '#5a5a5a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0c0c0c',
                    border: '1px solid #1c1c1c',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatNumber(Number(value ?? 0)),
                    String(name),
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#7a7a7a' }}
                />
                {availableAgents.map((a) => (
                  <Line
                    key={a.id}
                    type="monotone"
                    dataKey={a.id}
                    name={a.name}
                    stroke={COLORS[a.id]}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
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
        .panel-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: end;
          flex-wrap: wrap;
        }
        .panel-head h2 { font-size: 1.35rem; }
        .panel-head p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.78rem; }
        .range-wrap {
          display: flex;
          flex-direction: column;
          align-items: end;
          gap: 0.35rem;
        }
        .range { display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: end; }
        .range button {
          padding: 0.35rem 0.65rem;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .range button.active {
          border-color: var(--text);
          color: var(--text);
          background: #141414;
        }
        .reset-block {
          border-top: 1px solid var(--line);
          padding-top: 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .reset-list {
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 0.7rem;
          color: var(--muted);
          line-height: 1.4;
        }
        .reset-list strong { color: var(--text); font-weight: 500; }
        .reset-used { color: var(--text); }
        .reset-note { color: var(--dim); }
        .reset-fallback {
          margin: 0;
          font-size: 0.7rem;
          color: var(--dim);
          line-height: 1.35;
        }
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
          min-height: 12rem;
        }
        .share-card.muted { opacity: 0.72; }
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
        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.45rem 0.75rem;
        }
        .stat-label {
          display: block;
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--dim);
        }
        .stat-grid strong {
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--text);
        }
        ul { list-style: none; margin: 0; padding: 0; color: var(--muted); font-size: 0.72rem; }
        li + li { margin-top: 0.2rem; }
        .note { margin: 0; font-size: 0.68rem; color: var(--dim); line-height: 1.35; }
        .hint {
          margin: 0;
          font-size: 0.68rem;
          color: var(--muted);
          line-height: 1.4;
          border-top: 1px solid var(--line);
          padding-top: 0.55rem;
        }
        .charts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }
        @media (max-width: 900px) {
          .charts { grid-template-columns: 1fr; }
        }
        .chart-card, .compare-card {
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
        .chart-box { height: 160px; }
        .compare-box { height: 220px; }
        .empty {
          margin: 0; height: 100%; display: grid; place-items: center;
          color: var(--dim); font-size: 0.75rem; text-align: center;
          padding: 0 0.75rem; line-height: 1.4;
        }
      `}</style>
    </section>
  )
}
