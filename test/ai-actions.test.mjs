import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTION_PROMPTS, DEFAULT_SYSTEM, knownActions, systemFor } from '../src/ai-actions.js'

test('разные действия дают разные инструкции', () => {
  // Это и был дефект: «Сводка», «Улучшить», «Ключевые слова» и «Название»
  // отправляли байт в байт одинаковый запрос, потому что action принимался и
  // не использовался. Модель не могла знать, чего от неё хотят.
  const four = ['summarize', 'improve', 'keywords', 'title'].map(action => systemFor(action, 'Контекст.'))
  assert.equal(new Set(four).size, 4, 'четыре действия — четыре разных запроса')
})

test('инструкция действия добавляется к системному тексту вызывающего, а не заменяет его', () => {
  // Вызывающий знает про контекст («работай только с этой заметкой»),
  // действие — про форму ответа. Нужны оба.
  const result = systemFor('summarize', 'Работай только с предоставленной заметкой.')
  assert.match(result, /Работай только с предоставленной заметкой\./)
  assert.match(result, /Сожми текст до сути/)
})

test('без системного текста вызывающего берётся общий', () => {
  const result = systemFor('keywords', '')
  assert.match(result, /личной базе знаний/)
  assert.match(result, /Выдели ключевые темы/)
  assert.equal(systemFor('keywords', '   '), result, 'пробелы — это тоже пусто')
})

test('неизвестное действие не ломает запрос и не добавляет пустой строки', () => {
  const result = systemFor('такого-действия-нет', 'Контекст.')
  assert.equal(result, 'Контекст.')
  assert.equal(systemFor(undefined, 'Контекст.'), 'Контекст.')
  assert.equal(systemFor(null, ''), DEFAULT_SYSTEM)
})

test('действие chat не навязывает форму ответа', () => {
  // В разговоре форму задаёт сам вопрос; лишняя инструкция мешала бы.
  assert.equal(ACTION_PROMPTS.chat, '')
  assert.equal(systemFor('chat', 'Контекст.'), 'Контекст.')
})

test('действия с цитированием требуют ссылок на фрагменты', () => {
  // Grounded-режим обязан ссылаться: без этого ответ неотличим от выдумки.
  for (const action of ['source-brief', 'grounded-analysis']) {
    assert.match(systemFor(action, ''), /\[S1\]/, action)
  }
  assert.match(systemFor('grounded-analysis', ''), /не додумывай/)
})

test('каждое действие приложения имеет инструкцию', () => {
  // Список взят из вызовов runTask в App.jsx. Новое действие без инструкции
  // повторит исходный дефект: кнопка будет, а различия не будет.
  const used = [
    'summarize', 'keywords', 'improve', 'title', 'chat',
    'source-brief', 'grounded-analysis', 'youtube-analysis',
    'instagram-brief', 'instagram-detailed', 'instagram-organize'
  ]
  for (const action of used) {
    assert.ok(action in ACTION_PROMPTS, `нет инструкции для «${action}»`)
  }
  assert.deepEqual(knownActions().sort(), used.sort(), 'список действий и список инструкций совпадают')
})

test('инструкции написаны по-русски и без обещаний выдумывать', () => {
  for (const [action, prompt] of Object.entries(ACTION_PROMPTS)) {
    if (!prompt) continue
    assert.match(prompt, /[а-яё]/i, `${action}: инструкция не на русском`)
    assert.ok(prompt.length < 400, `${action}: инструкция слишком длинная`)
  }
})
