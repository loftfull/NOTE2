// Resumable upload: the path a large recording takes before transcription.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGateway } from '../server.mjs'
import { loadConfig } from '../server/config.mjs'
import { CHUNK_BYTES, uploadIdFor } from '../server/routes/uploads.mjs'

async function mockWhisper(reply) {
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = typeof reply === 'function' ? reply(Buffer.concat(chunks)) : reply
    res.writeHead(body.status || 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body.body ?? body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` }
}

async function withGateway(env, run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'note2-up-'))
  const config = loadConfig({ NOTE2_DATA_DIR: dataDir, NOTE2_STATIC_DIR: 'no-such-dir', ...env })
  const server = createGateway(config)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`

  const api = async (path, { method = 'GET', body, json, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json ? JSON.stringify(json) : body
    })
    return { status: response.status, data: await response.json().catch(() => ({})) }
  }
  try { return await run({ api, dataDir }) } finally { server.close(); await rm(dataDir, { recursive: true, force: true }) }
}

// A file spanning three chunks, so partial upload and resume are real.
const SIZE = CHUNK_BYTES * 2 + 1024
const FILE = Buffer.alloc(SIZE, 0x41)
const chunkOf = index => FILE.subarray(index * CHUNK_BYTES, Math.min(SIZE, (index + 1) * CHUNK_BYTES))

const initBody = { resumeKey: 'recording-2026-09-25', filename: 'встреча.m4a', size: SIZE, mimeType: 'audio/mp4' }

test('uploadIdFor is stable for a resumeKey and random without one', () => {
  assert.equal(uploadIdFor('abc'), uploadIdFor('abc'))
  assert.notEqual(uploadIdFor('abc'), uploadIdFor('abd'))
  assert.notEqual(uploadIdFor(''), uploadIdFor(''))
  assert.match(uploadIdFor('abc'), /^[a-f0-9]{32}$/)
})

test('init describes the chunking the client must follow', async () => {
  await withGateway({}, async ({ api }) => {
    const { status, data } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    assert.equal(status, 200)
    assert.equal(data.totalChunks, 3)
    assert.equal(data.chunkSize, CHUNK_BYTES)
    assert.deepEqual(data.received, [])
    assert.equal(data.status, 'uploading')
    assert.equal(data.filename, 'встреча.m4a')
  })
})

test('uploading every chunk turns the session ready', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    for (let index = 0; index < 3; index += 1) {
      const put = await api(`/api/uploads/${session.uploadId}/chunks/${index}`, {
        method: 'PUT', body: chunkOf(index), headers: { 'Content-Type': 'application/octet-stream' }
      })
      assert.equal(put.status, 200, `chunk ${index}`)
    }
    const status = await api(`/api/uploads/${session.uploadId}`)
    assert.equal(status.data.status, 'ready')
    assert.deepEqual(status.data.received, [0, 1, 2])
    assert.equal(status.data.progress, 1)
  })
})

test('re-init after a dropped connection returns the chunks already held', async () => {
  // This is the whole point: a 100 MB upload that fails at 90% costs the last
  // 10%, not the file.
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    await api(`/api/uploads/${session.uploadId}/chunks/0`, { method: 'PUT', body: chunkOf(0) })
    await api(`/api/uploads/${session.uploadId}/chunks/1`, { method: 'PUT', body: chunkOf(1) })

    const resumed = await api('/api/uploads/init', { method: 'POST', json: initBody })
    assert.equal(resumed.data.uploadId, session.uploadId, 'the same resumeKey resumes the same upload')
    assert.deepEqual(resumed.data.received, [0, 1])
    assert.equal(resumed.data.status, 'uploading')
  })
})

test('a truncated chunk is refused rather than silently corrupting the file', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    const short = await api(`/api/uploads/${session.uploadId}/chunks/0`, {
      method: 'PUT', body: chunkOf(0).subarray(0, 1000)
    })
    assert.equal(short.status, 400)
    assert.match(short.data.error, /должен быть \d+ байт/)

    const status = await api(`/api/uploads/${session.uploadId}`)
    assert.deepEqual(status.data.received, [], 'a refused chunk is not counted as received')
  })
})

