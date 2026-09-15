// Evidence assembly and analysis prompts for saved Instagram sources.
// Reconstructed from its call sites in App.jsx, instagram-knowledge.js and
// structured-knowledge.js after the original was lost with the v4.10 upload.
//
// The evidence labels below ([CAPTION], [MEDIA n OCR], [MEDIA n TRANSCRIPT])
// are not decoration: instagram-knowledge.js documents them as the anchors the
// model must cite, and structured-knowledge.js resolves extracted fields back
// to them. Changing the label format breaks provenance for every stored post,
// so it stays stable.

import { tokenize } from './ai.js'

const MODES = {
  brief: {
    action: 'instagram-brief',
    system: 'Сделай краткую выжимку ТОЛЬКО по предоставленному материалу сохранённого Instagram-поста. Не добавляй ничего, чего нет в тексте. Ссылайся на метки [CAPTION], [MEDIA N OCR], [MEDIA N TRANSCRIPT]. Если данных мало — прямо скажи, чего не хватает, и не домысливай.'
  },
  detailed: {
    action: 'instagram-detailed',
    system: 'Разбери сохранённый Instagram-пост подробно, опираясь ТОЛЬКО на предоставленный материал. Выдели сущности, шаги, числа и условия. Каждое утверждение сопровождай меткой [CAPTION], [MEDIA N OCR] или [MEDIA N TRANSCRIPT]. Не восстанавливай пропущенное по догадке — отметь пробелы явно.'
  },
  organize: {
    action: 'instagram-organize',
    system: 'Систематизируй сохранённый Instagram-пост, используя ТОЛЬКО предоставленный материал. Предложи заголовок, теги и структуру заметки. Сохраняй метки [CAPTION], [MEDIA N OCR], [MEDIA N TRANSCRIPT] у фактов. Ничего не добавляй сверх источника.'
  }
}

export function instagramAnalysisAction(mode = 'brief') {
  return (MODES[mode] || MODES.brief).action
}

export function instagramAnalysisSystem(mode = 'brief') {
  return (MODES[mode] || MODES.brief).system
}

function mediaLabel(item, position) {
  return Number.isFinite(Number(item?.index)) ? Number(item.index) + 1 : position + 1
}

// The single flat document handed to the model. Built from caption plus every
// piece of extracted media text, each under the label it will be cited by.
export function instagramEvidenceDocument(source = {}) {
  const post = source?.instagram || {}
  const parts = []
  const caption = String(post.caption || '').trim()
  if (caption) parts.push(`[CAPTION]\n${caption}`)

  const media = Array.isArray(post.media) ? post.media : []
  media.forEach((item, position) => {
    const n = mediaLabel(item, position)
    const ocr = String(item?.ocrText || '').trim()
    const transcript = String(item?.transcriptText || '').trim()
    const alt = String(item?.alt || '').trim()
    if (ocr) parts.push(`[MEDIA ${n} OCR]\n${ocr}`)
    if (transcript) parts.push(`[MEDIA ${n} TRANSCRIPT]\n${transcript}`)
    // Alt text is weaker evidence, so it is labelled distinctly rather than
    // being folded into OCR where it could be mistaken for extracted text.
    if (!ocr && !transcript && alt) parts.push(`[MEDIA ${n} ALT]\n${alt}`)
  })

  return parts.join('\n\n')
}

// Sections for the retrieval index. Unlike the flat document above, each entry
// keeps a locator so evidence can cite one carousel item, not the whole post.
export function instagramSearchSections(source = {}) {
  const post = source?.instagram || {}
  const sections = []
  const caption = String(post.caption || '').trim()
  if (caption) {
    sections.push({ label: 'Подпись', locator: { kind: 'caption' }, text: caption })
  }

  const media = Array.isArray(post.media) ? post.media : []
  media.forEach((item, position) => {
    const n = mediaLabel(item, position)
    const index = Number.isFinite(Number(item?.index)) ? Number(item.index) : position
    const ocr = String(item?.ocrText || '').trim()
    const transcript = String(item?.transcriptText || '').trim()
    if (ocr) sections.push({ label: `Медиа ${n} · текст на изображении`, locator: { kind: 'ocr', mediaIndex: index }, text: ocr })
    if (transcript) sections.push({ label: `Медиа ${n} · расшифровка`, locator: { kind: 'transcript', mediaIndex: index }, text: transcript })
  })

  return sections
}

export function instagramTokens(source = {}) {
  return tokenize(instagramEvidenceDocument(source))
}

// Nearest saved posts by shared vocabulary. Used to surface siblings in the
// viewer; deliberately excludes the source itself and non-Instagram sources.
export function relatedInstagramSources(source, sources = [], limit = 3) {
  if (!source?.id) return []
  const own = new Set(instagramTokens(source))
  if (own.size < 3) return []
  return (sources || [])
    .filter(other => other?.kind === 'instagram' && other.id !== source.id)
    .map(other => {
      const theirs = new Set(instagramTokens(other))
      if (theirs.size < 3) return null
      let overlap = 0
      for (const token of own) if (theirs.has(token)) overlap += 1
      if (!overlap) return null
      const union = new Set([...own, ...theirs]).size
      return { source: other, score: overlap / Math.max(1, union), overlap }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.overlap - a.overlap)
    .slice(0, Math.max(0, limit))
}
