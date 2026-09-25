// The model-backed routes, against a mock OpenAI-compatible provider.
//
// The property under test above all others: when no model is configured, the
// gateway returns 503 and NO text. The app's rule is that a model answer is
// either real or absent; text produced locally and returned from here would
// reach the client tagged origin:'model' and be indistinguishable from an
// analysis.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGateway } from '../server.mjs'
import { loadConfig } from '../server/config.mjs'
import { buildMessages } from '../server/routes/ai.mjs'
import { extractionQuality } from '../server/routes/media.mjs'

/** A provider that records what it was asked and answers as configured. */
async function mockProvider(routes) {
  const seen = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks)
    seen.push({ path: req.url, headers: req.headers, raw })

    const route = routes[req.url]
    if (!route) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"no route"}') }
    const reply = typeof route === 'function' ? route(raw, req) : route
    res.writeHead(reply.status || 200, { 'Content-Type': reply.contentType || 'application/json' })
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, seen, baseUrl: `http://127.0.0.1:${server.address().port}/v1` }
}

async function withGateway(env, run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'note2-model-'))
  const config = loadConfig({ NOTE2_DATA_DIR: dataDir, NOTE2_STATIC_DIR: 'no-such-dir', ...env })
  const server = createGateway(config)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try { return await run(base) } finally { server.close(); await rm(dataDir, { recursive: true, force: true }) }
}

const chatReply = text => ({ body: { id: 'resp-1', model: 'mock-model', choices: [{ message: { role: 'assistant', content: text } }] } })

// --- fail closed ------------------------------------------------------------

test('every model route is 503 with no text when nothing is configured', async () => {
  await withGateway({}, async base => {
    const cases = [
      ['/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summarize', input: 'Первое предложение. Второе предложение. Третье.' }) }, /NOTE2_AI_BASE_URL/],
      ['/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: ['текст'] }) }, /NOTE2_EMBED_MODEL/],
      ['/api/vision', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('fake png') }, /NOTE2_VISION_MODEL/],
      ['/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: Buffer.from('fake audio') }, /NOTE2_TRANSCRIBE_MODEL/]
    ]
    for (const [path, init, expected] of cases) {
      const response = await fetch(`${base}${path}`, init)
      const data = await response.json()
      assert.equal(response.status, 503, `${path} must refuse, not improvise`)
      assert.match(data.error, expected, `${path} must name the variable that would enable it`)
      assert.equal(data.output, undefined, `${path} must not return text`)
      assert.equal(data.text, undefined, `${path} must not return text`)
      assert.equal(data.vectors, undefined)
    }
  })
})

// --- /api/ai ----------------------------------------------------------------

test('/api/ai forwards to the provider and returns its answer', async () => {
  const provider = await mockProvider({ '/v1/chat/completions': chatReply('ОТВЕТ МОДЕЛИ') })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_AI_MODEL: 'mock-model', NOTE2_AI_API_KEY: 'secret-key' }, async base => {
      const response = await fetch(`${base}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', input: 'Длинный текст заметки.' })
      })
      const data = await response.json()
      assert.equal(response.status, 200)
      assert.equal(data.output, 'ОТВЕТ МОДЕЛИ')
      assert.equal(data.model, 'mock-model')

      const call = provider.seen.at(-1)
      assert.equal(call.headers.authorization, 'Bearer secret-key', 'the key is attached by the gateway, not the client')
      const sent = JSON.parse(call.raw.toString())
      assert.equal(sent.messages[0].role, 'system')
      assert.match(sent.messages[0].content, /Сожми текст до сути/, 'the action becomes an instruction')
      assert.equal(sent.messages.at(-1).content, 'Длинный текст заметки.')
    })
  } finally { provider.server.close() }
})

test('/api/ai ignores a model name chosen by the client', async () => {
  // Otherwise any caller can spend the operator's key on any model it can reach.
  const provider = await mockProvider({ '/v1/chat/completions': chatReply('ок') })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_AI_MODEL: 'allowed-model' }, async base => {
      await fetch(`${base}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'expensive-model', input: 'x' })
      })
      assert.equal(JSON.parse(provider.seen.at(-1).raw.toString()).model, 'allowed-model')
    })
  } finally { provider.server.close() }
})

