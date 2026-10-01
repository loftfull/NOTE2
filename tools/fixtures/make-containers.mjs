#!/usr/bin/env node
// Вторая половина набора фикстур: контейнеры ODF и EPUB, PNG и простые
// текстовые файлы. Зависимостей нет — всё собирается по спецификациям:
//   ODF    OpenDocument v1.2, часть 3 (пакет): mimetype первой записью и
//          без сжатия, затем META-INF/manifest.xml и content.xml;
//   EPUB   EPUB 3: mimetype первой записью без сжатия, META-INF/container.xml,
//          OPF-пакет и главы XHTML;
//   PNG    спецификация PNG: сигнатура, IHDR, IDAT (zlib), IEND, CRC-32.
//
// Office-форматы собирает соседний make-office.mjs — там нужны настоящие
// генераторы, см. README.
//
// Использование: node tools/fixtures/make-containers.mjs [куда]

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = process.argv[2] || 'test/fixtures/files'
fs.mkdirSync(OUT, { recursive: true })
const at = name => path.join(OUT, name)

const enc = new TextEncoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = bytes => {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** ZIP. store: true — без сжатия (обязательно для mimetype в ODF и EPUB). */
function zip(entries) {
  const locals = [], central = []
  let offset = 0
  for (const [name, contents, options = {}] of entries) {
    const raw = typeof contents === 'string' ? enc.encode(contents) : contents
    const store = options.store === true
    const body = store ? raw : new Uint8Array(zlib.deflateRawSync(raw))
    const nameBytes = enc.encode(name)
    const crc = crc32(raw)
    const method = store ? 0 : 8

    const local = new Uint8Array(30 + nameBytes.length + body.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true); lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true); lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30); local.set(body, 30 + nameBytes.length)
    locals.push(local)

    const dir = new Uint8Array(46 + nameBytes.length)
    const dv = new DataView(dir.buffer)
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true)
    dv.setUint16(10, method, true); dv.setUint32(16, crc, true)
    dv.setUint32(20, body.length, true); dv.setUint32(24, raw.length, true)
    dv.setUint16(28, nameBytes.length, true); dv.setUint32(42, offset, true)
    dir.set(nameBytes, 46)
    central.push(dir)
    offset += local.length
  }
  const centralSize = central.reduce((n, d) => n + d.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + eocd.length)
  let atByte = 0
  for (const part of [...locals, ...central, eocd]) { out.set(part, atByte); atByte += part.length }
  return out
}

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
  + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
  + 'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'

const odf = (file, mimetype, content) => fs.writeFileSync(at(file), zip([
  ['mimetype', mimetype, { store: true }],
  ['META-INF/manifest.xml',
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
    + `<manifest:file-entry manifest:full-path="/" manifest:media-type="${mimetype}"/>`
    + '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
    + '</manifest:manifest>'],
  ['content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.2">`
    + `<office:body>${content}</office:body></office:document-content>`],
]))

odf('konspekt.odt', 'application/vnd.oasis.opendocument.text',
  '<office:text>'
  + '<text:h text:outline-level="1">Конспект: области стемминга</text:h>'
  + '<text:p>RV начинается после первой гласной, R1 — после первой пары гласная-согласная.</text:p>'
  + '<text:p>Алгоритм не идемпотентен: повторный проход укорачивает основу ещё раз.</text:p>'
  + '</office:text>')

odf('smeta.ods', 'application/vnd.oasis.opendocument.spreadsheet',
  '<office:spreadsheet><table:table table:name="Смета">'
  + '<table:table-row><table:table-cell><text:p>статья</text:p></table:table-cell>'
  + '<table:table-cell><text:p>сумма</text:p></table:table-cell></table:table-row>'
  + '<table:table-row><table:table-cell><text:p>хранение</text:p></table:table-cell>'
  + '<table:table-cell><text:p>128400</text:p></table:table-cell></table:table-row>'
  + '<table:table-row><table:table-cell><text:p>обработка медиа</text:p></table:table-cell>'
  + '<table:table-cell><text:p>358800</text:p></table:table-cell></table:table-row>'
  + '</table:table></office:spreadsheet>')

