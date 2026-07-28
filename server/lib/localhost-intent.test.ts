import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('localhost-only intent', () => {
  it('does not ship auth, LAN, tunnel, or Vercel scripts', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
    }
    assert.equal(pkg.scripts['serve:lan'], undefined)
    assert.equal(pkg.scripts['tunnel:install'], undefined)
    assert.match(pkg.scripts.setup, /launchagent:install/)
    assert.equal(pkg.dependencies['google-auth-library'], undefined)
    assert.equal(pkg.dependencies['cookie-session'], undefined)
  })

  it('documents open-local dashboard without Google sign-in', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    assert.match(readme, /localhost-only/i)
    assert.match(readme, /127\.0\.0\.1:3847/)
    assert.match(readme, /No cloud host and no sign-in/)
    assert.doesNotMatch(readme, /GOOGLE_CLIENT_ID/)
    assert.doesNotMatch(readme, /ALLOWED_EMAILS/)
    assert.doesNotMatch(readme, /vercel\.app/i)
    assert.doesNotMatch(readme, /cloudflare/i)
    assert.doesNotMatch(readme, /DASHBOARD_PIN/)
  })

  it('defaults LaunchAgent to 127.0.0.1 without Google env', () => {
    const script = readFileSync(
      join(root, 'scripts/install-launchagent.sh'),
      'utf8',
    )
    assert.match(script, /HOST_VALUE="127\.0\.0\.1"/)
    assert.match(script, /http:\/\/127\.0\.0\.1:\$\{PORT_VALUE\}/)
    assert.doesNotMatch(script, /GOOGLE_CLIENT_ID|ALLOWED_EMAILS|SESSION_SECRET/)
  })
})
