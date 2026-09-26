// POST /api/ai and POST /api/embed.
//
// The gateway holds the provider key so the Android build never has to. That
// is the only reason these routes exist rather than the client calling the
// provider directly — which it can also do, through the model registry.
//
// Neither route has a fallback. If no model is configured the answer is 503
// naming the variable that would configure one. Returning locally extracted
// text from here would arrive at the client tagged origin:'model', and the
// user would have no way to tell an analysis from a word-frequency count.

import { HttpError } from '../http.mjs'
import { aiConfigured, embedConfigured } from '../config.mjs'
import { chatCompletion, embed } from '../upstream.mjs'
import { systemFor } from '../../src/ai-actions.js'

// Инструкции действий — в src/ai-actions.js, общем для сервера и клиента.
// Копия здесь разошлась бы с клиентской: прямой путь к провайдеру и путь
// через шлюз должны просить у модели одно и то же, иначе одна и та же кнопка
// даёт разный результат в зависимости от того, поднят сервер или нет.

/** Builds the message list, keeping the client's own system prompt if it sent one. */
export function buildMessages({ action, input, system, history }) {
  const past = Array.isArray(history)
    ? history
        .filter(message => message && typeof message.content === 'string' && ['user', 'assistant', 'system'].includes(message.role))
        .slice(-20)
        .map(message => ({ role: message.role, content: message.content }))
    : []

  return [
    { role: 'system', content: systemFor(action, system) },
    ...past,
    { role: 'user', content: String(input ?? '') }
  ]
}

export async function handleAi({ body, config }) {
  if (!aiConfigured(config)) {
    throw new HttpError(503, 'Модель не настроена на сервере. Задайте NOTE2_AI_BASE_URL и NOTE2_AI_MODEL, либо добавьте модель прямо в приложении.')
  }
  const input = String(body?.input ?? '')
  if (!input.trim() && !Array.isArray(body?.history)) throw new HttpError(400, 'Пустой запрос к модели')

  const result = await chatCompletion({
    baseUrl: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    // A client may name a model, but only one the operator configured. Passing
    // an arbitrary name through would let the client spend on any model the
    // key can reach.
    model: config.ai.model,
    messages: buildMessages({ action: body?.action, input, system: body?.system, history: body?.history }),
    timeoutMs: config.limits.upstreamTimeoutMs
  })

  // `output` is the field the client reads first.
  return { output: result.text, model: result.model, action: body?.action || null }
}

export async function handleEmbed({ body, config }) {
  if (!embedConfigured(config)) {
    throw new HttpError(503, 'Сервис эмбеддингов не настроен. Задайте NOTE2_EMBED_MODEL, либо добавьте модель с ролью «векторный поиск» в приложении.')
  }
  const inputs = (Array.isArray(body?.inputs) ? body.inputs : [])
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
  if (!inputs.length) throw new HttpError(400, 'Нечего индексировать: пустой список фрагментов')
  if (inputs.length > 256) throw new HttpError(400, `Слишком много фрагментов за раз (${inputs.length}, максимум 256)`)

  const vectors = await embed({
    baseUrl: config.ai.baseUrl,
    apiKey: config.ai.apiKey,
    model: config.ai.embedModel,
    inputs,
    timeoutMs: config.limits.upstreamTimeoutMs
  })
  return { vectors, model: config.ai.embedModel }
}
