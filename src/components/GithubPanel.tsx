import { useMemo } from 'react'
import type { GithubSnapshot } from '../lib/types'

type Props = {
  github: GithubSnapshot
}

/** Remap GitHub greens to grayscale for the black theme. */
function grayLevel(count: number, max: number): string {
  if (count <= 0) return '#141414'
  const t = Math.min(1, count / Math.max(max, 1))
  const v = Math.round(40 + t * 180)
  return `rgb(${v},${v},${v})`
}

export function GithubPanel({ github }: Props) {
  const max = useMemo(
    () => Math.max(1, ...github.days.map((d) => d.count)),
    [github.days],
  )

  const weeks = useMemo(() => {
    const out: Array<typeof github.days> = []
    for (let i = 0; i < github.days.length; i += 7) {
      out.push(github.days.slice(i, i + 7))
    }
    return out
  }, [github.days])

  return (
    <section className="gh">
      <header className="gh-head">
        <h2>GitHub</h2>
        <p>
          {github.ok
            ? `@${github.login} · ${github.totalContributions.toLocaleString()} contributions (last year)`
            : github.error ?? 'Unavailable'}
        </p>
      </header>
      {github.ok ? (
        <div className="heatmap" role="img" aria-label="Contribution heatmap">
          {weeks.map((week, wi) => (
            <div className="week" key={week[0]?.date ?? wi}>
              {week.map((day) => (
                <span
                  key={day.date}
                  className="cell"
                  title={`${day.date}: ${day.count}`}
                  style={{ background: grayLevel(day.count, max) }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="err">
          Run <code>gh auth login</code> so this machine can read your
          contribution calendar.
        </p>
      )}
      <style>{`
        .gh {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 1.25rem 1.35rem 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .gh-head h2 { font-size: 1.35rem; }
        .gh-head p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.78rem; }
        .heatmap {
          display: flex;
          gap: 3px;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }
        .week { display: flex; flex-direction: column; gap: 3px; }
        .cell {
          width: 11px; height: 11px; display: block;
          border: 1px solid #101010;
        }
        .err { margin: 0; color: var(--muted); font-size: 0.8rem; }
        code {
          font-family: inherit;
          color: var(--text);
          border: 1px solid var(--line);
          padding: 0.05rem 0.3rem;
        }
      `}</style>
    </section>
  )
}
