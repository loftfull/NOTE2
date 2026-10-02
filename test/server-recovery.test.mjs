import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 19182
const UPLOAD_ID = '0123456789abcdef0123456789abcdef'

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (response.ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error('Server did not start')
}

test('gateway restart recovers a complete processing upload without re-uploading chunks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'noteai-recovery-'))
  const sessionDir = join(root, UPLOAD_ID)
  await mkdir(sessionDir, { recursive:true })
  const now = new Date().toISOString()
  await writeFile(join(sessionDir, 'chunk-000000.part'), new Uint8Array([1,2,3,4,5,6,7,8]))
  await writeFile(join(sessionDir, 'meta.json'), JSON.stringify({
    uploadId:UPLOAD_ID, filename:'resume.webm', size:8, mimeType:'audio/webm',
    chunkSize:8, totalChunks:1, status:'processing', phase:'transcribing 1/1', progress:0.8,
    createdAt:now, updatedAt:now, error:null
  }))

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env:{ ...process.env, PORT:String(PORT), OPENAI_API_KEY:'', LARGE_MEDIA_ROOT:root },
    stdio:['ignore','pipe','pipe']
  })
  t.after(async()=>{ child.kill('SIGTERM'); await new Promise(r=>setTimeout(r,50)); await rm(root,{recursive:true,force:true}) })
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`)
  const statusResponse = await fetch(`http://127.0.0.1:${PORT}/api/uploads/${UPLOAD_ID}`)
  assert.equal(statusResponse.status,200)
  const status=await statusResponse.json()
  assert.equal(status.status,'queued')
  assert.equal(status.phase,'recovered-queued')
  assert.deepEqual(status.received,[0])
  assert.match(status.error,/preserved/)
})
