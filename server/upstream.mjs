// Talking to an OpenAI-compatible provider.
//
// One shape covers Ollama, LM Studio, OpenRouter, Groq, Mistral and OpenAI,
// which is why the client already speaks it. The gateway holds the key so the
// APK never has to — embedding a provider secret in a shipped Android build
// is the one thing this project is explicitly forbidden to do.
//
// Every failure here becomes an error the caller reports. None of them is
// allowed to become text that looks like a model answer.

import { HttpError } from './http.mjs'

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}${path}`
}

/** A non-JSON reply is a misconfiguration, and must say so rather than parse. */
async function readJsonReply(response, what) {
  const type = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!type.includes('application/json')) {
    // The status and the type, never the body. Echoing the first bytes of a
    // login page back to the client puts '<!doctype html>' on screen as an
    // error, which is the exact string this app must never show a user. The
    // body is logged instead, where an operator can read it.
    console.error(`[gateway] ${what} ответил ${response.status} ${type}: ${text.slice(0, 500)}`)
    throw new HttpError(502, `${what} ответил не JSON (HTTP ${response.status}, ${type.split(';')[0] || 'без типа'}). Проверьте адрес провайдера в настройках сервера.`)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new HttpError(502, `${what} вернул некорректный JSON`)
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`
    throw new HttpError(response.status === 401 || response.status === 403 ? 502 : 502, `${what}: ${detail}`)
  }
  return data
}

function authHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

function withTimeout(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

async function send(url, init, timeoutMs, what) {
  const { signal, done } = withTimeout(timeoutMs)
  try {
    return await readJsonReply(await fetch(url, { ...init, signal }), what)
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error?.name === 'AbortError') throw new HttpError(504, `${what} не ответил за ${Math.round(timeoutMs / 1000)} с`)
    throw new HttpError(502, `Не удалось связаться с ${what.toLowerCase()}: ${error?.message || 'сеть недоступна'}`)
  } finally {
    done()
  }
}

/** Chat completion. Returns the assistant's text and the model that produced it. */
export async function chatCompletion({ baseUrl, apiKey, model, messages, timeoutMs = 120_000, temperature }) {
  const data = await send(endpoint(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
    body: JSON.stringify({ model, messages, ...(temperature === undefined ? {} : { temperature }) })
  }, timeoutMs, 'Провайдер модели')

  const text = data?.choices?.[0]?.message?.content
  // An empty completion is a failure, not an empty answer: returning '' here
  // would reach the user as a model response that happened to say nothing.
  if (typeof text !== 'string' || !text.trim()) {
    throw new HttpError(502, 'Провайдер модели не вернул текст ответа')
  }
  return { text, model: data.model || model, id: data.id || null }
}

/** Embeddings, in the order the inputs were given. */
export async function embed({ baseUrl, apiKey, model, inputs, timeoutMs = 120_000 }) {
  const data = await send(endpoint(baseUrl, '/embeddings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
    body: JSON.stringify({ model, input: inputs })
  }, timeoutMs, 'Сервис эмбеддингов')

  const rows = Array.isArray(data?.data) ? data.data : []
  if (rows.length !== inputs.length) {
    throw new HttpError(502, `Сервис эмбеддингов вернул ${rows.length} векторов на ${inputs.length} фрагментов`)
  }
  // Providers are not required to return rows in order; `index` is what says
  // which input a vector belongs to, and ignoring it silently mislabels every
  // chunk's vector.
  const vectors = new Array(inputs.length)
  for (let i = 0; i < rows.length; i += 1) {
    const position = Number.isInteger(rows[i]?.index) ? rows[i].index : i
    const vector = rows[i]?.embedding
    if (!Array.isArray(vector) || !vector.length) throw new HttpError(502, 'Сервис эмбеддингов вернул пустой вектор')
    if (position < 0 || position >= inputs.length) throw new HttpError(502, 'Сервис эмбеддингов вернул некорректный индекс')
    vectors[position] = vector
  }
  if (vectors.some(vector => !vector)) throw new HttpError(502, 'Сервис эмбеддингов пропустил часть фрагментов')
  return vectors
}

/** Vision: one image, described or transcribed by a multimodal model. */
export async function describeImage({ baseUrl, apiKey, model, bytes, mimeType, prompt, timeoutMs = 120_000 }) {
  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${Buffer.from(bytes).toString('base64')}`
  const data = await send(endpoint(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUri } }
        ]
      }]
    })
  }, timeoutMs, 'Сервис распознавания изображений')

  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new HttpError(502, 'Сервис распознавания вернул пустой ответ')
  return { text, model: data.model || model, id: data.id || null }
}

/** Speech to text, with segments when the provider returns them. */
export async function transcribeAudio({ baseUrl, apiKey, model, bytes, filename, mimeType, timeoutMs = 600_000 }) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType || 'application/octet-stream' }), filename || 'audio')
  form.append('model', model)
  // verbose_json is what carries timings; without it there are no sections and
  // evidence cannot point at a moment in the recording.
  form.append('response_format', 'verbose_json')

  return send(endpoint(baseUrl, '/audio/transcriptions'), {
    method: 'POST',
    headers: { ...authHeaders(apiKey) },
    body: form
  }, timeoutMs, 'Сервис расшифровки')
}
