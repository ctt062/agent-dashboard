import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('package command contract', () => {
  it('exposes agent-deck as the product bin and does not advertise a localhost server', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      bin?: Record<string, string>
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    assert.equal(pkg.bin?.['agent-deck'], 'bin/agent-deck.js')
    assert.match(pkg.scripts?.start ?? '', /tui\/cli/)
    assert.equal(pkg.scripts?.serve, undefined)
    assert.equal(pkg.scripts?.['launchagent:install'], undefined)
    assert.equal(pkg.scripts?.['dev:web'], undefined)
    assert.equal(pkg.dependencies?.express, undefined)
    assert.equal(pkg.dependencies?.vite, undefined)
    assert.equal(pkg.devDependencies?.vite, undefined)
    assert.ok(pkg.dependencies?.ink)
  })
})
