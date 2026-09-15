import { authenticatedFetch } from './api-session.js'
export const DIRECT_TRANSCRIBE_LIMIT = 24 * 1024 * 1024
const DEFAULT_MAX_UPLOAD = DIRECT_TRANSCRIBE_LIMIT
const DEFAULT_MAX_VISUAL = 18 * 1024 * 1024

async function errorMessage(response, fallback) {
  try {
    const data = await response.json()
    return data?.error || fallback
  } catch {
    return fallback
  }
}

async function postBinary(endpoint, file, maxBytes, extraHeaders = {}) {
  if (!endpoint) throw new Error('Connector endpoint is not configured')
  if (!file) throw new Error('No file selected')
  if (file.size > maxBytes) throw new Error(`File exceeds NoteAI connector limit (${Math.round(maxBytes / 1024 / 1024)} MB).`)
  const response = await authenticatedFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'upload'),
      ...extraHeaders
    },
    body: file
  })
  if (!response.ok) throw new Error(await errorMessage(response, `Connector returned ${response.status}`))
  return response.json()
}

export function transcribeMediaFile(file, endpoint = '/api/transcribe') {
  return postBinary(endpoint, file, DEFAULT_MAX_UPLOAD)
}

export function analyzeVisualFile(file, endpoint = '/api/vision') {
  return postBinary(endpoint, file, DEFAULT_MAX_VISUAL)
}

export async function ingestYoutube(url, endpoint = '/api/youtube') {
  const response = await authenticatedFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!response.ok) throw new Error(await errorMessage(response, `YouTube connector returned ${response.status}`))
  return response.json()
}

export function secondsLabel(value = 0) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function srtTime(value = 0) {
  const totalMs = Math.max(0, Math.round((Number(value) || 0) * 1000))
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function sectionsToSrt(sections = []) {
  return sections.filter(section => Number.isFinite(Number(section?.locator?.startSeconds))).map((section, index) => {
    const start = Number(section.locator.startSeconds || 0)
    const end = Number(section.locator.endSeconds ?? (start + 4))
    const speaker = section.locator.speaker ? `${section.locator.speaker}: ` : ''
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(Math.max(start + 0.2, end))}\n${speaker}${String(section.text || '').trim()}`
  }).join('\n\n')
}
