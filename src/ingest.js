import { extractArchiveText } from './archive-text.js'
import { extractPdfText } from './pdf-text.js'
import { tokenize } from './ai.js'
import { htmlTitle, htmlToText } from './html-text.js'
import { cameraName, describeImageMeta, imageSize, readExif } from './media-meta.js'

const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','csv','tsv','json','jsonl','html','htm','xml','yaml','yml','log',
  'js','jsx','ts','tsx','css','scss','py','java','kt','swift','go','rs','c','h','cpp','hpp','sql','sh'
])

// Расширения медиа. Нужны потому, что File.type приходит пустым чаще, чем
// кажется: так ведут себя Android при выборе через SAF, часть облачных
// провайдеров файлов и перетаскивание из некоторых приложений. Пока вид
// определялся только по типу, фотография с телефона становилась
// «неизвестным двоичным форматом» — и, что хуже подписи, не попадала в
// распознавание: importFiles зовёт коннектор только для image/audio/video.
const IMAGE_EXTENSIONS = new Set([
  'png','jpg','jpeg','jfif','gif','bmp','webp','avif','tif','tiff','ico',
  'heic','heif','apng'
])
const AUDIO_EXTENSIONS = new Set([
  'mp3','m4a','aac','flac','ogg','oga','opus','wav','wave','wma','weba','amr','aiff','aif'
])
const VIDEO_EXTENSIONS = new Set([
  'mp4','m4v','mov','webm','mkv','avi','3gp','3g2','mpg','mpeg','wmv','flv'
])

export const MAX_LOCAL_TEXT_BYTES = 12 * 1024 * 1024
export const MAX_LOCAL_ARCHIVE_BYTES = 40 * 1024 * 1024
export const MAX_LOCAL_PDF_BYTES = 30 * 1024 * 1024

export function extensionOf(name = '') {
  const part = String(name).split('.').pop()?.toLowerCase()
  return part && part !== name.toLowerCase() ? part : ''
}

export function normalizeText(text = '') {
  // Табуляция сохраняется. Раньше она схлопывалась в пробел вместе с
  // неразрывными пробелами — одним правилом [\t\u00a0]+ → ' '. На таблице
  // из .xlsx это стирало границу столбцов («август 486000 перенос
  // медиа-узла» — где кончается сумма, видно только по смыслу), а в
  // исходном коде съедало отступы: .py, .js и прочие расширения из
  // TEXT_EXTENSIONS проходят через эту же функцию.
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0+/g, ' ')
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
export function htmlFileText(html = '', options = {}) {
  const body = htmlToText(html, options)
  const title = htmlTitle(html)
  if (!title) return body
  const first = body.split('\n', 1)[0].trim()
  return first === title ? body : `${title}\n\n${body}`.trim()
}

/**
 * Вид файла по имени и типу. Тип от браузера главнее: он учитывает и то,
 * чего в имени нет. Расширение — запасной путь, когда типа не дали.
 */
export function inferKind({ name = '', type = '' } = {}) {
  const ext = extensionOf(name)
  // SVG — разметка, а не растр: его текст читается на устройстве, и
  // отправлять его в распознавание изображений незачем. Проверяется до
  // image/, потому что тип у него как раз image/svg+xml.
  if (type === 'image/svg+xml' || ext === 'svg') return 'svg'
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
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return 'binary'
}

const ascii = (bytes, from, length) =>
  String.fromCharCode(...bytes.subarray(from, from + length))

/**
 * Вид по первым байтам — последний рубеж, когда ни типа, ни расширения нет.
 * Так приходят файлы из буфера обмена, из «Поделиться» некоторых приложений
 * и просто файлы без расширения.
 *
 * Читается только голова файла: срез Blob не поднимает в память всё.
 * Если имя и тип уже дали ответ, байты не читаются вовсе.
 */
