// POST /api/source-url — fetch a pasted link and return readable text.
//
// Everything dangerous here is in ssrf.mjs; this route's job is to decide what
// counts as ingestible and to shape the answer the client stores as a source.

import { bodyToText, charsetFor, htmlTitle } from '../html-text.mjs'
import { HttpError } from '../http.mjs'
import { safeFetch } from '../ssrf.mjs'

// Types worth turning into text. A PDF or an image is ingested by the client
// (pdfjs) or by the vision route, not here, so they are refused explicitly
// rather than saved as a page of mojibake.
const TEXTUAL = /^(text\/|application\/(json|xml|xhtml\+xml|rss\+xml|atom\+xml|javascript|x-yaml|yaml))/i

function decodeBody(buffer, contentType) {
  const charset = charsetFor(contentType, buffer)
  // Node ships a full ICU decoder set; windows-1251 and koi8-r matter for the
  // Russian web and are exactly what a utf8-only read would mangle.
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

// `fetchUrl` is injectable so the ingestion contract can be tested against a
// real page without loosening the address guard: a test server is on loopback,
// which safeFetch refuses by design and must keep refusing.
export async function handleSourceUrl({ body, config, fetchUrl = safeFetch }) {
  const raw = String(body?.url || '').trim()
  if (!raw) throw new HttpError(400, 'Укажите ссылку')

  const response = await fetchUrl(raw, {
    maxBytes: config.limits.urlBytes,
    timeoutMs: config.limits.requestTimeoutMs,
    headers: {
      // Identifies the gateway honestly. Pretending to be a browser to bypass
      // a site's own rules is not this tool's business.
      'User-Agent': 'NoteAI-Gateway/1.0 (+source ingestion)',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'Accept-Language': 'ru,en;q=0.8'
    }
  })

  if (response.status >= 400) {
    throw new HttpError(502, `Сайт ответил ${response.status}`)
  }

  const contentType = String(response.headers['content-type'] || '')
  const bareType = contentType.split(';')[0].trim().toLowerCase()

  if (bareType && !TEXTUAL.test(bareType)) {
    throw new HttpError(415, `По ссылке не текст, а ${bareType}. Скачайте файл и добавьте его как источник.`)
  }

  const decoded = decodeBody(response.body, contentType)
  const { text, title } = bodyToText(Buffer.from(decoded, 'utf8'), contentType || 'text/html')

  if (!text.trim()) {
    throw new HttpError(422, 'По ссылке не нашлось текста. Возможно, страница рисуется скриптом.')
  }

  return {
    url: response.url,
    title: title || htmlTitle(decoded) || response.url,
    text,
    contentType: bareType || 'text/html',
    bytes: response.body.length,
    fetchedAt: new Date().toISOString()
  }
}
