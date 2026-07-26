import { formatBytes, formatUptime, type SystemSnapshot } from '../lib/types'
import { Meter } from './Meter'

type Props = {
  system: SystemSnapshot
}

export function SystemPanel({ system }: Props) {
  const { cpu, memory, gpu } = system
  return (
    <section className="sys">
      <header className="sys-head">
        <h2>Mac</h2>
        <p>
          {system.hostname} · up {formatUptime(system.uptimeSec)} · load{' '}
          {system.loadAvg.map((n) => n.toFixed(2)).join(' / ')}
        </p>
      </header>
      <div className="sys-grid">
        <Meter
          label="CPU"
          value={cpu.utilization}
          detail={`${cpu.model} · ${cpu.cores} cores`}
        />
        <Meter
          label="Memory"
          value={memory.utilization}
          detail={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
        />
        <Meter
          label="GPU"
          value={gpu.utilization}
          detail={
            gpu.cores
              ? `${gpu.name} · ${gpu.cores} cores`
              : gpu.name
          }
        />
      </div>
      <style>{`
        .sys {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 1.25rem 1.35rem 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }
        .sys-head h2 { font-size: 1.35rem; }
        .sys-head p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.78rem; }
        .sys-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.4rem;
        }
        @media (max-width: 900px) {
          .sys-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  )
}
