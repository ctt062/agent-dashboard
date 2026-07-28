import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readApiJson } from './api.ts'

describe('readApiJson', () => {
  it('parses JSON bodies', async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
    const json = await readApiJson<{ ok: boolean }>(res)
    assert.equal(json.ok, true)
  })

  it('rejects HTML responses', async () => {
    const res = new Response('<!doctype html><html></html>', {
      headers: { 'content-type': 'text/html' },
    })
    await assert.rejects(() => readApiJson(res), /HTML instead of JSON/)
  })
})