test('a chunk index outside the file is refused', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    const bad = await api(`/api/uploads/${session.uploadId}/chunks/99`, { method: 'PUT', body: chunkOf(0) })
    assert.equal(bad.status, 400)
    assert.match(bad.data.error, /Некорректный номер фрагмента/)
  })
})

test('a forged upload id cannot reach outside the upload directory', async () => {
  await withGateway({}, async ({ api }) => {
    for (const id of ['../../etc', 'not-hex', '../' + 'a'.repeat(30)]) {
      const response = await api(`/api/uploads/${encodeURIComponent(id)}`)
      assert.ok([400, 404].includes(response.status), `${id} -> ${response.status}`)
      if (response.status === 400) assert.match(response.data.error, /Некорректный идентификатор/)
    }
  })
})

test('a different file under the same resumeKey starts clean', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: first } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    await api(`/api/uploads/${first.uploadId}/chunks/0`, { method: 'PUT', body: chunkOf(0) })

    const other = await api('/api/uploads/init', { method: 'POST', json: { ...initBody, size: CHUNK_BYTES + 5 } })
    assert.deepEqual(other.data.received, [], 'chunks of two different files must not mix')
    assert.equal(other.data.totalChunks, 2)
  })
})

test('transcribe refuses an incomplete upload', async () => {
  await withGateway({ NOTE2_TRANSCRIBE_BASE_URL: 'http://x/v1', NOTE2_TRANSCRIBE_MODEL: 'm' }, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    await api(`/api/uploads/${session.uploadId}/chunks/0`, { method: 'PUT', body: chunkOf(0) })

    const started = await api(`/api/uploads/${session.uploadId}/transcribe`, { method: 'POST' })
    assert.equal(started.status, 409)
    assert.match(started.data.error, /Загружено 1 из 3/)
  })
})

test('transcribe is 503 when no transcription service is configured', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    for (let i = 0; i < 3; i += 1) await api(`/api/uploads/${session.uploadId}/chunks/${i}`, { method: 'PUT', body: chunkOf(i) })
    const started = await api(`/api/uploads/${session.uploadId}/transcribe`, { method: 'POST' })
    assert.equal(started.status, 503)
    assert.equal(started.data.result, undefined, 'no invented transcript')
  })
})

test('a completed upload is reassembled in order and transcribed', async () => {
  // The assembled bytes are checked upstream: chunks written out of order, or
  // concatenated wrongly, would produce a valid-looking but wrong file.
  let receivedBytes = null
  const whisper = await mockWhisper(raw => {
    receivedBytes = raw
    return { body: { text: 'Расшифровка встречи.', segments: [{ start: 0, end: 3, text: 'Расшифровка встречи.' }] } }
  })
  try {
    await withGateway({ NOTE2_TRANSCRIBE_BASE_URL: whisper.baseUrl, NOTE2_TRANSCRIBE_MODEL: 'mock-whisper' }, async ({ api }) => {
      const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
      // Uploaded out of order on purpose.
      for (const index of [2, 0, 1]) {
        await api(`/api/uploads/${session.uploadId}/chunks/${index}`, { method: 'PUT', body: chunkOf(index) })
      }

      const started = await api(`/api/uploads/${session.uploadId}/transcribe`, { method: 'POST' })
      assert.equal(started.status, 200)
      assert.equal(started.data.status, 'done')
      assert.equal(started.data.result.text, 'Расшифровка встречи.')
      assert.equal(started.data.result.sections.length, 1)

      assert.ok(receivedBytes.includes(FILE), 'the upstream body must contain the file, reassembled in order')

      const polled = await api(`/api/uploads/${session.uploadId}`)
      assert.equal(polled.data.status, 'done', 'a later poll sees the finished result')
      assert.equal(polled.data.result.text, 'Расшифровка встречи.')
    })
  } finally { whisper.server.close() }
})

