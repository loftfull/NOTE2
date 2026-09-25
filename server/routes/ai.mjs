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

// What each action asks the model for. The client sends an action name and
// raw text; without these the model gets no instruction at all and answers
// something shaped differently every time.
export const ACTION_PROMPTS = {
  summarize: 'Сожми текст до сути: 3–5 предложений, без вступлений и без оценок. Пиши на языке исходного текста.',
  keywords: 'Выдели ключевые темы текста как теги вида #тема. Только теги, через пробел, не более 12.',
  improve: 'Перепиши текст яснее, сохранив все факты и смысл. Не добавляй ничего, чего нет в исходнике.',
  title: 'Придумай короткий заголовок для этого текста: до 8 слов, без кавычек и без точки в конце.',
  'instagram-brief': 'Сделай краткую выжимку поста: о чём он и что из него стоит запомнить. 3–5 предложений.',
  'instagram-detailed': 'Разбери пост подробно: тема, основные утверждения, упомянутые сущности, что полезно на практике.',
  'instagram-organize': 'Систематизируй содержимое: тема, теги, к какой категории отнести, что с этим делать дальше.',
  'source-brief': 'Сделай выжимку по приведённым фрагментам. После каждого утверждения ставь ссылку на фрагмент в виде [S1]. Не пиши ничего, что не следует из фрагментов.',
  'grounded-analysis': 'Ответь на вопрос, опираясь только на приведённые фрагменты. После каждого утверждения ставь ссылку вида [S1]. Если фрагментов недостаточно — так и скажи, не додумывай.'
}

const DEFAULT_SYSTEM = 'Ты помощник в личной базе знаний. Отвечай по существу, на языке пользователя. Не выдумывай факты: если данных не хватает, скажи об этом прямо.'

/** Builds the message list, keeping the client's own system prompt if it sent one. */
export function buildMessages({ action, input, system, history }) {
  const instruction = ACTION_PROMPTS[action] || ''
  const systemParts = [system || DEFAULT_SYSTEM, instruction].filter(Boolean)

  const past = Array.isArray(history)
    ? history
        .filter(message => message && typeof message.content === 'string' && ['user', 'assistant', 'system'].includes(message.role))
        .slice(-20)
        .map(message => ({ role: message.role, content: message.content }))
    : []

  return [
    { role: 'system', content: systemParts.join('\n\n') },
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
