// POST /api/vision and POST /api/transcribe.
//
// Both take the file as the raw request body, with the original name in
// X-File-Name — that is the contract media-api.js already implements.
//
// Both fail closed. A picture the model could not read stays a picture; an
// empty transcript is reported as empty. The one thing neither may do is
// return plausible text, because downstream this becomes the source's own
// content and is then cited as evidence.

import { normalizeTranscription, splitVisionPages } from '../../media-connectors.mjs'
import { HttpError, readBody, requestFilename } from '../http.mjs'
import { transcribeConfigured, visionConfigured } from '../config.mjs'
import { describeImage, transcribeAudio } from '../upstream.mjs'

const OCR_PROMPT = [
  'Извлеки из изображения весь текст дословно, сохраняя порядок и переносы строк.',
  'Если в изображении несколько страниц или экранов, раздели их строкой вида "--- Page 1 ---".',
  'Ничего не пересказывай и не переводи. Если текста нет, ответь пустой строкой.'
].join(' ')

/** Rough confidence in an extraction, so the UI can flag a poor scan. */
export function extractionQuality(text = '') {
  const value = String(text)
  const characters = value.length
  if (!characters) return { level: 'empty', characters: 0, words: 0 }
  const words = (value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
  // A scan that produces long character runs with almost no word structure is
  // the signature of a failed OCR rather than of a short document.
  const level = words >= 40 ? 'good' : words >= 8 ? 'partial' : 'poor'
  return { level, characters, words }
}

export async function handleVision({ req, config }) {
  if (!visionConfigured(config)) {
    throw new HttpError(503, 'Распознавание изображений не настроено. Задайте NOTE2_AI_BASE_URL и NOTE2_VISION_MODEL.')
  }
  const bytes = await readBody(req, config.limits.visionBytes)
  if (!bytes.length) throw new HttpError(400, 'Пустой файл')

  const mimeType = String(req.headers['content-type'] || 'image/jpeg').split(';')[0].trim()
  if (!/^image\//.test(mimeType) && mimeType !== 'application/pdf') {
    throw new HttpError(415, `Распознавание работает с изображениями, получено ${mimeType}`)
  }

  const result = await describeImage({
    baseUrl: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    model: config.ai.visionModel,
    bytes,
    mimeType,
    prompt: OCR_PROMPT,
    timeoutMs: config.limits.upstreamTimeoutMs
  })

  const text = String(result.text || '').trim()
  return {
    text,
    // splitVisionPages turns "--- Page N ---" markers into located sections,
    // which is what makes a citation able to point at a page.
    sections: splitVisionPages(text),
    quality: extractionQuality(text),
    model: result.model,
    responseId: result.id,
    extractedAt: new Date().toISOString(),
    filename: requestFilename(req, 'image')
  }
}

export async function handleTranscribe({ req, config }) {
  if (!transcribeConfigured(config)) {
    throw new HttpError(503, 'Расшифровка не настроена. Задайте NOTE2_TRANSCRIBE_BASE_URL и NOTE2_TRANSCRIBE_MODEL.')
  }
  const bytes = await readBody(req, config.limits.uploadBytes)
  if (!bytes.length) throw new HttpError(400, 'Пустой файл')

  const mimeType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim()
  const filename = requestFilename(req, 'media')

  const payload = await transcribeAudio({
    baseUrl: config.transcribe.baseUrl,
    apiKey: config.transcribe.apiKey,
    model: config.transcribe.model,
    bytes,
    filename,
    mimeType,
    timeoutMs: config.limits.upstreamTimeoutMs
  })

  // The recovered normaliser turns whichever segment shape the provider used
  // into the sections the client indexes.
  const normalized = normalizeTranscription(payload)
  return {
    ...normalized,
    quality: extractionQuality(normalized.text),
    model: config.transcribe.model,
    diarized: normalized.speakers.length > 1,
    segmented: normalized.sections.length > 1,
    segmentCount: normalized.sections.length,
    speakerContinuity: normalized.speakers.length ? 'labelled' : 'none',
    transcribedAt: new Date().toISOString(),
    filename
  }
}
