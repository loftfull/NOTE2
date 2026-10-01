// Серверная часть работы с HTML: всё, что зависит от Buffer и заголовков.
// Разбор разметки — в src/html-text.js, общий с клиентом.
// Реэкспорт не вносит имена в область модуля, поэтому то, что нужно здесь,
// импортируется отдельно.
import { htmlTitle, htmlToText } from '../src/html-text.js'
export { decodeEntities, htmlTitle, htmlToText } from '../src/html-text.js'

/** Plain-text and JSON bodies need framing, not tag stripping. */
export function bodyToText(buffer, contentType = '') {
  const type = String(contentType).split(';')[0].trim().toLowerCase()
  const raw = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
  if (type === 'text/html' || type === 'application/xhtml+xml' || (!type && /<html[\s>]/i.test(raw))) {
    return { text: htmlToText(raw), title: htmlTitle(raw) }
  }
  if (type === 'application/json' || type === 'text/json') {
    try {
      return { text: JSON.stringify(JSON.parse(raw), null, 2), title: '' }
    } catch {
      return { text: raw.trim(), title: '' }
    }
  }
  return { text: raw.replace(/\r\n?/g, '\n').trim(), title: '' }
}

/** Charset from the Content-Type header, or from a meta tag in the bytes. */
export function charsetFor(contentType = '', buffer = null) {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(String(contentType))
  if (fromHeader) return fromHeader[1].toLowerCase()
  if (buffer) {
    const head = Buffer.isBuffer(buffer) ? buffer.subarray(0, 4096).toString('latin1') : String(buffer).slice(0, 4096)
    const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)
    if (meta) return meta[1].toLowerCase()
  }
  return 'utf-8'
}
