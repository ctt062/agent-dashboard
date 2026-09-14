import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localBin = join(root, 'node_modules/.bin/agent-deck')
const wrapper = join(root, 'bin/agent-deck.js')

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
  })
}

const blockedRegistryEnv: NodeJS.ProcessEnv = {
  ...process.env,
  npm_config_registry: 'http://127.0.0.1:9',
  npm_config_offline: 'true',
  npm_config_fetch_retries: '0',
}

describe('documented launch command', () => {
  it('links the local agent-deck bin so npx does not hit the registry', () => {
    assert.equal(
      existsSync(localBin),
      true,
      'npm install must create node_modules/.bin/agent-deck; without it npx looks up unpublished agent-deck on the registry and 404s',
    )
    const st = lstatSync(localBin)
    assert.equal(st.isSymbolicLink() || st.isFile(), true)
    assert.equal(realpathSync(localBin), realpathSync(wrapper))
  })

  it('runs the local bin --help without contacting the registry', async () => {
    const result = await run(localBin, ['--help'], blockedRegistryEnv)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /agent-deck --once/)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /E404|registry\.npmjs\.org/)
  })

  it('npx agent-deck --help uses the local bin with the registry blocked', async () => {
    const result = await run(
      'npx',
      ['--offline', '--no-install', 'agent-deck', '--help'],
      blockedRegistryEnv,
    )
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /agent-deck --once/)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /E404|registry\.npmjs\.org/)
  })
})
