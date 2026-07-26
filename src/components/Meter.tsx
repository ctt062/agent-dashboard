type Props = {
  label: string
  value: number
  detail?: string
}

export function Meter({ label, value, detail }: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <strong>{clamped.toFixed(1)}%</strong>
      </div>
      <div className="meter-track" aria-hidden>
        <div className="meter-fill" style={{ width: `${clamped}%` }} />
      </div>
      {detail ? <p className="meter-detail">{detail}</p> : null}
      <style>{`
        .meter { display: flex; flex-direction: column; gap: 0.55rem; }
        .meter-head {
          display: flex; justify-content: space-between; gap: 1rem;
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--muted);
        }
        .meter-head strong { color: var(--text); font-weight: 600; letter-spacing: 0; text-transform: none; font-size: 1.1rem; }
        .meter-track {
          height: 2px; background: var(--line); position: relative; overflow: hidden;
        }
        .meter-fill {
          height: 100%; background: var(--text); transition: width 0.4s ease;
        }
        .meter-detail { margin: 0; font-size: 0.72rem; color: var(--dim); }
      `}</style>
    </div>
  )
}
