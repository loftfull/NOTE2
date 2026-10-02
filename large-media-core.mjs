import { createHash } from 'node:crypto'

export const DEFAULT_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024
export const DEFAULT_SEGMENT_SECONDS = 600

export function sanitizeUploadName(value = 'upload') {
  return String(value || 'upload').replace(/[\r\n\\/]/g, '_').replace(/[^\p{L}\p{N}._ ()\-]+/gu, '_').slice(0, 180) || 'upload'
}

export function uploadIdFromResumeKey(resumeKey = '') {
  const key = String(resumeKey || '').trim()
  if (key.length < 12 || key.length > 200) throw new Error('Invalid resume key')
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

export function totalChunks(size, chunkSize = DEFAULT_UPLOAD_CHUNK_BYTES) {
  const bytes = Number(size || 0)
  const chunk = Number(chunkSize || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Invalid upload size')
  if (!Number.isFinite(chunk) || chunk < 256 * 1024 || chunk > 16 * 1024 * 1024) throw new Error('Invalid chunk size')
  return Math.ceil(bytes / chunk)
}

export function expectedChunkBytes(size, chunkSize, index) {
  const count = totalChunks(size, chunkSize)
  const i = Number(index)
  if (!Number.isInteger(i) || i < 0 || i >= count) throw new Error('Invalid chunk index')
  const start = i * chunkSize
  return Math.min(chunkSize, size - start)
}

export function uploadProgress(received = [], count = 0) {
  if (!count) return 0
  return Math.max(0, Math.min(1, new Set(received.map(Number).filter(Number.isInteger)).size / count))
}

export function mergeTranscriptionParts(parts = []) {
  const sections = []
  const texts = []
  const speakers = new Set()
  let duration = 0
  for (const part of parts) {
    const offset = Number(part.offsetSeconds || 0)
    const normalized = part.normalized || {}
    const partDuration = Number(part.duration || normalized.duration || 0)
    duration = Math.max(duration, offset + partDuration)
    if (normalized.text) texts.push(String(normalized.text).trim())
    for (const section of normalized.sections || []) {
      const locator = { ...(section.locator || {}) }
      if (Number.isFinite(Number(locator.startSeconds))) locator.startSeconds = Number(locator.startSeconds) + offset
      if (Number.isFinite(Number(locator.endSeconds))) locator.endSeconds = Number(locator.endSeconds) + offset
      if (locator.speaker) speakers.add(locator.speaker)
      sections.push({ ...section, locator, segmentIndex: part.index })
    }
  }
  sections.sort((a, b) => Number(a.locator?.startSeconds || 0) - Number(b.locator?.startSeconds || 0))
  return { text: texts.filter(Boolean).join('\n').trim(), sections, speakers: [...speakers], duration }
}

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
