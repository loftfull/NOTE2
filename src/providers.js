// OpenAI-compatible provider presets and client.
//
// Why this exists: the v4.10 gateway (server.mjs) was lost with the upload, and
// every AI feature was routed through it. Almost every model host now speaks the
// OpenAI chat-completions shape, so the app can talk to them directly and stop
// depending on a server that no longer exists. The project's own gateway stays
// in the list as one provider among several, not as the only way in.
//
// Base URLs below are defaults, not gospel — each one is editable per model,
// because hosts move paths and the user may be running something local.

export const PROVIDERS = {
  ollama: {
    label: 'Ollama — локально',
    baseUrl: 'http://localhost:11434/v1',
    keyless: true,
    free: true,
    local: true,
    hint: 'Модели на вашем компьютере. Ключ не нужен. Запустите: ollama serve',
    docs: 'https://ollama.com'
  },
  lmstudio: {
    label: 'LM Studio — локально',
    baseUrl: 'http://localhost:1234/v1',
    keyless: true,
    free: true,
    local: true,
    hint: 'Локальный сервер LM Studio. Ключ не нужен.',
    docs: 'https://lmstudio.ai'
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    free: true,
    hint: 'Есть модели с суффиксом :free. Нужен свой ключ.',
    docs: 'https://openrouter.ai/keys'
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    free: true,
    hint: 'Быстрый бесплатный тариф с лимитами. Нужен свой ключ.',
    docs: 'https://console.groq.com/keys'
  },
  google: {
    label: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    free: true,
    hint: 'OpenAI-совместимый режим Gemini. Нужен свой ключ.',
    docs: 'https://aistudio.google.com/apikey'
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    hint: 'Нужен свой ключ.',
    docs: 'https://console.mistral.ai'
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'Нужен свой ключ.',
    docs: 'https://platform.openai.com/api-keys'
  },
  gateway: {
    label: 'Шлюз NOTE2',
    baseUrl: '/api/ai',
    keyless: true,
    gateway: true,
    hint: 'Собственный сервер проекта. Ключи остаются на сервере.'
  },
  custom: {
    label: 'Свой OpenAI-совместимый',
    baseUrl: '',
    hint: 'Любой сервер, отвечающий по /chat/completions.'
  }
}

export function providerInfo(id) {
  return PROVIDERS[id] || PROVIDERS.custom
}

export function isKeylessProvider(id) {
  return Boolean(providerInfo(id).keyless)
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  return `${base}${path}`
}

// A provider that fails is reported, never turned into content. Same rule as
// runAiTask: a wrong URL usually returns an HTML login page, and that must
// surface as "не JSON", not as an answer.
async function readJson(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    throw new Error(`Ответ не JSON (${response.status}, ${type.split(';')[0] || 'без типа'}). Проверьте адрес.`)
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`Некорректный JSON в ответе (${response.status}).`)
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || data?.message
    throw new Error(detail ? String(detail) : `Сервер вернул ${response.status}.`)
  }
  return data
}

function authHeaders(model) {
  const headers = { 'Content-Type': 'application/json' }
  if (model?.apiKey) headers.Authorization = `Bearer ${model.apiKey}`
  return headers
}

/** Lists what the endpoint actually offers. Used by the "проверить" action. */
export async function listProviderModels(model, { signal, timeoutMs = 20_000 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  if (signal && controller) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(joinUrl(model.baseUrl, '/models'), {
      headers: authHeaders(model),
      signal: controller?.signal
    })
    const data = await readJson(response)
    const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
    return items.map(item => String(item?.id || item?.name || '')).filter(Boolean)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * One chat turn against an OpenAI-compatible endpoint.
 * Returns { text, model } or throws with a message meant for a person.
 */
export async function chatCompletion(model, { system, messages, temperature = 0.3, signal, timeoutMs = 60_000 } = {}) {
  if (!model?.baseUrl) throw new Error('У модели не задан адрес сервера.')
  if (!model?.model) throw new Error('У модели не задан идентификатор.')

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  if (signal && controller) signal.addEventListener('abort', () => controller.abort(), { once: true })

  const body = {
    model: model.model,
    temperature,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...(messages || [])
    ]
  }

  try {
    const response = await fetch(joinUrl(model.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: authHeaders(model),
      body: JSON.stringify(body),
      signal: controller?.signal
    })
    const data = await readJson(response)
    const text = data?.choices?.[0]?.message?.content
    if (!text || !String(text).trim()) throw new Error('Модель вернула пустой ответ.')
    return { text: String(text), model: data?.model || model.model }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Превышено время ожидания модели.')
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function embedTextsWith(model, inputs, { signal, timeoutMs = 60_000 } = {}) {
  const values = (Array.isArray(inputs) ? inputs : [inputs]).map(x => String(x || '').trim()).filter(Boolean)
  if (!values.length) return []
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  if (signal && controller) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(joinUrl(model.baseUrl, '/embeddings'), {
      method: 'POST',
      headers: authHeaders(model),
      body: JSON.stringify({ model: model.model, input: values }),
      signal: controller?.signal
    })
    const data = await readJson(response)
    const vectors = (data?.data || []).map(item => item?.embedding).filter(Array.isArray)
    if (vectors.length !== values.length) throw new Error('Сервер вернул неожиданное число векторов.')
    return vectors
  } finally {
    if (timer) clearTimeout(timer)
  }
}