// Глава с <title> и <style> — ровно та форма, на которой нашлись дефекты:
// заголовок главы задваивался из <title>, а CSS просачивался в текст.
const chapter = (title, body) =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title>`
  + '<style>p{margin:0}</style></head>'
  + `<body><h1>${title}</h1>${body}</body></html>`

fs.writeFileSync(at('kniga.epub'), zip([
  ['mimetype', 'application/epub+zip', { store: true }],
  ['META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" '
    + 'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    + '<rootfiles><rootfile full-path="OEBPS/book.opf" '
    + 'media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ['OEBPS/book.opf',
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
    + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
    + '<dc:identifier id="id">note2-fixture</dc:identifier>'
    + '<dc:title>Записи о поиске</dc:title><dc:language>ru</dc:language>'
    + '<meta property="dcterms:modified">2026-09-26T00:00:00Z</meta></metadata>'
    + '<manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>'
    + '<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'],
  // nav.xhtml должен отсеиваться: это оглавление, а не содержание книги.
  ['OEBPS/nav.xhtml', chapter('Содержание', '<p>Это оглавление, его текст в источник попадать не должен.</p>')],
  ['OEBPS/ch1.xhtml', chapter('Глава первая: зачем индекс',
    '<p>Полный обход заметок перестаёт быть бесплатным, когда их становится тысячи.</p>'
    + '<p>Индекс нужен не раньше, чем появится объём.</p>')],
  ['OEBPS/ch2.xhtml', chapter('Глава вторая: что считать готовым',
    '<p>Готово — это подтверждённый вывод команды, а не ощущение.</p>')],
]))

// PNG 240×120 одним цветом.
const png = (file, w, h, rgb) => {
  const rows = []
  for (let y = 0; y < h; y += 1) {
    const row = new Uint8Array(1 + w * 3)
    for (let x = 0; x < w; x += 1) row.set(rgb, 1 + x * 3)
    rows.push(row)
  }
  const raw = Buffer.concat(rows.map(Buffer.from))
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(tag, 'latin1'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2   // 8 бит на канал, цветовой тип 2 (truecolor)
  fs.writeFileSync(at(file), Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}
png('snimok.png', 240, 120, [0xc2, 0x41, 0x0c])

fs.writeFileSync(at('article.txt'), [
  'Бюджет проекта на четвёртый квартал', '',
  'Ключевые выводы. Расход на инфраструктуру вырос на 18 процентов',
  'относительно третьего квартала. Основная причина — перенос',
  'обработки медиа на отдельный узел.', '',
  'Решения к обсуждению:',
  '1. Оставить узел и урезать бюджет на рекламу.',
  '2. Вернуть обработку в основной процесс и принять задержку.', '',
  'Ответственный: Ливий. Срок: 14 октября.', '',
].join('\n'))

// В странице есть <script>, <style>, <title> и строчный <b> перед
// двоеточием — всё, на чём ловились дефекты разбора HTML.
fs.writeFileSync(at('page.html'), [
  '<!doctype html>',
  '<html lang="ru"><head><meta charset="utf-8"><title>Заметка о стемминге</title>',
  '<style>body{font-family:sans-serif}</style><script>console.log(\'этого не должно попасть в текст\')</script></head>',
  '<body>',
  '<h1>Стемминг для русского</h1>',
  '<p>Алгоритм Snowball отрезает окончания по областям RV, R1 и R2.',
  'Он <b>не идемпотентен</b>: «читал» даёт «чита», а повторный проход — «чит».</p>',
  '<ul><li>Область RV начинается после первой гласной.</li><li>Стеммингом пользуемся для поиска, а не для показа.</li></ul>',
  '</body></html>', '',
].join('\n'))

fs.writeFileSync(at('table.csv'), [
  'месяц,расход,примечание',
  'июль,412000,базовый уровень',
  'август,486000,перенос медиа-узла',
  'сентябрь,487200,без изменений', '',
].join('\n'))

fs.writeFileSync(at('zametka.md'), [
  '# Разметка в заметке', '',
  'Шесть кнопок вставляют **Markdown**, показывать его было нечем.', '',
  '- [x] Рендер есть', '- [ ] Палитра мягче', '',
  '| что | вес |', '| --- | --- |', '| marked + dompurify | 23,3 КБ |', '',
].join('\n'))

// Заведомо неподдерживаемый формат: на нём проверяется, что приложение
// отказывается честно, а не выдаёт пустой текст за разобранный.
fs.writeFileSync(at('proshivka.bin'), Buffer.concat(Array.from({ length: 40 }, () => Buffer.from(Array.from({ length: 256 }, (_, i) => i)))))

console.log('готово:', fs.readdirSync(OUT).sort().join(' '))
