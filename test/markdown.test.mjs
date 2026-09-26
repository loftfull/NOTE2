// Отрисовка Markdown и, важнее, её обезвреживание.
//
// Текст заметки приходит не только от владельца: он попадает туда из
// импортированных файлов, из страниц по ссылке, из субтитров YouTube и из
// ответов модели. Любой из этих источников может нести <script> или
// onerror=, а результат уходит в dangerouslySetInnerHTML — в приложении, где
// рядом лежат ключи провайдеров. Поэтому половина тестов здесь про XSS.

import { JSDOM } from 'jsdom'
globalThis.window = new JSDOM('').window

import { test } from 'node:test'
import assert from 'node:assert/strict'
const { escapeHtml, looksLikeMarkdown, renderMarkdown } = await import('../src/markdown.js')

// --- то, ради чего кнопки в редакторе ---------------------------------------

test('заголовки, списки и выделение отрисовываются', () => {
  assert.match(renderMarkdown('# Рецепт'), /<h1>Рецепт<\/h1>/)
  assert.match(renderMarkdown('- мука\n- вода'), /<ul>[\s\S]*<li>мука<\/li>/)
  assert.match(renderMarkdown('1. первый\n2. второй'), /<ol>[\s\S]*<li>первый<\/li>/)
  assert.match(renderMarkdown('**жирный**'), /<strong>жирный<\/strong>/)
  assert.match(renderMarkdown('> цитата'), /<blockquote>/)
})

test('таблицы и чек-листы — то, что вставляют кнопки', () => {
  const table = renderMarkdown('| а | б |\n|---|---|\n| 1 | 2 |')
  assert.match(table, /<table>/)
  assert.match(table, /<th>а<\/th>/)
  const checklist = renderMarkdown('- [ ] сделать\n- [x] сделано')
  assert.match(checklist, /<input/)
})

test('код сохраняется как код, а не исполняется', () => {
  const html = renderMarkdown('```\nconst x = 1 < 2\n```')
  assert.match(html, /<pre>/)
  assert.match(html, /&lt;/, 'угловые скобки внутри кода экранированы')
})

test('перенос строки остаётся переносом', () => {
  // Люди пишут заметки, а не статьи: одиночный Enter должен быть виден.
  assert.match(renderMarkdown('первая\nвторая'), /<br>/)
})

// --- обезвреживание ---------------------------------------------------------

test('скрипт вырезается целиком', () => {
  const html = renderMarkdown('<script>alert(1)</script>Обычный текст')
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /alert/)
  assert.match(html, /Обычный текст/, 'остальное содержимое на месте')
})

test('обработчики событий не проходят', () => {
  for (const payload of [
    '<img src=x onerror="alert(1)">',
    '<div onclick="alert(1)">клик</div>',
    '<svg onload="alert(1)"></svg>',
    '<body onload=alert(1)>'
  ]) {
    const html = renderMarkdown(payload)
    assert.doesNotMatch(html, /onerror|onclick|onload/i, payload)
    assert.doesNotMatch(html, /alert/, payload)
  }
})

test('javascript: в ссылке обезвреживается', () => {
  // Тот же XSS, только через клик.
  for (const payload of [
    '[клик](javascript:alert(1))',
    '[клик](JaVaScRiPt:alert(1))',
    '<a href="javascript:alert(1)">клик</a>'
  ]) {
    const html = renderMarkdown(payload)
    assert.doesNotMatch(html, /javascript:/i, payload)
    assert.match(html, /клик/, 'текст ссылки остаётся')
  }
})

test('внешняя ссылка открывается безопасно', () => {
  const html = renderMarkdown('[сайт](https://example.com)')
  assert.match(html, /href="https:\/\/example\.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
})

test('картинка с чужой схемы не грузится', () => {
  assert.doesNotMatch(renderMarkdown('![x](javascript:alert(1))'), /javascript:/i)
  assert.match(renderMarkdown('![x](https://example.com/a.png)'), /loading="lazy"/)
})

test('стили из содержимого не применяются', () => {
  // style= позволяет перекрыть интерфейс: прозрачный слой поверх кнопок.
  const html = renderMarkdown('<p style="position:fixed;inset:0">накладка</p>')
  assert.doesNotMatch(html, /style=/i)
})

test('iframe и object не проходят', () => {
  for (const payload of ['<iframe src="https://evil.example"></iframe>', '<object data="x"></object>', '<embed src="x">']) {
    assert.doesNotMatch(renderMarkdown(payload), /<(iframe|object|embed)/i, payload)
  }
})

// --- устойчивость -----------------------------------------------------------

test('пустой и пробельный ввод дают пустую строку', () => {
  assert.equal(renderMarkdown(''), '')
  assert.equal(renderMarkdown('   \n  '), '')
  assert.equal(renderMarkdown(null), '')
  assert.equal(renderMarkdown(undefined), '')
})

test('обычный текст без разметки проходит как абзац', () => {
  assert.match(renderMarkdown('Просто текст.'), /<p>Просто текст\.<\/p>/)
})

test('escapeHtml экранирует всё опасное', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
})

test('looksLikeMarkdown отличает разметку от обычного текста', () => {
  for (const yes of ['# заголовок', '- пункт', '1. пункт', '> цитата', '```код```', '| а | б |']) {
    assert.equal(looksLikeMarkdown(yes), true, yes)
  }
  for (const no of ['Обычный текст', 'Цена 5-7 рублей', 'e-mail']) {
    assert.equal(looksLikeMarkdown(no), false, no)
  }
})
