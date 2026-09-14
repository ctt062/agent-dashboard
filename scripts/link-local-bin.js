#!/usr/bin/env node
// Local `npm install` does not link this package's own `bin` into
// `node_modules/.bin`. Without that link, `npx agent-deck` looks up the
// unpublished name on the registry and 404s. `prepare` creates the link.
import { lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'node_modules', '.bin')
const target = join(root, 'bin', 'agent-deck.js')
const linkPath = join(binDir, 'agent-deck')

mkdirSync(binDir, { recursive: true })

try {
  lstatSync(linkPath)
  unlinkSync(linkPath)
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code !== 'ENOENT') {
    throw err
  }
}

symlinkSync(relative(binDir, target), linkPath)
