import { authenticatedFetch } from './api-session.js'
const DEFAULT_CHUNK_BYTES = 6 * 1024 * 1024
const POLL_MS = 1200

export function resumableUploadBase(transcribeEndpoint = '/api/transcribe') {
  const raw = String(transcribeEndpoint || '/api/transcribe').trim()
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    url.pathname = url.pathname.replace(/\/api\/transcribe\/?$/, '/api/uploads')
    if (!url.pathname.endsWith('/api/uploads')) url.pathname = '/api/uploads'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  }
  return '/api/uploads'
}

async function jsonOrError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || fallback || `Request failed (${response.status})`)
  return data
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

export async function initResumableUpload(file, resumeKey, transcribeEndpoint = '/api/transcribe') {
  const base = resumableUploadBase(transcribeEndpoint)
  const response = await authenticatedFetch(`${base}/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeKey, filename: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' })
  })
  return jsonOrError(response, 'Unable to initialize resumable upload')
}

export async function uploadFileInChunks(file, session, transcribeEndpoint = '/api/transcribe', onProgress) {
  const base = resumableUploadBase(transcribeEndpoint)
  const chunkSize = Number(session.chunkSize || DEFAULT_CHUNK_BYTES)
  const received = new Set((session.received || []).map(Number))
  const count = Number(session.totalChunks || Math.ceil(file.size / chunkSize))
  for (let index = 0; index < count; index += 1) {
    if (received.has(index)) { onProgress?.({ phase: 'upload', progress: (index + 1) / count, index, skipped: true }); continue }
    const start = index * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const chunk = file.slice(start, end)
    const response = await authenticatedFetch(`${base}/${encodeURIComponent(session.uploadId)}/chunks/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-Bytes': String(chunk.size) },
      body: chunk
    })
    await jsonOrError(response, `Unable to upload chunk ${index + 1}`)
    received.add(index)
    onProgress?.({ phase: 'upload', progress: received.size / count, index, skipped: false })
  }
  return { ...session, received: [...received].sort((a, b) => a - b) }
}

export async function startResumableTranscription(session, transcribeEndpoint = '/api/transcribe') {
  const base = resumableUploadBase(transcribeEndpoint)
  const response = await authenticatedFetch(`${base}/${encodeURIComponent(session.uploadId)}/transcribe`, { method: 'POST' })
  return jsonOrError(response, 'Unable to start large-media transcription')
}

export async function pollResumableTranscription(session, transcribeEndpoint = '/api/transcribe', onProgress, options = {}) {
  const base = resumableUploadBase(transcribeEndpoint)
  const timeoutMs = Number(options.timeoutMs || 45 * 60 * 1000)
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const response = await authenticatedFetch(`${base}/${encodeURIComponent(session.uploadId)}`)
    const data = await jsonOrError(response, 'Unable to read upload status')
    onProgress?.({ phase: data.phase || data.status || 'processing', progress: Number(data.progress || 0), session: data })
    if (data.status === 'done') return data.result
    if (data.status === 'failed') throw new Error(data.error || 'Large-media transcription failed')
    if (data.status === 'cancelled') throw new Error(data.error || 'Large-media transcription was cancelled')
    if (data.status === 'ready' && data.phase === 'recovered') {
      const restarted = await startResumableTranscription({ ...session, uploadId: data.uploadId }, transcribeEndpoint)
      if (restarted.status === 'done') return restarted.result
    }
    await sleep(POLL_MS)
  }
  throw new Error('Large-media transcription is still running. Resume the job later; uploaded chunks are preserved on the gateway.')
}

export async function deleteResumableUpload(session, transcribeEndpoint = '/api/transcribe') {
  if (!session?.uploadId) return
  const base = resumableUploadBase(transcribeEndpoint)
  await authenticatedFetch(`${base}/${encodeURIComponent(session.uploadId)}`, { method: 'DELETE' }).catch(() => null)
}

export async function transcribeMediaResumable(file, resumeKey, transcribeEndpoint = '/api/transcribe', onProgress) {
  let session = await initResumableUpload(file, resumeKey, transcribeEndpoint)
  onProgress?.({ phase: session.phase || 'upload', progress: Number(session.progress || 0), session })
  let result
  if (session.status === 'done' || session.status === 'processing' || session.status === 'queued') {
    result = await pollResumableTranscription(session, transcribeEndpoint, onProgress)
  } else {
    if (session.status !== 'ready') session = await uploadFileInChunks(file, session, transcribeEndpoint, onProgress)
    const started = await startResumableTranscription(session, transcribeEndpoint)
    result = started.status === 'done' ? started.result : await pollResumableTranscription(session, transcribeEndpoint, onProgress)
  }
  await deleteResumableUpload(session, transcribeEndpoint)
  return result
}