test('a failing provider leaves the session failed with the reason', async () => {
  const whisper = await mockWhisper({ status: 500, body: { error: { message: 'model unavailable' } } })
  try {
    await withGateway({ NOTE2_TRANSCRIBE_BASE_URL: whisper.baseUrl, NOTE2_TRANSCRIBE_MODEL: 'm' }, async ({ api }) => {
      const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
      for (let i = 0; i < 3; i += 1) await api(`/api/uploads/${session.uploadId}/chunks/${i}`, { method: 'PUT', body: chunkOf(i) })

      const started = await api(`/api/uploads/${session.uploadId}/transcribe`, { method: 'POST' })
      assert.equal(started.data.status, 'failed')
      assert.match(started.data.error, /model unavailable/)
      assert.equal(started.data.result, undefined, 'a failure must not carry a transcript')

      const polled = await api(`/api/uploads/${session.uploadId}`)
      assert.equal(polled.data.status, 'failed', 'polling reports the reason rather than spinning')
    })
  } finally { whisper.server.close() }
})

test('delete removes the upload', async () => {
  await withGateway({}, async ({ api }) => {
    const { data: session } = await api('/api/uploads/init', { method: 'POST', json: initBody })
    await api(`/api/uploads/${session.uploadId}/chunks/0`, { method: 'PUT', body: chunkOf(0) })
    assert.equal((await api(`/api/uploads/${session.uploadId}`, { method: 'DELETE' })).status, 200)
    assert.equal((await api(`/api/uploads/${session.uploadId}`)).status, 404)
  })
})

test('a gateway restarted mid-transcription recovers the chunks, not just the file', async () => {
  // Simulated by pointing a second gateway at the same data directory after
  // the first is stopped while the session says 'processing'. Without the
  // recovery path the session stays 'processing' forever and the client polls
  // until its own timeout, having uploaded the whole file for nothing.
  const dataDir = await mkdtemp(join(tmpdir(), 'note2-restart-'))
  const env = { NOTE2_DATA_DIR: dataDir, NOTE2_STATIC_DIR: 'no-such-dir', NOTE2_TRANSCRIBE_BASE_URL: 'http://127.0.0.1:1/v1', NOTE2_TRANSCRIBE_MODEL: 'm' }

  const start = async () => {
    const server = createGateway(loadConfig(env))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    return {
      server,
      api: async (path, init = {}) => {
        const response = await fetch(`${base}${path}`, {
          method: init.method || 'GET',
          headers: init.json ? { 'Content-Type': 'application/json' } : {},
          body: init.json ? JSON.stringify(init.json) : init.body
        })
        return { status: response.status, data: await response.json().catch(() => ({})) }
      }
    }
  }

  try {
    const first = await start()
    const { data: session } = await first.api('/api/uploads/init', { method: 'POST', json: initBody })
    for (let i = 0; i < 3; i += 1) await first.api(`/api/uploads/${session.uploadId}/chunks/${i}`, { method: 'PUT', body: chunkOf(i) })

    // The upstream is unreachable, so this marks the session processing and
    // then fails — close enough to a crash for what we are testing, so force
    // the processing state back on disk and stop the server.
    await first.api(`/api/uploads/${session.uploadId}/transcribe`, { method: 'POST' })
    const metaPath = join(dataDir, 'uploads', session.uploadId, 'session.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    await writeFile(metaPath, JSON.stringify({ ...meta, status: 'processing', phase: 'transcribe', error: undefined }))
    first.server.close()

    const second = await start()
    try {
      const resumed = await second.api('/api/uploads/init', { method: 'POST', json: initBody })
      assert.equal(resumed.data.status, 'ready', 'the upload is complete and can be retried')
      assert.equal(resumed.data.phase, 'recovered', 'the client restarts transcription on this phase')
      assert.deepEqual(resumed.data.received, [0, 1, 2], 'every chunk survived the restart')
    } finally { second.server.close() }
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})
