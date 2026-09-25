// Drives the real gateway over a real socket: routing, error shape, and the
// /api/source-url contract the client depends on.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createGateway } from '../server.mjs'
import { loadConfig } from '../server/config.mjs'

async function withGateway(env, run) {
  const config = loadConfig({ NOTE2_STATIC_DIR: 'no-such-dir', ...env })
  const server = createGateway(config)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try { return await run(base, config) } finally { server.close() }
}

async function upstream(handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

test('GET /api/health reports ok as JSON', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/health`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /application\/json/)
    const data = await response.json()
    assert.equal(data.status, 'ok')
    assert.equal(data.service, 'noteai-gateway')
  })
})

test('an unknown /api/ path is a JSON 404, never the SPA shell', async () => {
  // This is the whole reason the API is matched before the static fallback.
  // Serving index.html here is what produced "Unexpected token '<'" in the app.
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/does-not-exist`)
    assert.equal(response.status, 404)
    assert.match(response.headers.get('content-type'), /application\/json/)
    const data = await response.json()
    assert.match(data.error, /Неизвестный маршрут/)
  })
})

test('a known path with the wrong method is a JSON 405', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/health`, { method: 'POST' })
    assert.equal(response.status, 405)
    assert.match((await response.json()).error, /не поддерживается/)
  })
})

test('a malformed JSON body is refused with a readable message', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/source-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /не является корректным JSON/)
  })
})

test('POST /api/source-url refuses a private address', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/source-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' })
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /внутренний или служебный/)
  })
})

test('POST /api/source-url refuses a file:// URL', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/source-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Поддерживаются только http и https/)
  })
})

test('POST /api/source-url requires a url', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/source-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Укажите ссылку/)
  })
})

// --- the ingestion contract, against a real page ----------------------------
//
// safeFetch is injected here. The address guard refuses loopback on purpose
// and must keep doing so, which is asserted above; what is left to prove is
// that a fetched page becomes the source record the client stores.

import { handleSourceUrl } from '../server/routes/source-url.mjs'
import { requestOnce } from '../server/ssrf.mjs'

const directFetch = async (raw, options) => {
  const response = await requestOnce(new URL(raw), options)
  return { url: raw, status: response.status, headers: response.headers, body: response.body }
}

test('/api/source-url turns a real HTML page into a stored source', async () => {
  const { server, origin } = await upstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><title>Тестовая страница</title>
      <style>.x{color:red}</style></head>
      <body><script>var tracking = "не должно попасть в текст";</script>
      <h1>Заголовок</h1><p>Первый абзац.</p><p>Второй абзац.</p></body></html>`)
  })
  try {
    const result = await handleSourceUrl({
      body: { url: `${origin}/page` },
      config: loadConfig({}),
      fetchUrl: directFetch
    })
    assert.equal(result.title, 'Тестовая страница')
    assert.equal(result.contentType, 'text/html')
    assert.equal(result.text, 'Заголовок\n\nПервый абзац.\n\nВторой абзац.')
    assert.ok(!result.text.includes('tracking'), 'script bodies must not become source text')
    assert.ok(result.bytes > 0)
    assert.match(result.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  } finally { server.close() }
})

test('/api/source-url decodes windows-1251 rather than mangling it', async () => {
  // The Russian web still serves cp1251. Reading it as utf8 produces mojibake
  // that is then indexed and searched, so the source is silently useless.
  const cp1251 = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]) // Привет
  const { server, origin } = await upstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' })
    res.end(Buffer.concat([Buffer.from('<html><body><p>'), cp1251, Buffer.from('</p></body></html>')]))
  })
  try {
    const result = await handleSourceUrl({
      body: { url: `${origin}/cp1251` },
      config: loadConfig({}),
      fetchUrl: directFetch
    })
    assert.equal(result.text, 'Привет')
  } finally { server.close() }
})

test('/api/source-url refuses a binary content type instead of storing noise', async () => {
  const { server, origin } = await upstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/pdf' })
    res.end(Buffer.from('%PDF-1.4 binary'))
  })
  try {
    await assert.rejects(
      handleSourceUrl({ body: { url: `${origin}/doc.pdf` }, config: loadConfig({}), fetchUrl: directFetch }),
      /По ссылке не текст, а application\/pdf/
    )
  } finally { server.close() }
})

test('/api/source-url reports an empty page rather than saving a blank source', async () => {
  const { server, origin } = await upstream((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body><script>render()</script></body></html>')
  })
  try {
    await assert.rejects(
      handleSourceUrl({ body: { url: `${origin}/spa` }, config: loadConfig({}), fetchUrl: directFetch }),
      /не нашлось текста/
    )
  } finally { server.close() }
})

test('/api/source-url surfaces an upstream error status', async () => {
  const { server, origin } = await upstream((_req, res) => { res.writeHead(404); res.end('nope') })
  try {
    await assert.rejects(
      handleSourceUrl({ body: { url: `${origin}/missing` }, config: loadConfig({}), fetchUrl: directFetch }),
      /Сайт ответил 404/
    )
  } finally { server.close() }
})

test('/api/health reports which capabilities are actually wired', async () => {
  // The client must be able to hide a button it cannot honour. An
  // unconfigured route reports false here rather than failing at use time.
  await withGateway({}, async base => {
    const { capabilities } = await (await fetch(`${base}/api/health`)).json()
    assert.equal(capabilities.sourceUrl, true, 'URL ingestion needs no configuration')
    assert.equal(capabilities.youtube, true, 'captions need no configuration')
    assert.equal(capabilities.ai, false, 'no model configured in this environment')
    assert.equal(capabilities.vision, false)
    assert.equal(capabilities.transcribe, false)
  })

  await withGateway({ NOTE2_AI_BASE_URL: 'https://api.example/v1', NOTE2_AI_MODEL: 'test-model' }, async base => {
    const { capabilities } = await (await fetch(`${base}/api/health`)).json()
    assert.equal(capabilities.ai, true, 'a base URL plus a model makes AI available')
    assert.equal(capabilities.embed, false, 'embeddings need their own model name')
  })
})

test('POST /api/youtube is routed and validates its input', async () => {
  await withGateway({}, async base => {
    const response = await fetch(`${base}/api/youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/not-youtube' })
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /не похоже на ссылку YouTube/)
  })
})