export async function sniffKind(file) {
  const known = inferKind(file)
  if (known !== 'binary') return known
  if (!file || typeof file.slice !== 'function') return known

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (head.length < 4) return 'binary'

  const starts = (...codes) => codes.every((c, i) => head[i] === c)

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image'   // PNG
  if (starts(0xff, 0xd8, 0xff)) return 'image'                                  // JPEG
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return 'image'
  if (starts(0x42, 0x4d)) return 'image'                                        // BMP
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return 'image' // TIFF
  if (ascii(head, 0, 4) === '%PDF') return 'pdf'
  if (ascii(head, 0, 4) === 'OggS') return 'audio'
  if (ascii(head, 0, 4) === 'fLaC') return 'audio'
  if (ascii(head, 0, 3) === 'ID3') return 'audio'                               // MP3 с тегом
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'audio'              // MP3 без тега
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return 'video'                            // Matroska / WebM

  // RIFF: контейнер общий для WAV и WebP, вид решает метка на 8-м байте.
  if (ascii(head, 0, 4) === 'RIFF') {
    const form = ascii(head, 8, 4)
    if (form === 'WAVE') return 'audio'
    if (form === 'WEBP') return 'image'
    if (form === 'AVI ') return 'video'
  }

  // ISO BMFF: ftyp на 4-м байте. Бренд отличает звук от видео — у .m4a и
  // аудиокниг он M4A/M4B, у остального считаем видео.
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4)
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'audio'
    if (brand === 'avif' || brand === 'avis' || brand === 'heic' || brand === 'heix'
      || brand === 'mif1' || brand === 'msf1') return 'image'
    return 'video'
  }

  return 'binary'
}

export async function parseLocalFile(file) {
  if (!file) throw new Error('Файл не передан')
  // sniffKind читает байты только тогда, когда имя и тип ничего не дали.
  const kind = await sniffKind(file)
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

  if (file.size > MAX_LOCAL_TEXT_BYTES && ['text','html','svg'].includes(kind)) {
    return { ...base, status: 'too-large', text: '', error: `Текстовый файл больше ${Math.round(MAX_LOCAL_TEXT_BYTES / 1024 / 1024)} МБ — предела разбора на устройстве.` }
  }

  if (kind === 'text' || kind === 'html' || kind === 'svg') {
    const raw = await file.text()
    // SVG — это XML: <title>, <desc> и <text> несут настоящие подписи, а
    // <style> и <script> внутри него — нет. Тот же разбор, что у страницы
    // по ссылке, выбрасывает второе и оставляет первое.
    const text = kind === 'text' ? normalizeText(raw) : htmlFileText(raw, { svg: kind === 'svg' })
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

  // Снимок без сервиса распознавания оставался пустой записью: ни текста,
  // ни одного факта для поиска. Размер кадра, дата съёмки и камера лежат в
  // заголовке файла — это технические сведения, а не описание, и статус
  // остаётся needs-connector: текста на снимке по-прежнему никто не читал.
  if (kind === 'image') {
    const meta = await readImageMeta(file)
    const text = describeImageMeta(meta.size, meta.exif)
    return {
      ...base,
      status: 'needs-connector',
      text,
      wordCount: text ? tokenize(text).length : 0,
      charCount: text.length,
      meta: {
        ...(meta.size || {}),
        ...(meta.exif.dateTime ? { dateTime: meta.exif.dateTime } : {}),
        ...(meta.exif.orientation ? { orientation: meta.exif.orientation } : {}),
        ...(cameraName(meta.exif) ? { camera: cameraName(meta.exif) } : {}),
      },
      error: parserHint,
    }
  }

  return { ...base, status: 'needs-connector', text: '', wordCount: 0, charCount: 0, error: parserHint }
}

// Сколько головы файла читать ради заголовка. EXIF с миниатюрой и профилем
// ICC занимает сотни килобайт, и маркер SOF у JPEG идёт уже после них;
// гигабайтный скан при этом в память поднимать незачем.
const META_HEAD_BYTES = 2 * 1024 * 1024

async function readImageMeta(file) {
  try {
    const head = new Uint8Array(await file.slice(0, META_HEAD_BYTES).arrayBuffer())
    return { size: imageSize(head), exif: readExif(head) }
  } catch {
    return { size: null, exif: {} }
  }
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