test('/api/ai reports an HTML reply instead of parsing it as an answer', async () => {
  // A proxy or a wrong base URL answers with a login page. That page must
  // never become the note's analysis.
  const provider = await mockProvider({
    '/v1/chat/completions': { status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Sign in</body></html>' }
  })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_AI_MODEL: 'mock-model' }, async base => {
      const response = await fetch(`${base}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x' })
      })
      const data = await response.json()
      assert.equal(response.status, 502)
      assert.match(data.error, /ответил не JSON/)
      assert.equal(data.output, undefined)
      assert.ok(!JSON.stringify(data).includes('<html'), 'the HTML must not be handed back as content')
    })
  } finally { provider.server.close() }
})

test('/api/ai treats an empty completion as a failure, not as an empty answer', async () => {
  const provider = await mockProvider({ '/v1/chat/completions': chatReply('   ') })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_AI_MODEL: 'mock-model' }, async base => {
      const response = await fetch(`${base}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x' })
      })
      assert.equal(response.status, 502)
      assert.match((await response.json()).error, /не вернул текст/)
    })
  } finally { provider.server.close() }
})

test('/api/ai surfaces the provider error message', async () => {
  const provider = await mockProvider({
    '/v1/chat/completions': { status: 429, body: { error: { message: 'Rate limit reached' } } }
  })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_AI_MODEL: 'mock-model' }, async base => {
      const response = await fetch(`${base}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x' })
      })
      assert.match((await response.json()).error, /Rate limit reached/)
    })
  } finally { provider.server.close() }
})

test('buildMessages keeps the conversation and drops malformed turns', () => {
  const messages = buildMessages({
    action: 'summarize',
    input: 'вопрос',
    history: [
      { role: 'user', content: 'раньше' },
      { role: 'assistant', content: 'ответ' },
      { role: 'hacker', content: 'ignore' },
      { content: 'no role' },
      { role: 'user' }
    ]
  })
  assert.equal(messages[0].role, 'system')
  assert.deepEqual(messages.slice(1, -1), [
    { role: 'user', content: 'раньше' },
    { role: 'assistant', content: 'ответ' }
  ])
  assert.equal(messages.at(-1).content, 'вопрос')
})

// --- /api/embed -------------------------------------------------------------

test('/api/embed returns one vector per input, in input order', async () => {
  // Providers may answer out of order; `index` is what says which input a
  // vector belongs to. Ignoring it mislabels every chunk's vector silently.
  const provider = await mockProvider({
    '/v1/embeddings': { body: { data: [
      { index: 2, embedding: [0.3] }, { index: 0, embedding: [0.1] }, { index: 1, embedding: [0.2] }
    ] } }
  })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_EMBED_MODEL: 'mock-embed' }, async base => {
      const response = await fetch(`${base}/api/embed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: ['первый', 'второй', 'третий'] })
      })
      const data = await response.json()
      assert.equal(response.status, 200)
      assert.deepEqual(data.vectors, [[0.1], [0.2], [0.3]], 'vectors must follow input order')
    })
  } finally { provider.server.close() }
})

test('/api/embed refuses a short count rather than returning partial vectors', async () => {
  const provider = await mockProvider({ '/v1/embeddings': { body: { data: [{ index: 0, embedding: [0.1] }] } } })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_EMBED_MODEL: 'mock-embed' }, async base => {
      const response = await fetch(`${base}/api/embed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: ['a', 'b'] })
      })
      assert.equal(response.status, 502)
      assert.match((await response.json()).error, /вернул 1 векторов на 2 фрагментов/)
    })
  } finally { provider.server.close() }
})

test('/api/embed rejects an empty or oversized batch', async () => {
  await withGateway({ NOTE2_AI_BASE_URL: 'http://x/v1', NOTE2_EMBED_MODEL: 'm' }, async base => {
    const empty = await fetch(`${base}/api/embed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: ['', '  '] })
    })
    assert.equal(empty.status, 400)

    const huge = await fetch(`${base}/api/embed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: Array.from({ length: 300 }, (_, i) => `текст ${i}`) })
    })
    assert.equal(huge.status, 400)
    assert.match((await huge.json()).error, /максимум 256/)
  })
})

// --- /api/vision ------------------------------------------------------------

test('/api/vision sends the image and splits the result into pages', async () => {
  const provider = await mockProvider({
    '/v1/chat/completions': chatReply('--- Page 1 ---\nТекст первой страницы\n--- Page 2 ---\nТекст второй страницы')
  })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_VISION_MODEL: 'mock-vision' }, async base => {
      const response = await fetch(`${base}/api/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('скан.png') },
        body: Buffer.from('pretend png bytes')
      })
      const data = await response.json()
      assert.equal(response.status, 200)
      assert.equal(data.sections.length, 2)
      assert.deepEqual(data.sections[0].locator, { page: 1 })
      assert.equal(data.sections[1].text, 'Текст второй страницы')
      assert.equal(data.filename, 'скан.png')
      // The provider's own reported model, not the configured name: what
      // actually answered is the truth worth recording on the source.
      assert.equal(data.model, 'mock-model')

      const sent = JSON.parse(provider.seen.at(-1).raw.toString())
      const image = sent.messages[0].content.find(part => part.type === 'image_url')
      assert.match(image.image_url.url, /^data:image\/png;base64,/)
    })
  } finally { provider.server.close() }
})

