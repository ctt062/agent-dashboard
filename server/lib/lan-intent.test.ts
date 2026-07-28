import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('LAN phone webapp intent', () => {
  it('exposes serve:lan and dev:lan with HOST=0.0.0.0', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    assert.match(pkg.scripts['serve:lan'], /HOST=0\.0\.0\.0/)
    assert.match(pkg.scripts['dev:lan'], /HOST=0\.0\.0\.0/)
    assert.match(pkg.scripts['dev:lan'], /VITE_HOST=0\.0\.0\.0/)
  })

  it('ships a standalone web manifest for Add to Home Screen', () => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'),
    ) as {
      name: string
      short_name: string
      display: string
      start_url: string
    }
    assert.equal(manifest.name, 'Agent Deck')
    assert.equal(manifest.short_name, 'Agent Deck')
    assert.equal(manifest.display, 'standalone')
    assert.equal(manifest.start_url, '/')
  })

  it('wires mobile PWA meta + manifest into index.html', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
    assert.match(html, /viewport-fit=cover/)
  })

  it('documents Mac API + optional Vercel static UI and LAN PIN access', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    assert.match(readme, /Why the Mac still runs the API/)
    assert.match(readme, /do not deploy the collectors to a public cloud/i)
    assert.match(readme, /agent-dashboard-ctt\.vercel\.app/)
    assert.match(readme, /DASHBOARD_PIN/)
    assert.match(readme, /npm run serve:lan/)
    assert.match(readme, /npm run dev:lan/)
    assert.match(readme, /Add to Home Screen/)
    assert.match(readme, /Google GIS does \*\*not\*\* accept raw LAN IPs/)
    assert.doesNotMatch(
      readme,
      /Authorized JavaScript origins[\s\S]{0,400}192\.168/,
    )
  })
})
