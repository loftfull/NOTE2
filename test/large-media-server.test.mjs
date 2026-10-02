import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const APP_PORT = 19183
const MOCK_PORT = 19184
const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio:'ignore' }).status === 0

async function waitFor(url, predicate = r => r.ok, attempts = 100) {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (predicate(response)) return response } catch {}
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:['ignore','ignore','pipe'] })
    let error = ''
    child.stderr.on('data', d => error += d)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(error || `${command} failed`)))
    child.on('error', reject)
  })
}

test('large-media gateway assembles, time-segments with ffmpeg, and rebases transcript evidence', { skip: !ffmpeg }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'noteai-large-integration-'))
  const wav = join(root, 'long.wav')
  await run('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=900:duration=61','-ar','16000','-ac','1','-c:a','pcm_s16le',wav])
  const bytes = await readFile(wav)

  let calls = 0
  const mock = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/audio/transcriptions') {
      req.resume()
      req.on('end', () => {
        calls += 1
        res.writeHead(200, { 'content-type':'application/json' })
        res.end(JSON.stringify({
          task:'transcribe', duration:1, text:`segment ${calls}`,
          segments:[{ type:'transcript.text.segment', id:`seg_${calls}`, start:0.2, end:0.8, text:`segment ${calls}`, speaker:'A' }],
          usage:{ type:'duration', seconds:1 }
        }))
      })
      return
    }
    res.writeHead(404); res.end()
  })
  await new Promise(resolve => mock.listen(MOCK_PORT, '127.0.0.1', resolve))

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT:String(APP_PORT), OPENAI_API_KEY:'test', OPENAI_BASE_URL:`http://127.0.0.1:${MOCK_PORT}`, LARGE_MEDIA_ROOT:join(root,'uploads'), MEDIA_SEGMENT_SECONDS:'60' },
    stdio:['ignore','pipe','pipe']
  })
  t.after(async () => { child.kill('SIGTERM'); await new Promise(resolve => mock.close(resolve)); await rm(root,{recursive:true,force:true}) })
  await waitFor(`http://127.0.0.1:${APP_PORT}/api/health`)

  const initResponse = await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/init`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({resumeKey:'job-large-integration-12345',filename:'long.wav',size:bytes.length,mimeType:'audio/wav'}) })
  assert.equal(initResponse.status, 200)
  const session = await initResponse.json()
  assert.equal(session.totalChunks, 1)

  const chunkResponse = await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${session.uploadId}/chunks/0`, { method:'PUT', headers:{'content-type':'application/octet-stream','x-chunk-bytes':String(bytes.length)}, body:bytes })
  assert.equal(chunkResponse.status, 200)

  const start = await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${session.uploadId}/transcribe`, { method:'POST' })
  assert.equal(start.status, 202)

  let result
  for (let i = 0; i < 100; i += 1) {
    const status = await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${session.uploadId}`).then(r=>r.json())
    if (status.status === 'done') { result = status.result; break }
    if (status.status === 'failed') throw new Error(status.error)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(result)
  assert.equal(result.segmented, true)
  assert.equal(result.segmentCount, 2)
  assert.equal(calls, 2)
  assert.equal(result.sections.length, 2)
  assert.ok(result.sections[1].locator.startSeconds > 59)
  assert.ok(result.duration > 60)
})
