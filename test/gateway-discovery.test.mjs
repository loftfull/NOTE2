import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPABILITY_ENDPOINTS, endpointsFromProbe, probeGateway } from '../src/gateway-discovery.js'

const jsonResponse = (body, { status = 200, type = 'application/json' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => (name.toLowerCase() === 'content-type' ? type : null) },
  json: async () => body
})

const HEALTHY = {
  status: 'ok',
  service: 'noteai-gateway',
  capabilities: { sourceUrl: true, youtube: true, ai: true, embed: false, vision: false, transcribe: false }
}

test('probeGateway recognises our gateway', async () => {
  const probe = await probeGateway(async () => jsonResponse(HEALTHY))
  assert.equal(probe.capabilities.ai, true)
  assert.equal(probe.capabilities.embed, false)
})

test('probeGateway returns null when nothing is there', async () => {
  assert.equal(await probeGateway(async () => { throw new Error('ECONNREFUSED') }), null)
  assert.equal(await probeGateway(async () => jsonResponse({}, { status: 404 })), null)
})

test('probeGateway rejects an SPA host answering index.html for every path', async () => {
  // The case that makes a naive probe wrong: a static host returns 200 with
  // the app shell for /api/health, which is not a gateway.
  const probe = await probeGateway(async () => jsonResponse('<!doctype html>', { type: 'text/html' }))
  assert.equal(probe, null)
})

test('probeGateway rejects JSON that is not our gateway', async () => {
  const probe = await probeGateway(async () => jsonResponse({ status: 'ok', service: 'something-else' }))
  assert.equal(probe, null, 'another API on the same origin is not our gateway')
})

test('endpointsFromProbe fills only the capabilities the gateway reports', async () => {
  const patch = endpointsFromProbe({}, { capabilities: HEALTHY.capabilities, origin: '' })
  assert.deepEqual(patch, { aiEndpoint: '/api/ai', youtubeEndpoint: '/api/youtube' })
  assert.equal(patch.embedEndpoint, undefined, 'an unwired capability must stay unset')
  assert.equal(patch.visionEndpoint, undefined)
})

test('endpointsFromProbe never overwrites a value the user set', async () => {
  const settings = { aiEndpoint: 'https://my-own-gateway.example/api/ai' }
  const patch = endpointsFromProbe(settings, { capabilities: { ai: true, youtube: true }, origin: '' })
  assert.equal(patch.aiEndpoint, undefined, "the user's own endpoint is theirs")
  assert.equal(patch.youtubeEndpoint, '/api/youtube', 'a blank one is still filled')
})

test('endpointsFromProbe prefixes an absolute origin', async () => {
  const patch = endpointsFromProbe({}, { capabilities: { ai: true }, origin: 'https://gw.example/' })
  assert.equal(patch.aiEndpoint, 'https://gw.example/api/ai')
})

test('endpointsFromProbe is empty when there is no gateway', async () => {
  // So a caller can skip the state update entirely, and nothing is configured
  // that would 404 on every import — the defect that emptied these defaults.
  assert.deepEqual(endpointsFromProbe({}, null), {})
})

test('every capability maps to a distinct setting and path', () => {
  const keys = Object.values(CAPABILITY_ENDPOINTS).map(([key]) => key)
  const paths = Object.values(CAPABILITY_ENDPOINTS).map(([, path]) => path)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(new Set(paths).size, paths.length)
  assert.ok(paths.every(path => path.startsWith('/api/')))
})

// --- размещение не в корне домена -------------------------------------------

/** Подменяет document.baseURI на время одной проверки. */
function withBase(baseURI, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document')
  const previous = globalThis.document
  globalThis.document = { baseURI }
  try { return run() } finally {
    if (had) globalThis.document = previous
    else delete globalThis.document
  }
}

test('зонд стучится в каталог приложения, а не в корень домена', async () => {
  // Опубликованное приложение лежит по пути вида /artifact/<id>/. Абсолютный
  // '/api/health' ушёл бы в корень чужого хоста — не к своему шлюзу, и запрос
  // полетел бы туда, куда не собирались.
  let asked = ''
  await withBase('https://example.com/artifact/abc123/', () =>
    probeGateway(async url => { asked = String(url); return jsonResponse(HEALTHY) })
  )
  assert.equal(asked, 'https://example.com/artifact/abc123/api/health')
})

test('в корне домена путь остаётся прежним', async () => {
  let asked = ''
  await withBase('https://example.com/', () =>
    probeGateway(async url => { asked = String(url); return jsonResponse(HEALTHY) })
  )
  assert.equal(asked, 'https://example.com/api/health')
})

test('эндпоинты получают тот же вид адреса, что и зонд', async () => {
  // Иначе шлюз нашли по одному адресу, а запросы пойдут по другому.
  const patch = withBase('https://example.com/artifact/abc123/', () =>
    endpointsFromProbe({}, { capabilities: { ai: true, youtube: true }, origin: '' })
  )
  assert.equal(patch.aiEndpoint, 'https://example.com/artifact/abc123/api/ai')
  assert.equal(patch.youtubeEndpoint, 'https://example.com/artifact/abc123/api/youtube')
})

test('явно указанный origin по-прежнему главнее', async () => {
  const patch = withBase('https://example.com/artifact/abc123/', () =>
    endpointsFromProbe({}, { capabilities: { ai: true }, origin: 'https://gw.example/' })
  )
  assert.equal(patch.aiEndpoint, 'https://gw.example/api/ai', 'чужой шлюз указан руками — его и используем')
})

test('без document работает как раньше', async () => {
  // Нативная сборка и любая среда без DOM: запасной путь — абсолютный.
  const patch = endpointsFromProbe({}, { capabilities: { ai: true }, origin: '' })
  assert.equal(patch.aiEndpoint, '/api/ai')
})
