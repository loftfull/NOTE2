export function youtubeVideoId(raw = '') {
  try {
    const url = new URL(String(raw))
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    let id = ''
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || ''
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
      else {
        const parts = url.pathname.split('/').filter(Boolean)
        if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || ''
      }
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : ''
  } catch { return '' }
}

export function extractJsonArrayAfter(text = '', marker = '"captionTracks":') {
  const markerIndex = String(text).indexOf(marker)
  if (markerIndex < 0) return null
  const start = String(text).indexOf('[', markerIndex + marker.length)
  if (start < 0) return null
  let depth = 0, quoted = false, escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') quoted = false
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function captionTracksFromHtml(html = '') {
  const raw = extractJsonArrayAfter(html, '"captionTracks":')
  if (!raw) return []
  try {
    return JSON.parse(raw).filter(track => track?.baseUrl).map(track => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode || '',
      name: track.name?.simpleText || track.name?.runs?.map(run => run.text).join('') || track.languageCode || 'Captions',
      kind: track.kind || '',
      isAuto: track.kind === 'asr'
    }))
  } catch { return [] }
}

function tidyCaption(text = '') {
  return String(text).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

export function captionEventsToSections(payload = {}) {
  const sections = []
  for (const event of payload?.events || []) {
    const text = tidyCaption((event?.segs || []).map(seg => seg?.utf8 || '').join(''))
    if (!text || text === '[Music]') continue
    const startSeconds = Number(event.tStartMs || 0) / 1000
    const durationSeconds = Number(event.dDurationMs || 0) / 1000
    sections.push({
      label: `Transcript · ${formatSeconds(startSeconds)}`,
      locator: { startSeconds, endSeconds: startSeconds + Math.max(0.2, durationSeconds) },
      text
    })
  }
  return sections
}

export function normalizeTranscription(payload = {}) {
  const rawSegments = Array.isArray(payload.segments) ? payload.segments : []
  const sections = rawSegments.map((segment, index) => {
    const startSeconds = Number(segment.start ?? segment.start_time ?? segment.start_ms / 1000 ?? 0) || 0
    const endSeconds = Number(segment.end ?? segment.end_time ?? segment.end_ms / 1000 ?? startSeconds) || startSeconds
    const speaker = segment.speaker || segment.speaker_id || null
    return {
      label: `${speaker ? `${speaker} · ` : ''}${formatSeconds(startSeconds)}`,
      locator: { startSeconds, endSeconds: Math.max(startSeconds, endSeconds), speaker },
      text: tidyCaption(segment.text || segment.transcript || '')
    }
  }).filter(section => section.text)
  const text = String(payload.text || sections.map(section => `${section.locator.speaker ? `${section.locator.speaker}: ` : ''}${section.text}`).join('\n')).trim()
  if (!sections.length && text) sections.push({ label: 'Transcript', locator: null, text })
  const speakers = [...new Set(sections.map(section => section.locator?.speaker).filter(Boolean))]
  const inferredDuration = sections.reduce((max, section) => Math.max(max, Number(section.locator?.endSeconds || 0)), 0)
  return { text, sections, speakers, language: payload.language || null, duration: Number(payload.duration || 0) || inferredDuration || null }
}

export function splitVisionPages(text = '') {
  const input = String(text).trim()
  if (!input) return []
  const regex = /^---\s*Page\s+(\d+)\s*---\s*$/gim
  const matches = [...input.matchAll(regex)]
  if (!matches.length) return [{ label: 'Vision / OCR', locator: null, text: input }]
  return matches.map((match, index) => {
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : input.length
    const page = Number(match[1])
    return { label: `Page ${page}`, locator: { page }, text: input.slice(start, end).trim() }
  }).filter(section => section.text)
}

export function formatSeconds(value = 0) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
