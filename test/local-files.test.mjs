// Разбор локальных файлов — на настоящих файлах, а не на подставленных
// разборщиках. Набор в test/fixtures/files собран настоящими генераторами
// (docx 9.7.2, exceljs 4.4.0, pptxgenjs 4.0.1, pdfkit 0.20.2) и по
// спецификациям OpenDocument, EPUB 3 и PNG; как его пересобрать — в
// tools/fixtures/README.md.
//
// Почему файлы лежат в репозитории, а не генерируются при запуске тестов:
// генераторы весят десятки мегабайт, нужны один раз, и воспроизводимость
// важнее. Весь набор — 88 КБ.
//
// PDF здесь не проверяется: src/pdf-text.js тянет воркер pdfjs через
// импорт с ?url, который понимает только сборщик. PDF проверяется в
// браузере — tools/e2e/import.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLocalFile } from '../src/ingest.js'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'files')

const TYPES = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.html': 'text/html', '.png': 'image/png', '.bin': 'application/octet-stream',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.epub': 'application/epub+zip',
}

const load = name => {
  const bytes = fs.readFileSync(path.join(DIR, name))
  return new File([bytes], name, { type: TYPES[path.extname(name)] || '' })
}

const parse = name => parseLocalFile(load(name))

// ── Форматы, которые должны разбираться на устройстве ───────────────────

const READY = [
  ['article.txt', 'text', /Расход на инфраструктуру вырос на 18 процентов/],
  ['table.csv', 'text', /август,486000,перенос медиа-узла/],
  ['zametka.md', 'text', /# Разметка в заметке/],
  ['page.html', 'html', /Алгоритм Snowball отрезает окончания/],
  ['protokol.docx', 'docx', /Протокол встречи 26 сентября/],
  ['raskhody.xlsx', 'xlsx', /август\t486000\tперенос медиа-узла/],
  ['otchet.pptx', 'pptx', /Решения к обсуждению/],
  ['konspekt.odt', 'odt', /RV начинается после первой гласной/],
  ['smeta.ods', 'ods', /обработка медиа\s+358800/],
  ['kniga.epub', 'epub', /Полный обход заметок перестаёт быть бесплатным/],
]

for (const [name, kind, expected] of READY) {
  test(`${name}: разбирается на устройстве`, async () => {
    const source = await parse(name)
    assert.equal(source.kind, kind)
    assert.equal(source.status, 'ready', `статус ${source.status}, ошибка: ${source.error || '—'}`)
    assert.match(source.text, expected)
    assert.ok(source.wordCount > 0, 'слов должно быть больше нуля')
    assert.equal(source.charCount, source.text.length)
  })
}

// ── Форматы, которые обязаны честно отказаться ──────────────────────────

test('PNG принимается как источник, но помечается как требующий сервиса', async () => {
  const source = await parse('snimok.png')
  assert.equal(source.kind, 'image')
  assert.equal(source.status, 'needs-connector')
  // Текст есть, но это технические сведения из заголовка файла, а не
  // распознанное содержимое: статус об этом говорит прямо.
  assert.equal(source.text, 'Изображение 240×120')
  assert.deepEqual(source.meta, { width: 240, height: 120 })
  assert.match(source.error, /расшифровка и распознавание/)
})

test('неизвестный двоичный формат не притворяется разобранным', async () => {
  const source = await parse('proshivka.bin')
  assert.equal(source.kind, 'binary')
  assert.equal(source.status, 'needs-connector')
  assert.equal(source.text, '')
  assert.match(source.error, /двоичного формата нужен отдельный коннектор/)
})

// ── Качество текста: дефекты, найденные на этих же файлах ───────────────

test('EPUB: заголовок главы не задваивается из <title>', async () => {
  const source = await parse('kniga.epub')
  const hits = source.text.split('Глава первая: зачем индекс').length - 1
  assert.equal(hits, 1, `встречается ${hits} раз(а)`)
})

test('EPUB: оглавление не попадает в текст источника', async () => {
  const source = await parse('kniga.epub')
  assert.ok(!source.text.includes('это оглавление'.toUpperCase()) && !/оглавление/i.test(source.text),
    `в тексте есть оглавление: ${source.text.slice(0, 200)}`)
})

test('HTML: содержимое <script> и <style> не попадает в текст', async () => {
  const source = await parse('page.html')
  assert.ok(!source.text.includes('этого не должно попасть'), 'JS просочился')
  assert.ok(!source.text.includes('font-family'), 'CSS просочился')
})

test('HTML: заголовок страницы встречается один раз', async () => {
  const source = await parse('page.html')
  const hits = source.text.split('Заметка о стемминге').length - 1
  assert.equal(hits, 1, `встречается ${hits} раз(а)`)
})

test('HTML: строчные теги не вставляют пробел перед знаком препинания', async () => {
  const source = await parse('page.html')
  assert.match(source.text, /не идемпотентен: «читал»/)
})

// ── Метки секций ────────────────────────────────────────────────────────

// Дефект, найденный этим же набором: normalizeText заменяла
// [\t\u00a0]+ на пробел, то есть вместе с неразрывными пробелами съедала
// и табуляцию. У таблицы пропадала граница столбцов («август 486000
// перенос медиа-узла» — где кончается сумма и начинается примечание,
// видно только по смыслу), а у исходного кода — отступы.
test('таблица сохраняет границы столбцов', async () => {
  const source = await parse('raskhody.xlsx')
  assert.match(source.text, /август\t486000\tперенос медиа-узла/)
})

test('отступы в коде не съедаются', async () => {
  const code = 'def main():\n\tif True:\n\t\treturn 1\n'
  const source = await parseLocalFile(new File([code], 'script.py', { type: 'text/x-python' }))
  assert.equal(source.kind, 'text')
  assert.match(source.text, /\n\tif True:\n\t\treturn 1/)
})

test('неразрывные пробелы по-прежнему схлопываются', async () => {
  const raw = 'сто\u00a0\u00a0\u00a0рублей   и   ещё'
  const source = await parseLocalFile(new File([raw], 'a.txt', { type: 'text/plain' }))
  assert.equal(source.text, 'сто рублей и ещё')
})

test('метки секций — по-русски', async () => {
  const xlsx = await parse('raskhody.xlsx')
  const pptx = await parse('otchet.pptx')
  assert.match(xlsx.text, /^Лист 1/m)
  assert.match(pptx.text, /^Слайд 1/m)
  assert.match(pptx.text, /^Слайд 2/m)
})

test('все четырнадцать файлов набора читаются без исключения', async () => {
  const names = fs.readdirSync(DIR).sort()
  assert.equal(names.length, 14, `в наборе ${names.length} файлов`)
  for (const name of names) {
    if (name.endsWith('.pdf')) continue  // нужен сборщик, см. шапку
    const source = await parse(name)
    assert.ok(source.status, `${name}: нет статуса`)
    assert.ok(['ready', 'needs-connector', 'empty'].includes(source.status),
      `${name}: неожиданный статус ${source.status}`)
  }
})
