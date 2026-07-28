import { useId } from 'react'
import {
  buildCumulativeChart,
  type CumulativeSeriesPoint,
} from '../lib/cumulativeUsage'
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
            <strong>
              {percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}
            </strong>
            <span>%</span>
          </>
        )}
      </div>
    </div>
  )
}

const LINE_META: Array<{
  id: AgentShare['id']
  label: string
  color: string
  dash?: string
  width: number
  marker: 'circle' | 'square' | 'diamond'
}> = [
  {
    id: 'cursor',
    label: 'Cursor',
    color: '#f4f4f4',
    width: 2.75,
    marker: 'circle',
  },
  {
    id: 'claude',
    label: 'Claude',
    color: '#3ecf8e',
    dash: '7 5',
    width: 2.5,
    marker: 'square',
  },
  {
    id: 'codex',
    label: 'Codex',
    color: '#f0b429',
    dash: '2 5',
    width: 2.5,
    marker: 'diamond',
  },
]

const RING_COLOR: Record<AgentShare['id'], string> = {
  cursor: '#f4f4f4',
  claude: '#3ecf8e',
  codex: '#f0b429',
}

function linePath(
  points: CumulativeSeriesPoint[],
  key: AgentShare['id'],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string {
  let d = ''
  let started = false
  points.forEach((p, i) => {
    const v = p[key]
    if (v == null) {
      started = false
      return
    }
    const cmd = started ? 'L' : 'M'
    d += `${cmd}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `
    started = true
  })
  return d.trim()
}

function Marker({
  kind,
  x,
  y,
  color,
}: {
  kind: 'circle' | 'square' | 'diamond'
  x: number
  y: number
  color: string
}) {
  if (kind === 'circle') {
    return <circle cx={x} cy={y} r={3.4} fill={color} stroke="#050505" strokeWidth={1} />
  }
  if (kind === 'square') {
    return (
      <rect
        x={x - 3.2}
        y={y - 3.2}
        width={6.4}
        height={6.4}
        fill={color}
        stroke="#050505"
        strokeWidth={1}
      />
    )
  }
  const s = 4.2
  return (
    <polygon
      points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
      fill={color}
      stroke="#050505"
      strokeWidth={1}
    />
  )
}

function LegendSwatch({
  color,
  dash,
  marker,
}: {
  color: string
  dash?: string
  marker: 'circle' | 'square' | 'diamond'
}) {
  return (
    <svg width="36" height="14" viewBox="0 0 36 14" aria-hidden>
      <line
        x1="2"
        y1="7"
        x2="34"
        y2="7"
        stroke={color}
        strokeWidth="2.4"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      <g transform="translate(18 7)">
        {marker === 'circle' ? (
          <circle r="3.2" fill={color} />
        ) : marker === 'square' ? (
          <rect x="-3" y="-3" width="6" height="6" fill={color} />
        ) : (
          <polygon points="0,-4 4,0 0,4 -4,0" fill={color} />
        )}
      </g>
    </svg>
  )
}

function CumulativeUsageChart({ agents }: { agents: AgentShare[] }) {
  const gradientId = useId().replace(/:/g, '')
  const chart = buildCumulativeChart(agents)
  const width = 720
  const height = 260
  const pad = { top: 18, right: 18, bottom: 42, left: 42 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const maxY = Math.max(
    1,
    ...chart.points.flatMap((p) =>
      [p.cursor, p.claude, p.codex].filter((v): v is number => v != null),
    ),
    100,
  )

  const xAt = (i: number) =>
    pad.left +
    (chart.points.length <= 1
      ? innerW / 2
      : (i / (chart.points.length - 1)) * innerW)
  const yAt = (v: number) => pad.top + innerH * (1 - Math.min(v, maxY) / maxY)

  const formatTick = (ymd: string) => {
    const [, m, d] = ymd.split('-')
    return `${Number(m)}/${Number(d)}`
  }

  const xTicks =
    chart.points.length <= 1
      ? [{ i: 0, label: 'now' }]
      : [
          { i: 0, label: `start · ${formatTick(chart.startDate)}` },
          {
            i: Math.floor((chart.points.length - 1) / 2),
            label: formatTick(
              chart.points[Math.floor((chart.points.length - 1) / 2)]!.date,
            ),
          },
          {
            i: chart.points.length - 1,
            label: `now · ${formatTick(chart.endDate)}`,
          },
        ]

  // Marker cadence: endpoints + ~weekly for long cycles, else every point.
  const markerStep =
    chart.points.length > 21 ? 7 : chart.points.length > 10 ? 3 : 1

  if (!chart.hasData) {
    return (
      <div className="cum-empty">
        No billing-cycle window yet to plot.
      </div>
    )
  }

  return (
    <div className="cum">
      <div className="cum-head">
        <h3>Cumulative usage</h3>
        <p>
          {chart.yLabel} from cycle start ({formatTick(chart.startDate)}) to now
          ({formatTick(chart.endDate)}).
        </p>
      </div>
      <div className="cum-legend">
        {LINE_META.map((line) => (
          <span key={line.id} className="cum-legend-item">
            <LegendSwatch
              color={line.color}
              dash={line.dash}
              marker={line.marker}
            />
            {line.label}
          </span>
        ))}
      </div>
      <svg
        className="cum-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Cumulative billing-cycle usage by agent"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#080808" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill={`url(#${gradientId})`}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + innerH * (1 - t)
          const label = Math.round(maxY * t)
          return (
            <g key={t}>
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y + 3}
                textAnchor="end"
                className="cum-tick"
              >
                {label}
              </text>
            </g>
          )
        })}
        {xTicks.map((tick) => {
          const p = chart.points[tick.i]
          if (!p) return null
          return (
            <text
              key={`${tick.i}-${tick.label}`}
              x={xAt(tick.i)}
              y={height - 14}
              textAnchor={
                tick.i === 0
                  ? 'start'
                  : tick.i === chart.points.length - 1
                    ? 'end'
                    : 'middle'
              }
              className="cum-tick"
            >
              {tick.label}
            </text>
          )
        })}
        {LINE_META.map((line) => (
          <g key={line.id}>
            <path
              d={linePath(chart.points, line.id, xAt, yAt)}
              fill="none"
              stroke={line.color}
              strokeWidth={line.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.dash}
            />
            {chart.points.map((p, i) => {
              const v = p[line.id]
              if (v == null) return null
              const isEnd = i === 0 || i === chart.points.length - 1
              if (!isEnd && i % markerStep !== 0) return null
              return (
                <Marker
                  key={`${line.id}-${p.date}`}
                  kind={line.marker}
                  x={xAt(i)}
                  y={yAt(v)}
                  color={line.color}
                />
              )
            })}
          </g>
        ))}
      </svg>
    </div>
  )
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
              className={`usage-card agent-${a.id}${percent == null ? ' muted' : ''}`}
            >
              <h3>
                <span className="agent-dot" aria-hidden />
                {a.name}
              </h3>
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

      <CumulativeUsageChart agents={agents} />

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
          border-top: 2px solid var(--agent, var(--line));
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
        .usage-card.agent-cursor { --agent: #f4f4f4; }
        .usage-card.agent-claude { --agent: #3ecf8e; }
        .usage-card.agent-codex { --agent: #f0b429; }
        .usage-card.muted { opacity: 0.78; }
        .usage-card h3 {
          margin: 0;
          font-family: Syne, sans-serif;
          font-weight: 700;
          font-size: 1.15rem;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }
        .agent-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: var(--agent);
        }
        .usage-card.agent-claude .agent-dot { border-radius: 1px; }
        .usage-card.agent-codex .agent-dot {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 0;
          transform: rotate(45deg);
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
        .cum {
          border: 1px solid var(--line);
          background: #080808;
          padding: 1rem 1rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .cum-head h3 {
          margin: 0;
          font-family: Syne, sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
        }
        .cum-head p {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.75rem;
          line-height: 1.45;
        }
        .cum-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.85rem;
        }
        .cum-legend-item {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.72rem;
          color: var(--text);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .cum-svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .cum-tick {
          fill: var(--dim);
          font-size: 10px;
        }
        .cum-empty {
          border: 1px solid var(--line);
          padding: 1rem;
          color: var(--muted);
          font-size: 0.8rem;
        }
      `}</style>
    </section>
  )
}
