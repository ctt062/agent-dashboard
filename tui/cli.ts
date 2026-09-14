import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDashboard } from '../server/lib/dashboard.js'
import type { DashboardPayload } from '../server/types.js'
import { formatDeck, HELP_TEXT } from './status.js'

export type LoadDashboard = (force?: boolean) => Promise<DashboardPayload>

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'once' }
  | { kind: 'tui' }
  | { kind: 'error'; message: string }

export type CliIo = {
  stdout: { write(chunk: string): void }
  stderr: { write(chunk: string): void }
  stdinIsTTY: boolean
  stdoutIsTTY: boolean
}

export type CliDeps = {
  io: CliIo
  loadDashboard: LoadDashboard
  renderTui: (load: LoadDashboard) => Promise<void>
  readVersion: () => string
}

const USAGE_ERROR =
  'Unknown argument. Try `agent-deck --help`.'

export function parseArgv(argv: string[]): CliCommand {
  const args = argv.filter((a) => a !== '--')
  if (args.length === 0) return { kind: 'tui' }
  if (args.length === 1) {
    const a = args[0]
    if (a === '--help' || a === '-h' || a === 'help') return { kind: 'help' }
    if (a === '--version' || a === '-v') return { kind: 'version' }
    if (a === '--once' || a === '--print') return { kind: 'once' }
  }
  return { kind: 'error', message: USAGE_ERROR }
}

function packageVersion(): string {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

function defaultIo(): CliIo {
  return {
    stdout: { write: (chunk) => void process.stdout.write(chunk) },
    stderr: { write: (chunk) => void process.stderr.write(chunk) },
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  }
}

async function defaultRenderTui(load: LoadDashboard): Promise<void> {
  const [{ render }, { createElement }, { App }] = await Promise.all([
    import('ink'),
    import('react'),
    import('./app.js'),
  ])
  const instance = render(createElement(App, { load }))
  await instance.waitUntilExit()
}

export function defaultDeps(): CliDeps {
  return {
    io: defaultIo(),
    loadDashboard: (force = false) => buildDashboard(force),
    renderTui: defaultRenderTui,
    readVersion: packageVersion,
  }
}

export async function runCli(
  argv: string[],
  deps: CliDeps = defaultDeps(),
): Promise<number> {
  const cmd = parseArgv(argv)
  if (cmd.kind === 'help') {
    deps.io.stdout.write(HELP_TEXT.endsWith('\n') ? HELP_TEXT : `${HELP_TEXT}\n`)
    return 0
  }
  if (cmd.kind === 'version') {
    deps.io.stdout.write(`${deps.readVersion()}\n`)
    return 0
  }
  if (cmd.kind === 'error') {
    deps.io.stderr.write(`${cmd.message}\n`)
    return 2
  }

  const printOnce = async (payload: DashboardPayload) => {
    deps.io.stdout.write(`${formatDeck(payload)}\n`)
  }

  if (cmd.kind === 'once' || !deps.io.stdoutIsTTY || !deps.io.stdinIsTTY) {
    try {
      const payload = await deps.loadDashboard(false)
      await printOnce(payload)
      return 0
    } catch (err) {
      deps.io.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`,
      )
      return 1
    }
  }

  try {
    await deps.renderTui(deps.loadDashboard)
    return 0
  } catch (err) {
    deps.io.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }
}

function isEntrypoint(): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    return fileURLToPath(import.meta.url) === resolve(argv1)
  } catch {
    return argv1.includes('tui/cli')
  }
}

if (isEntrypoint()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      process.exitCode = 1
    })
}
