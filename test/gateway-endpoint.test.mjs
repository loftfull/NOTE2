// Regression tests for resolveGatewayEndpoint in src/gateway-url.js.
//
// The defect these pin down: every endpoint in defaultSettings is relative
// ('/api/ai', '/api/vision', ...). That is correct on the web, where the
// gateway is same-origin. Inside a Capacitor WebView the origin is the app
// itself (https://localhost), so the same value resolves to the bundled
// index.html — the client asks for JSON and is handed its own HTML shell.
// Combined with the old silent fallback, the user saw a plausible "AI answer"
// produced entirely offline.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRelativeEndpoint, resolveGatewayEndpoint } from '../src/gateway-url.js'
import { AI_ORIGIN, runAiTask } from '../src/ai.js'

const WEB = { native: false, baseHref: 'https://notes.example/app/' }
const NATIVE = { native: true, baseHref: 'https://localhost/' }

test('classifies relative and absolute endpoints', () => {
  assert.equal(isRelativeEndpoint('/api/ai'), true)
  assert.equal(isRelativeEndpoint('api/ai'), true)
  assert.equal(isRelativeEndpoint(''), true)
  assert.equal(isRelativeEndpoint('https://gateway.example/api/ai'), false)
})

test('on the web a relative endpoint resolves against the page origin', () => {
  const { url, error } = resolveGatewayEndpoint('/api/ai', WEB)
  assert.equal(error, null)
  assert.equal(url, 'https://notes.example/api/ai')
})

test('on native a relative endpoint is refused, not silently pointed at the app', () => {
  const { url, error } = resolveGatewayEndpoint('/api/ai', NATIVE)
  assert.equal(url, null)
  assert.match(error, /HTTPS-адрес шлюза/)
  // The whole point: it must not hand back a localhost URL that would fetch
  // the app's own index.html.
  assert.doesNotMatch(String(error), /localhost/)
})

test('on native an absolute https endpoint is accepted', () => {
  const { url, error } = resolveGatewayEndpoint('https://gateway.example/api/ai', NATIVE)
  assert.equal(error, null)
  assert.equal(url, 'https://gateway.example/api/ai')
})

test('on native a plaintext http endpoint is refused', () => {
  const { url, error } = resolveGatewayEndpoint('http://gateway.example/api/ai', NATIVE)
  assert.equal(url, null)
  assert.match(error, /HTTPS/)
})

test('an unconfigured endpoint is not an error, just unset', () => {
  const { url, error } = resolveGatewayEndpoint('', NATIVE)
  assert.equal(url, null)
  assert.equal(error, null)
})

test('runAiTask on native refuses a relative endpoint without touching the network', async () => {
  const originalFetch = globalThis.fetch
  const originalCapacitor = globalThis.Capacitor
  let called = false
  globalThis.fetch = async () => { called = true; return new Response('{}') }
  globalThis.Capacitor = { isNativePlatform: () => true }
  try {
    const result = await runAiTask({ endpoint: '/api/ai', action: 'summarize', input: 'Текст. Ещё текст.' })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '', 'must not fall back to local extraction')
    assert.equal(called, false, 'the request must be refused before it is sent')
  } finally {
    globalThis.fetch = originalFetch
    if (originalCapacitor === undefined) delete globalThis.Capacitor
    else globalThis.Capacitor = originalCapacitor
  }
})
