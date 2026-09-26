#!/usr/bin/env node
// Стенд проверки AI-функций: OpenAI-совместимый сервер, который ведёт себя
// как настоящий провайдер и отчитывается, что именно ему прислали.
//
// Зачем он нужен. Проверить качество ответов модели без модели нельзя. Но
// почти всё, что ломается на практике, — не качество: не тот системный
// промпт, потерянная история, ключ не дошёл, ошибка провайдера показана как
// ответ модели, таймаут висит вечно. Всё это проверяется здесь, и проверяется
// по-настоящему: приложение не знает, что перед ним стенд.
//
// Сервер умеет изображать типовые отказы настоящих провайдеров — их и надо
// уметь пережить:
//
//   --mode ok        обычный ответ, в котором видно, что получил сервер
//   --mode empty     пустой ответ модели
//   --mode html      HTML вместо JSON (прокси, страница входа)
//   --mode 401       неверный ключ
//   --mode 429       превышен лимит, с Retry-After
//   --mode 500       ошибка на стороне провайдера
//   --mode slow      ответ дольше таймаута приложения
//
// Запуск:
//   node tools/model-conformance/server.mjs --port 8799 --mode ok
//
// Чтобы проверить приложение против НАСТОЯЩЕГО провайдера, стенд не нужен:
// добавьте модель в «Профиль» → «Модели AI» и повторите те же действия.

import { createServer } from 'node:http'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(argOf('port', 8799))
const MODE = argOf('mode', 'ok')

/** Что сервер увидел — сюда смотрит проверяющий. */
export const received = []

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

const CATALOG = {
  data: [
    { id: 'conformance/echo-free', name: 'Стенд · бесплатная', context_length: 128000, pricing: { prompt: '0', completion: '0' } },
    { id: 'conformance/echo-paid', name: 'Стенд · платная', context_length: 32000, pricing: { prompt: '0.000002', completion: '0.000004' } }
  ]
}

/**
 * Ответ, по которому видно, что дошло до «модели». Это не имитация мышления:
 * текст намеренно выглядит как отчёт стенда, чтобы его нельзя было принять за
 * ответ настоящей модели ни в интерфейсе, ни на скриншоте.
 */
function echoAnswer(body) {
  const system = body?.messages?.find(m => m.role === 'system')?.content || '(нет)'
  const user = [...(body?.messages || [])].reverse().find(m => m.role === 'user')?.content || ''
  const history = (body?.messages || []).filter(m => m.role !== 'system').length - 1
  return [
    '[СТЕНД] Это не ответ модели, а отчёт проверочного сервера.',
    `модель: ${body?.model || '(не передана)'}`,
    `системная инструкция: ${String(system).replace(/\s+/g, ' ').slice(0, 160)}`,
    `реплик в истории: ${history}`,
    `длина запроса: ${String(user).length} символов`,
    `начало запроса: ${String(user).replace(/\s+/g, ' ').slice(0, 120)}`
  ].join('\n')
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  let body = null
  try { body = raw ? JSON.parse(raw) : null } catch { /* тело не JSON — так и запишем */ }

  const entry = {
    at: new Date().toISOString(),
    path: req.url,
    method: req.method,
    authorization: req.headers.authorization || null,
    model: body?.model || null,
    system: body?.messages?.find(m => m.role === 'system')?.content || null,
    userMessage: [...(body?.messages || [])].reverse().find(m => m.role === 'user')?.content || null,
    messageCount: Array.isArray(body?.messages) ? body.messages.length : 0
  }
  received.push(entry)
  console.log(JSON.stringify(entry))

  if (req.url.includes('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS })
    return res.end(JSON.stringify(CATALOG))
  }

  const json = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...CORS })
    res.end(JSON.stringify(payload))
  }
  const completion = text => ({
    id: 'conf-1', model: body?.model || 'conformance/echo-free',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }]
  })

  switch (MODE) {
    case 'empty': return json(200, completion(''))
    case 'html':
      res.writeHead(200, { 'Content-Type': 'text/html', ...CORS })
      return res.end('<!doctype html><html><body>Sign in to continue</body></html>')
    case '401': return json(401, { error: { message: 'Incorrect API key provided.' } })
    case '429':
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30', ...CORS })
      return res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }))
    case '500': return json(500, { error: { message: 'Upstream model unavailable' } })
    case 'slow':
      // Дольше, чем ждёт приложение: проверяем, что оно не виснет.
      return setTimeout(() => json(200, completion('слишком поздно')), 90_000)
    default: return json(200, completion(echoAnswer(body)))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`стенд слушает http://127.0.0.1:${PORT}/v1  режим: ${MODE}`)
})
