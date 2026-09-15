// Regression tests for the fail-closed contract in src/ai.js.
//
// The defect these pin down: runAiTask used to wrap the whole request in a
// bare `catch` that returned localFallback(). Every failure mode — a 500, an
// HTML error page, malformed JSON, a dead network — produced heuristic text
// that was indistinguishable from a model answer, so a user whose gateway was
// misconfigured could not tell that no model had run.
//
// The rule now: if an endpoint IS configured and the call fails, the result
// must carry origin 'error' and NO text. Local extraction is only ever offered
// when no endpoint is configured at all, and is labelled as such.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ORIGIN, aiResultText, runAiTask } from '../src/ai.js'

const ENDPOINT = 'https://gateway.example/api/ai'
const INPUT = 'Первое предложение. Второе предложение. Третье предложение. Четвёртое.'

function stubFetch(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

function jsonResponse(body, { status = 200, type = 'application/json' } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type }
  })
}

test('with no endpoint configured, output is local and labelled as local', async () => {
  const result = await runAiTask({ action: 'summarize', input: INPUT })
  assert.equal(result.origin, AI_ORIGIN.local)
  assert.ok(result.text.length > 0, 'local extraction should still produce text')
  assert.match(aiResultText(result), /Локальный режим/)
})

test('a non-2xx gateway response never returns heuristic text', async () => {
  const restore = stubFetch(async () => jsonResponse({ error: 'model overloaded' }, { status: 503 }))
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '', 'a failed call must not fall back to local extraction')
    assert.match(result.error, /model overloaded/)
  } finally { restore() }
})

test('an HTML response never becomes user-facing content', async () => {
  // This is the misconfigured-native-build case: a relative /api/ai resolves
  // against the WebView origin and the app gets its own index.html back.
  const restore = stubFetch(async () => new Response('<!doctype html><html><body>app</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' }
  }))
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '')
    assert.doesNotMatch(result.error, /doctype/i, 'raw HTML must not leak into the error shown to the user')
    assert.match(result.error, /не JSON/)
  } finally { restore() }
})

test('malformed JSON is reported, not parsed into content', async () => {
  const restore = stubFetch(async () => jsonResponse('{"output": broken', { status: 200 }))
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '')
    assert.match(result.error, /JSON/)
  } finally { restore() }
})

test('a network failure is reported as an error, not as an answer', async () => {
  const restore = stubFetch(async () => { throw new Error('getaddrinfo ENOTFOUND') })
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '')
    assert.match(aiResultText(result), /AI недоступен/)
  } finally { restore() }
})

test('a 2xx response with no text field is an error, not empty success', async () => {
  const restore = stubFetch(async () => jsonResponse({ usage: { tokens: 12 } }))
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.match(result.error, /не вернул текст/)
  } finally { restore() }
})

test('a genuine model answer is returned verbatim and marked as model output', async () => {
  const restore = stubFetch(async () => jsonResponse({ output: 'Краткая выжимка от модели.', model: 'gpt-x' }))
  try {
    const result = await runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT })
    assert.equal(result.origin, AI_ORIGIN.model)
    assert.equal(result.text, 'Краткая выжимка от модели.')
    assert.equal(result.model, 'gpt-x')
    // Model output must reach the UI unchanged — no prefix, no annotation.
    assert.equal(aiResultText(result), 'Краткая выжимка от модели.')
  } finally { restore() }
})

test('the request carries the action and model to the gateway', async () => {
  let seen = null
  const restore = stubFetch(async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) }
    return jsonResponse({ output: 'ok' })
  })
  try {
    await runAiTask({ endpoint: ENDPOINT, model: 'm1', action: 'keywords', input: INPUT, system: 'sys' })
    assert.equal(seen.url, ENDPOINT)
    assert.equal(seen.body.action, 'keywords')
    assert.equal(seen.body.model, 'm1')
    assert.equal(seen.body.system, 'sys')
  } finally { restore() }
})

test('an external abort signal stops the request', async () => {
  const controller = new AbortController()
  const restore = stubFetch((url, init) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  }))
  try {
    const pending = runAiTask({ endpoint: ENDPOINT, action: 'summarize', input: INPUT, signal: controller.signal })
    controller.abort()
    const result = await pending
    assert.equal(result.origin, AI_ORIGIN.error)
    assert.equal(result.text, '')
  } finally { restore() }
})
