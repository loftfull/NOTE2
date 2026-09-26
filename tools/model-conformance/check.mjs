#!/usr/bin/env node
// Прогон всех AI-действий приложения через один и тот же слой, которым
// пользуется интерфейс (runTask). Показывает, что именно уходит модели и что
// возвращается.
//
// Против стенда (модель не нужна):
//   node tools/model-conformance/server.mjs --port 8799 --mode ok &
//   node tools/model-conformance/check.mjs --base http://127.0.0.1:8799/v1 --model conformance/echo-free
//
// Против НАСТОЯЩЕГО провайдера — то же самое, но с его адресом и ключом:
//   node tools/model-conformance/check.mjs \
//     --base https://openrouter.ai/api/v1 \
//     --model deepseek/deepseek-r1:free \
//     --key sk-or-...
//
// Во втором случае ответы будут настоящими, и по ним видно уже качество
// модели, а не только правильность запроса.

import { runTask } from '../../src/model-runtime.js'
import { aiResultText } from '../../src/ai.js'
import { knownActions } from '../../src/ai-actions.js'

const args = process.argv.slice(2)
const argOf = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const baseUrl = argOf('base')
const model = argOf('model')
const apiKey = argOf('key')

if (!baseUrl || !model) {
  console.error('Нужны --base и --model. Смотрите комментарий в начале файла.')
  process.exit(1)
}

const settings = {
  models: [{ id: 'check', provider: 'custom', label: 'Проверка', baseUrl, model, apiKey, roles: ['chat'], apiKeyRef: null }],
  activeModelId: 'check'
}

const NOTE = [
  'Мука 500 г, вода 350 г, соль 10 г, закваска 100 г.',
  'Автолиз 40 минут. Три складывания с интервалом 30 минут.',
  'Расстойка 4 часа при 24 °C, затем холодная ночь в холодильнике.'
].join(' ')

const EVIDENCE = [
  '[S1] Рецепт · страница 1',
  'Мука 500 г, вода 350 г, соль 10 г.',
  '',
  '[S2] Рецепт · страница 2',
  'Расстойка 4 часа при 24 °C.'
].join('\n')

const CASES = [
  { action: 'summarize', label: 'Сводка заметки', input: NOTE },
  { action: 'keywords', label: 'Ключевые слова', input: NOTE },
  { action: 'improve', label: 'Улучшить текст', input: NOTE },
  { action: 'title', label: 'Придумать название', input: NOTE },
  { action: 'chat', label: 'Разговор', input: 'Сколько всего воды в рецепте?', history: [
    { role: 'user', content: 'О чём эта заметка?' },
    { role: 'assistant', content: 'О выпечке хлеба на закваске.' }
  ] },
  { action: 'source-brief', label: 'Выжимка по источнику', input: EVIDENCE },
  { action: 'grounded-analysis', label: 'Ответ с цитатами', input: `ВОПРОС: сколько воды?\n\n${EVIDENCE}` },
  { action: 'youtube-analysis', label: 'Разбор видео', input: 'TITLE: Как печь хлеб\nTRANSCRIPT: Берём муку и воду, ждём четыре часа.' },
  { action: 'instagram-brief', label: 'Выжимка поста', input: 'Подпись: закваска за пять дней. OCR: день 1 — мука и вода.' }
]

const missing = CASES.map(c => c.action).filter(action => !knownActions().includes(action))
if (missing.length) {
  console.error(`Нет инструкции для действий: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`провайдер: ${baseUrl}\nмодель   : ${model}\nключ     : ${apiKey ? 'задан' : 'не задан'}\n`)

let failed = 0
for (const item of CASES) {
  const started = Date.now()
  const result = await runTask(settings, item)
  const ms = Date.now() - started
  const ok = result.origin === 'model'
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${item.label.padEnd(24)} ${String(ms).padStart(6)} мс  origin=${result.origin}`)
  const shown = aiResultText(result).replace(/\s+/g, ' ').trim()
  console.log(`   ${shown.slice(0, 150)}${shown.length > 150 ? '…' : ''}\n`)
}

console.log(failed ? `${failed} из ${CASES.length} действий не дошли до модели` : `все ${CASES.length} действий прошли`)
process.exit(failed ? 1 : 0)
