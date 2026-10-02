import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 19181

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (response.ok) return response } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Server did not start')
}

test('server exposes health, resumable transport, and blocks private-network URL ingestion', async t => {
  const uploadRoot = await mkdtemp(join(tmpdir(), 'noteai-test-upload-'))
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), OPENAI_API_KEY: '', CORS_ORIGINS: 'https://localhost', LARGE_MEDIA_ROOT: uploadRoot, SYNC_ROOT: join(uploadRoot,'sync'), SYNC_TOKEN: 'sync-test-token-123456' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  t.after(async () => { child.kill('SIGTERM'); await rm(uploadRoot, { recursive:true, force:true }) })
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`)

  const health = await fetch(`http://127.0.0.1:${PORT}/api/health`).then(r => r.json())
  assert.equal(health.ok, true)
  assert.equal(health.aiConfigured, false)
  assert.equal(health.version, '3.6.0')
  assert.equal(health.resumableUploads, true)
  assert.equal(health.durableWorkerQueue, true)
  assert.equal(health.accountAuth, true)
  assert.equal(health.instagramArchive, true)
  assert.equal(health.instagramProvider, 'instaloader')
  assert.equal(typeof health.ffmpeg, 'boolean')

  const cors = await fetch(`http://127.0.0.1:${PORT}/api/health`, { headers: { origin: 'https://localhost' } })
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://localhost')
  const preflight = await fetch(`http://127.0.0.1:${PORT}/api/transcribe`, { method:'OPTIONS', headers:{ origin:'https://localhost', 'access-control-request-method':'POST' } })
  assert.equal(preflight.status, 204)

  const blockedResponse = await fetch(`http://127.0.0.1:${PORT}/api/source-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: `http://127.0.0.1:${PORT}/api/health` })
  })
  const blocked = await blockedResponse.json()
  assert.equal(blockedResponse.status, 400)
  assert.match(blocked.error, /Private-network/)

  const vision = await fetch(`http://127.0.0.1:${PORT}/api/vision`, { method:'POST', headers:{'content-type':'image/png','x-file-name':'scan.png'}, body:new Uint8Array([1,2,3]) })
  assert.equal(vision.status, 503)

  const transcription = await fetch(`http://127.0.0.1:${PORT}/api/transcribe`, { method:'POST', headers:{'content-type':'audio/webm','x-file-name':'clip.webm'}, body:new Uint8Array([1,2,3]) })
  assert.equal(transcription.status, 503)

  const init = await fetch(`http://127.0.0.1:${PORT}/api/uploads/init`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({resumeKey:'job-1234567890abcdef',filename:'large.webm',size:8,mimeType:'audio/webm'}) })
  assert.equal(init.status, 200)
  const session = await init.json()
  assert.equal(session.totalChunks, 1)
  const chunk = await fetch(`http://127.0.0.1:${PORT}/api/uploads/${session.uploadId}/chunks/0`, { method:'PUT', headers:{'content-type':'application/octet-stream','x-chunk-bytes':'8'}, body:new Uint8Array([1,2,3,4,5,6,7,8]) })
  assert.equal(chunk.status, 200)
  const status = await fetch(`http://127.0.0.1:${PORT}/api/uploads/${session.uploadId}`).then(r=>r.json())
  assert.equal(status.status, 'ready')
  assert.deepEqual(status.received, [0])
  const largeTranscribe = await fetch(`http://127.0.0.1:${PORT}/api/uploads/${session.uploadId}/transcribe`, { method:'POST' })
  assert.equal(largeTranscribe.status, 503)
  const removed = await fetch(`http://127.0.0.1:${PORT}/api/uploads/${session.uploadId}`, { method:'DELETE' })
  assert.equal(removed.status, 200)

  const unauthorizedSync = await fetch(`http://127.0.0.1:${PORT}/api/sync/default`)
  assert.equal(unauthorizedSync.status, 401)
  const syncSnapshot = { format:'noteai-sync-v1', createdAt:new Date().toISOString(), workspace:{notes:[],tasks:[],chats:[]}, settings:{theme:'dark'}, sources:[], chunks:[] }
  const pushed = await fetch(`http://127.0.0.1:${PORT}/api/sync/default`, { method:'PUT', headers:{'content-type':'application/json','authorization':'Bearer sync-test-token-123456'}, body:JSON.stringify({baseRevision:0,snapshot:syncSnapshot}) })
  assert.equal(pushed.status, 200)
  assert.equal((await pushed.json()).revision, 1)
  const pulled = await fetch(`http://127.0.0.1:${PORT}/api/sync/default`, { headers:{'authorization':'Bearer sync-test-token-123456'} })
  assert.equal(pulled.status, 200)
  const pulledData = await pulled.json()
  assert.equal(pulledData.revision, 1)
  assert.equal(pulledData.snapshot.settings.theme, 'dark')
  const conflict = await fetch(`http://127.0.0.1:${PORT}/api/sync/default`, { method:'PUT', headers:{'content-type':'application/json','authorization':'Bearer sync-test-token-123456'}, body:JSON.stringify({baseRevision:0,snapshot:syncSnapshot}) })
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).error, 'revision_conflict')

  const badYoutube = await fetch(`http://127.0.0.1:${PORT}/api/youtube`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({url:'https://example.com/video'}) })
  assert.equal(badYoutube.status, 400)
  const badInstagram = await fetch(`http://127.0.0.1:${PORT}/api/instagram`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({url:'https://example.com/post'}) })
  assert.equal(badInstagram.status, 400)
  assert.match((await badInstagram.json()).error,/instagram\.com/)
})
