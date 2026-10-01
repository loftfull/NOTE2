// Качество текста, который попадает в «Источники» из локальных файлов.
// Дефекты найдены проверкой на настоящих файлах (docx/xlsx/pptx/odt/ods/epub/
// pdf, собранных генераторами) и здесь закреплены.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripHtml, parseLocalFile } from '../src/ingest.js'
import { extractArchiveText } from '../src/archive-text.js'

// ── HTML ────────────────────────────────────────────────────────────────

test('строчные теги не вставляют пробел перед знаком препинания', () => {
  // Было: «Он не идемпотентен : «читал»…» — <b> превращался в пробел.
  const text = stripHtml('<p>Он <b>не идемпотентен</b>: «читал» даёт «чита».</p>')
  assert.ok(!/ :/.test(text), `лишний пробел перед двоеточием: ${JSON.stringify(text)}`)
  assert.match(text, /Он не идемпотентен: «читал»/)
})

test('строчные теги не разрывают слово', () => {
  const text = stripHtml('<p>мульти<i>языч</i>ность</p>')
  assert.match(text, /мультиязычность/)
})

test('содержимое script, style и svg не попадает в текст', () => {
  const text = stripHtml(
    '<html><head><style>body{color:red}</style>' +
    '<script>var leak="секрет"</script></head>' +
    '<body><svg><text>вектор</text></svg><p>проза</p></body></html>')
  assert.ok(!text.includes('color:red'), 'CSS просочился')
  assert.ok(!text.includes('секрет'), 'JS просочился')
  assert.ok(!text.includes('вектор'), 'содержимое SVG просочилось')
  assert.match(text, /проза/)
})

test('блочные теги дают границы абзацев, а не одну строку', () => {
  const text = stripHtml('<h1>Заголовок</h1><p>Первый абзац.</p><p>Второй абзац.</p>')
  const blocks = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  assert.deepEqual(blocks, ['Заголовок', 'Первый абзац.', 'Второй абзац.'])
})

test('числовые и именованные сущности раскодированы', () => {
  const text = stripHtml('<p>&#1055;&#x440;&#1086; &mdash; 100&nbsp;&euro; &amp; &laquo;тест&raquo;</p>')
  assert.match(text, /Про — 100 € & «тест»/)
})

test('заголовок страницы попадает в текст один раз', async () => {
  const html = '<html><head><title>Название страницы</title></head>' +
    '<body><h1>Название страницы</h1><p>Тело.</p></body></html>'
  const file = new File([html], 'page.html', { type: 'text/html' })
  const source = await parseLocalFile(file)
  const hits = source.text.split('Название страницы').length - 1
  assert.equal(hits, 1, `заголовок встречается ${hits} раз(а): ${JSON.stringify(source.text)}`)
  assert.equal(source.status, 'ready')
})

// ── EPUB ────────────────────────────────────────────────────────────────

test('EPUB: <title> главы не дублирует её заголовок', async () => {
  const { zip } = await import('./fixtures/zip.mjs')
  const chapter =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Глава первая</title>' +
    '<style>p{margin:0}</style></head>' +
    '<body><h1>Глава первая</h1><p>Текст главы.</p></body></html>'
  const bytes = zip([
    ['mimetype', 'application/epub+zip', { store: true }],
    ['OEBPS/ch1.xhtml', chapter],
  ])
  const out = await extractArchiveText(bytes.buffer, 'epub')
  const hits = out.text.split('Глава первая').length - 1
  assert.equal(hits, 1, `«Глава первая» встречается ${hits} раз(а): ${JSON.stringify(out.text)}`)
  assert.match(out.text, /Текст главы\./)
  assert.ok(!out.text.includes('margin:0'), 'CSS главы просочился')
})
