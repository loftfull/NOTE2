import { extractArchiveText } from './archive-text.js'
import { extractPdfText } from './pdf-text.js'
import { tokenize } from './ai.js'
import { htmlTitle, htmlToText } from './html-text.js'

const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','csv','tsv','json','jsonl','html','htm','xml','yaml','yml','log',
  'js','jsx','ts','tsx','css','scss','py','java','kt','swift','go','rs','c','h','cpp','hpp','sql','sh'
])

export const MAX_LOCAL_TEXT_BYTES = 12 * 1024 * 1024
export const MAX_LOCAL_ARCHIVE_BYTES = 40 * 1024 * 1024
export const MAX_LOCAL_PDF_BYTES = 30 * 1024 * 1024

export function extensionOf(name = '') {
  const part = String(name).split('.').pop()?.toLowerCase()
  return part && part !== name.toLowerCase() ? part : ''
}

export function normalizeText(text = '') {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

// Оставлено как имя, которым пользуется остальной код; реализация одна и
// общая с сервером — см. src/html-text.js.
export function stripHtml(html = '') {
  return htmlToText(html)
}

/**
 * Текст локального .html вместе с заголовком страницы первой строкой.
 *
 * <head> выбрасывается целиком, иначе <title> просачивается в текст и часто
 * дублирует первый <h1>. Заголовок полезен — но как осознанная первая строка,
 * и только если он не повторяет её же.
 */
export function htmlFileText(html = '') {
  const body = htmlToText(html)
  const title = htmlTitle(html)
  if (!title) return body
  const first = body.split('\n', 1)[0].trim()
  return first === title ? body : `${title}\n\n${body}`.trim()
}

export function inferKind({ name = '', type = '' } = {}) {
  const ext = extensionOf(name)
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'docx' || type.includes('wordprocessingml')) return 'docx'
  if (ext === 'pptx' || type.includes('presentationml')) return 'pptx'
  if (ext === 'xlsx' || type.includes('spreadsheetml')) return 'xlsx'
  if (['odt','odp','ods','epub'].includes(ext)) return ext
  if (type.includes('html') || ext === 'html' || ext === 'htm') return 'html'
  if (type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'binary'
}

export async function parseLocalFile(file) {
  if (!file) throw new Error('Файл не передан')
  const kind = inferKind(file)
  const base = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name || 'Источник без названия',
    type: file.type || 'application/octet-stream',
    size: Number(file.size || 0),
    kind,
    origin: 'file',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  if (file.size > MAX_LOCAL_TEXT_BYTES && ['text','html'].includes(kind)) {
    return { ...base, status: 'too-large', text: '', error: `Текстовый файл больше ${Math.round(MAX_LOCAL_TEXT_BYTES / 1024 / 1024)} МБ — предела разбора на устройстве.` }
  }

  if (kind === 'text' || kind === 'html') {
    const raw = await file.text()
    const text = kind === 'html' ? htmlFileText(raw) : normalizeText(raw)
    return { ...base, status: text ? 'ready' : 'empty', text, wordCount: tokenize(text).length, charCount: text.length }
  }


  if (kind === 'pdf') {
    if (file.size > MAX_LOCAL_PDF_BYTES) return { ...base, status: 'too-large', text: '', error: `PDF больше ${Math.round(MAX_LOCAL_PDF_BYTES / 1024 / 1024)} МБ — предела разбора на устройстве.` }
    try {
      const extracted = await extractPdfText(await file.arrayBuffer())
      const text = normalizeText(extracted.text)
      return { ...base, status: text ? 'ready' : 'needs-ocr', text, wordCount: tokenize(text).length, charCount: text.length, pageCount: extracted.pageCount, sectionCount: extracted.sections.length, sections: extracted.sections }
    } catch (error) {
      return { ...base, status: 'needs-connector', text: '', wordCount: 0, charCount: 0, error: `Не удалось извлечь текст из PDF на устройстве: ${error.message}` }
    }
  }

  if (['docx','pptx','xlsx','odt','odp','ods','epub'].includes(kind)) {
    if (file.size > MAX_LOCAL_ARCHIVE_BYTES) return { ...base, status: 'too-large', text: '', error: `Документ больше ${Math.round(MAX_LOCAL_ARCHIVE_BYTES / 1024 / 1024)} МБ — предела разбора на устройстве.` }
    try {
      const extracted = await extractArchiveText(await file.arrayBuffer(), kind)
      const text = normalizeText(extracted.text)
      return { ...base, status: text ? 'ready' : 'empty', text, wordCount: tokenize(text).length, charCount: text.length, sectionCount: extracted.sections.length, sections: extracted.sections, archiveEntries: extracted.entries }
    } catch (error) {
      return { ...base, status: 'needs-connector', text: '', wordCount: 0, charCount: 0, error: `Не удалось разобрать ${kind.toUpperCase()} на устройстве: ${error.message}` }
    }
  }

  const parserHint = ['image','audio','video'].includes(kind)
    ? 'Файл принят как источник, но расшифровка и распознавание идут через внешний сервис — укажите его в Профиле.'
    : 'Для этого двоичного формата нужен отдельный коннектор: на устройстве он не разбирается.'

  return { ...base, status: 'needs-connector', text: '', wordCount: 0, charCount: 0, error: parserHint }
}

export function chunkSections(sections = [], options = {}) {
  let index = 0
  const out = []
  for (const section of sections) {
    const parts = chunkText(section.text || '', options)
    for (const part of parts) out.push({ ...part, index: index++, sectionLabel: section.label || null, locator: section.locator || null })
  }
  return out
}

export function chunkText(text, { targetChars = 1200, overlapChars = 180, maxChars = 1800 } = {}) {
  const clean = normalizeText(text)
  if (!clean) return []
  const paragraphs = clean.split(/\n{2,}/).map(x => x.trim()).filter(Boolean)
  const chunks = []
  let buffer = ''
  let cursor = 0

  const push = () => {
    const value = buffer.trim()
    if (!value) return
    const start = Math.max(0, cursor - value.length)
    chunks.push({ index: chunks.length, text: value, start, end: start + value.length, wordCount: tokenize(value).length })
    const tail = value.slice(Math.max(0, value.length - overlapChars))
    buffer = tail
    cursor = start + value.length
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (buffer.trim()) push()
      let offset = 0
      while (offset < paragraph.length) {
        const end = Math.min(paragraph.length, offset + maxChars)
        const slice = paragraph.slice(offset, end).trim()
        if (slice) chunks.push({ index: chunks.length, text: slice, start: cursor + offset, end: cursor + end, wordCount: tokenize(slice).length })
        offset = Math.max(end - overlapChars, offset + 1)
      }
      cursor += paragraph.length + 2
      buffer = ''
      continue
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (next.length > targetChars && buffer.trim()) push()
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    cursor += paragraph.length + 2
  }
  if (buffer.trim()) push()

  return chunks.map((chunk, index) => ({ ...chunk, index }))
}
