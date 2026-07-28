import { useMemo } from 'react'
import type { Theme } from '../lib/theme'
import type { GithubSnapshot } from '../lib/types'

type Props = {
  github: GithubSnapshot
  theme: Theme
}

/** Remap GitHub greens to grayscale that follows the active theme. */
function grayLevel(count: number, max: number, theme: Theme): string {
  if (count <= 0) {
    return theme === 'light' ? '#e4e7ec' : '#141414'
  }
  const t = Math.min(1, count / Math.max(max, 1))
  if (theme === 'light') {
    const v = Math.round(210 - t * 165)
    return `rgb(${v},${v},${v})`
  }
  const v = Math.round(40 + t * 180)
  return `rgb(${v},${v},${v})`
}

export function GithubPanel({ github, theme }: Props) {
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
                  style={{ background: grayLevel(day.count, max, theme) }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="err-box">
          <p className="err">{github.error ?? 'Unavailable'}</p>
          {github.hint ? <p className="hint">{github.hint}</p> : (
            <p className="hint">
              Run <code>gh auth login</code> so this machine can read your
              contribution calendar.
            </p>
          )}
        </div>
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
          border: 1px solid var(--line);
        }
        .err-box { display: flex; flex-direction: column; gap: 0.45rem; }
        .err { margin: 0; color: var(--muted); font-size: 0.8rem; }
        .hint { margin: 0; color: var(--dim); font-size: 0.75rem; line-height: 1.45; }
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