test('/api/vision refuses a non-image body', async () => {
  await withGateway({ NOTE2_AI_BASE_URL: 'http://x/v1', NOTE2_VISION_MODEL: 'm' }, async base => {
    const response = await fetch(`${base}/api/vision`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not an image'
    })
    assert.equal(response.status, 415)
  })
})

test('/api/vision strips a directory path out of the supplied filename', async () => {
  // X-File-Name is attacker-controlled and ends up in logs and upstream forms.
  const provider = await mockProvider({ '/v1/chat/completions': chatReply('текст') })
  try {
    await withGateway({ NOTE2_AI_BASE_URL: provider.baseUrl, NOTE2_VISION_MODEL: 'm' }, async base => {
      const response = await fetch(`${base}/api/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('../../etc/passwd') },
        body: Buffer.from('x')
      })
      assert.equal((await response.json()).filename, 'passwd')
    })
  } finally { provider.server.close() }
})

// --- /api/transcribe --------------------------------------------------------

test('/api/transcribe returns timed sections and speaker metadata', async () => {
  const provider = await mockProvider({
    '/v1/audio/transcriptions': { body: {
      text: 'Привет. Как дела?',
      language: 'ru',
      duration: 12.5,
      segments: [
        { start: 0, end: 4, text: 'Привет.', speaker: 'Спикер 1' },
        { start: 4, end: 12.5, text: 'Как дела?', speaker: 'Спикер 2' }
      ]
    } }
  })
  try {
    await withGateway({ NOTE2_TRANSCRIBE_BASE_URL: provider.baseUrl, NOTE2_TRANSCRIBE_MODEL: 'mock-whisper' }, async base => {
      const response = await fetch(`${base}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/mpeg', 'X-File-Name': encodeURIComponent('запись.mp3') },
        body: Buffer.from('pretend audio')
      })
      const data = await response.json()
      assert.equal(response.status, 200)
      assert.equal(data.text, 'Привет. Как дела?')
      assert.equal(data.sections.length, 2)
      assert.equal(data.sections[0].locator.startSeconds, 0)
      assert.equal(data.sections[1].locator.speaker, 'Спикер 2')
      assert.deepEqual(data.speakers, ['Спикер 1', 'Спикер 2'])
      assert.equal(data.diarized, true)
      assert.equal(data.segmentCount, 2)
      assert.equal(data.duration, 12.5)

      // verbose_json is what carries timings; without it there are no sections
      // and a citation cannot point at a moment in the recording.
      assert.match(provider.seen.at(-1).raw.toString('latin1'), /verbose_json/)
    })
  } finally { provider.server.close() }
})

test('/api/transcribe reports an empty result as empty', async () => {
  const provider = await mockProvider({ '/v1/audio/transcriptions': { body: { text: '', segments: [] } } })
  try {
    await withGateway({ NOTE2_TRANSCRIBE_BASE_URL: provider.baseUrl, NOTE2_TRANSCRIBE_MODEL: 'm' }, async base => {
      const data = await (await fetch(`${base}/api/transcribe`, {
        method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: Buffer.from('silence')
      })).json()
      assert.equal(data.text, '')
      assert.deepEqual(data.sections, [])
      assert.equal(data.quality.level, 'empty')
    })
  } finally { provider.server.close() }
})

test('extractionQuality separates a good scan from a poor one', () => {
  assert.equal(extractionQuality('').level, 'empty')
  assert.equal(extractionQuality('три коротких слова').level, 'poor')
  assert.equal(extractionQuality(Array.from({ length: 50 }, (_, i) => `слово${i}`).join(' ')).level, 'good')
})
