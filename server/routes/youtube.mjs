// POST /api/youtube — video metadata plus captions, when the video publishes
// them.
//
// This reads the public watch page. It does not bypass anything: if a video
// exposes no caption track, the honest answer is metadata with status 'saved'
// and no transcript. Inventing one, or running the audio through a model
// without saying so, would make an unsourced transcript look like the
// publisher's own.
//
// The caption URL comes out of the watch page, which is third-party content,
// so it is fetched through the same address guard as any pasted link.

import { captionEventsToSections, captionTracksFromHtml, youtubeVideoId } from '../../media-connectors.mjs'
import { decodeEntities } from '../html-text.mjs'
import { HttpError } from '../http.mjs'
import { safeFetch } from '../ssrf.mjs'

/** Pulls a `"key":"value"` string out of the watch page's embedded JSON. */
export function jsonStringField(html = '', key = '') {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(String(html))
  if (!match) return ''
  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return ''
  }
}

function metaContent(html = '', name = '') {
  const tag = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, 'i').exec(String(html))
  if (!tag) return ''
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag[0])
  return content ? decodeEntities(content[1]).trim() : ''
}

/** Everything the client shows about a video, read from the watch page. */
export function videoMetadataFromHtml(html = '', videoId = '') {
  return {
    title: jsonStringField(html, 'title') || metaContent(html, 'og:title') || metaContent(html, 'title') || '',
    channel: jsonStringField(html, 'ownerChannelName') || jsonStringField(html, 'author') || '',
    description: metaContent(html, 'og:description') || jsonStringField(html, 'shortDescription') || '',
    thumbnail: metaContent(html, 'og:image') || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
    lengthSeconds: Number(jsonStringField(html, 'lengthSeconds')) || 0
  }
}

/**
 * Picks the caption track to use. A human-written track in the viewer's
 * language beats an automatic one; an automatic track is still worth having,
 * but is flagged so the client can say so.
 */
export function pickCaptionTrack(tracks = [], preferred = ['ru', 'en']) {
  if (!tracks.length) return null
  const byLanguage = language => tracks.filter(track => String(track.languageCode || '').toLowerCase().startsWith(language))
  for (const language of preferred) {
    const candidates = byLanguage(language)
    const manual = candidates.find(track => !track.isAuto)
    if (manual) return manual
  }
  const anyManual = tracks.find(track => !track.isAuto)
  if (anyManual) return anyManual
  for (const language of preferred) {
    const auto = byLanguage(language)[0]
    if (auto) return auto
  }
  return tracks[0]
}

export async function handleYoutube({ body, config, fetchUrl = safeFetch }) {
  const raw = String(body?.url || '').trim()
  if (!raw) throw new HttpError(400, 'Укажите ссылку на видео YouTube')

  const videoId = youtubeVideoId(raw)
  if (!videoId) throw new HttpError(400, 'Это не похоже на ссылку YouTube')

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=ru`
  let page
  try {
    page = await fetchUrl(watchUrl, {
      maxBytes: config.limits.urlBytes,
      timeoutMs: config.limits.requestTimeoutMs,
      headers: {
        'User-Agent': 'NoteAI-Gateway/1.0 (+youtube captions)',
        'Accept-Language': 'ru,en;q=0.8'
      }
    })
  } catch (error) {
    throw new HttpError(502, `Не удалось открыть страницу видео: ${error.message}`)
  }
  if (page.status >= 400) throw new HttpError(502, `YouTube ответил ${page.status}`)

  const html = page.body.toString('utf8')
  const metadata = videoMetadataFromHtml(html, videoId)
  const track = pickCaptionTrack(captionTracksFromHtml(html))

  const base = {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    ...metadata,
    fetchedAt: new Date().toISOString()
  }

  if (!track) {
    // Not an error: plenty of videos simply have no captions. The client shows
    // the video and says the transcript was not found.
    return { ...base, status: 'saved', transcript: '', sections: [], captionLanguage: '', autoCaptions: false }
  }

  let sections = []
  try {
    // json3 gives timed events; the recovered parser expects exactly that.
    const trackUrl = `${track.baseUrl}${track.baseUrl.includes('?') ? '&' : '?'}fmt=json3`
    const captions = await fetchUrl(trackUrl, {
      maxBytes: config.limits.urlBytes,
      timeoutMs: config.limits.requestTimeoutMs,
      headers: { 'User-Agent': 'NoteAI-Gateway/1.0 (+youtube captions)' }
    })
    if (captions.status < 400) {
      sections = captionEventsToSections(JSON.parse(captions.body.toString('utf8')))
    }
  } catch {
    // A caption track that will not load leaves the video usable; saying the
    // transcript is missing is accurate, and pretending otherwise is not.
    sections = []
  }

  const transcript = sections.map(section => section.text).join('\n')
  return {
    ...base,
    status: sections.length ? 'ready' : 'saved',
    transcript,
    sections,
    captionLanguage: track.languageCode || '',
    autoCaptions: Boolean(track.isAuto)
  }
}
