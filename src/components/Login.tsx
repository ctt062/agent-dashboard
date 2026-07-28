import { useEffect, useRef, useState } from 'react'

type AuthConfig = {
  configured: boolean
  clientId: string | null
  allowedEmailsConfigured: boolean
}

type AuthUser = {
  email: string
  name: string | null
  picture: string | null
}

type Props = {
  onSignedIn: (user: AuthUser) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string
              size?: string
              text?: string
              shape?: string
              width?: number
            },
          ) => void
          prompt: () => void
        }
      }
    }
  }
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-gsi]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google sign-in script')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google sign-in script'))
    document.head.appendChild(script)
  })
}

export function Login({ onSignedIn }: Props) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/config')
        const json = (await res.json()) as AuthConfig
        setConfig(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [])

  useEffect(() => {
    if (!config?.configured || !config.clientId || !buttonRef.current) return
    let cancelled = false

    void (async () => {
      try {
        await loadGoogleScript()
        if (cancelled || !buttonRef.current || !window.google) return

        window.google.accounts.id.initialize({
          client_id: config.clientId!,
          callback: async (response) => {
            setBusy(true)
            setError(null)
            try {
              const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
              })
              const json = (await res.json()) as {
                user?: AuthUser
                message?: string
                error?: string
              }
              if (!res.ok || !json.user) {
                throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`)
              }
              onSignedIn(json.user)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        buttonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 280,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [config, onSignedIn])

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Local Mac</p>
        <h1>Agent Deck</h1>
        <p className="login-copy">
          Sign in with Google to open your private agent dashboard. Google must
          verify your email before access is granted.
        </p>

        {!config ? (
          <p className="login-status">Checking sign-in…</p>
        ) : !config.configured ? (
          <div className="login-setup">
            <p>
              Google sign-in is not configured yet. On this Mac:
            </p>
            <ol>
              <li>
                Create an OAuth <strong>Web client</strong> in Google Cloud
                Console
              </li>
              <li>
                Add authorized JavaScript origins:{' '}
                <code>http://127.0.0.1:3847</code> (and your LAN URL if using
                phone)
              </li>
              <li>
                Copy <code>.env.example</code> to <code>.env</code> and set{' '}
                <code>GOOGLE_CLIENT_ID</code>
              </li>
              <li>
                Optional: set <code>ALLOWED_EMAILS=you@gmail.com</code>
              </li>
              <li>
                Restart with <code>npm run setup</code>
              </li>
            </ol>
          </div>
        ) : (
          <>
            <div ref={buttonRef} className="google-btn" />
            {busy ? <p className="login-status">Verifying email…</p> : null}
          </>
        )}

        {error ? <p className="login-error">{error}</p> : null}
      </div>

      <style>{`
        .login-shell {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          padding-top: max(1.5rem, env(safe-area-inset-top));
          background:
            radial-gradient(ellipse at top, #141414 0%, transparent 55%),
            var(--bg);
        }
        .login-card {
          width: min(420px, 100%);
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 1.75rem 1.5rem 1.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .eyebrow {
          margin: 0;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        h1 { font-size: clamp(2rem, 6vw, 2.6rem); }
        .login-copy {
          margin: 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.5;
        }
        .google-btn { min-height: 44px; display: grid; place-items: center; }
        .login-status { margin: 0; color: var(--muted); font-size: 0.78rem; }
        .login-error {
          margin: 0;
          color: #d0d0d0;
          border: 1px solid var(--line);
          padding: 0.65rem 0.75rem;
          font-size: 0.78rem;
          line-height: 1.4;
        }
        .login-setup {
          color: var(--muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .login-setup p { margin: 0 0 0.55rem; }
        .login-setup ol {
          margin: 0;
          padding-left: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
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
