#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const cli = join(root, 'tui/cli.ts')
const tsx = join(root, 'node_modules/tsx/dist/cli.mjs')

if (!existsSync(cli)) {
  process.stderr.write('agent-deck: missing tui/cli.ts\n')
  process.exit(1)
}

const tsxArgs = existsSync(tsx)
  ? [tsx, cli, ...process.argv.slice(2)]
  : ['--import', 'tsx', cli, ...process.argv.slice(2)]

const child = spawn(process.execPath, tsxArgs, {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
