import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGENT_IDS,
  defaultVisibleHarnesses,
  filterAgentsByHarness,
  isAgentId,
  toggleHarness,
} from '../../src/lib/harness.ts'
import type { AgentShare } from '../../src/lib/types.ts'

describe('harness selection', () => {
  it('lists all supported harnesses including Claude and Gemini', () => {
    assert.deepEqual(AGENT_IDS, [
      'cursor',
      'grok',
      'claude',
      'gemini',
      'codex',
    ])
  })

  it('defaults to Cursor, Grok, Codex (Claude/Gemini opt-in)', () => {
    assert.deepEqual(defaultVisibleHarnesses(), [
      'cursor',
      'grok',
      'codex',
    ])
  })

  it('validates agent ids', () => {
    assert.equal(isAgentId('grok'), true)
    assert.equal(isAgentId('claude'), true)
    assert.equal(isAgentId('gemini'), true)
    assert.equal(isAgentId('windsurf'), false)
  })

  it('toggles harnesses but keeps at least one', () => {
    assert.deepEqual(toggleHarness(['cursor', 'grok'], 'claude'), [
      'cursor',
      'grok',
      'claude',
    ])
    assert.deepEqual(toggleHarness(['cursor', 'grok'], 'grok'), ['cursor'])
    assert.deepEqual(toggleHarness(['cursor'], 'cursor'), ['cursor'])
  })

  it('filters agents by visible harness set in harness order', () => {
    const agents = [
      { id: 'codex' },
      { id: 'cursor' },
      { id: 'claude' },
      { id: 'gemini' },
      { id: 'grok' },
    ] as AgentShare[]
    assert.deepEqual(
      filterAgentsByHarness(agents, ['gemini', 'claude']).map((a) => a.id),
      ['claude', 'gemini'],
    )
  })
})
