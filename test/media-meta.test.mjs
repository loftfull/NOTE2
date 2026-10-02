// Технические сведения из самого файла: размер кадра и EXIF.
//
// Зачем. Снимок, добавленный без настроенного сервиса распознавания,
// оставался пустой записью: ни текста, ни единого факта, по которому его
// можно найти. Между тем в самом файле лежат размер кадра, дата съёмки и
// камера — их видно без сети и без модели.
//
// Это именно технические сведения, а не описание. Никакой подписи к
// изображению здесь не выдумывается: что прочитано из байтов, то и
// записано.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageSize, readExif, describeImageMeta } from '../src/media-meta.js'
import { parseLocalFile } from '../src/ingest.js'

const bytes = (...parts) => new Uint8Array(parts.flat())

// ── Размер кадра по заголовку, без декодирования ────────────────────────

test('PNG: размер из IHDR', () => {
  const png = bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [0, 0, 0, 13], [...Buffer.from('IHDR')],
    [0, 0, 0x03, 0x20],   // 800
    [0, 0, 0x02, 0x58],   // 600
    [8, 2, 0, 0, 0])
  assert.deepEqual(imageSize(png), { width: 800, height: 600 })
})

test('GIF: размер из заголовка, порядок байтов обратный', () => {
  const gif = bytes([...Buffer.from('GIF89a')], [0x20, 0x03], [0x58, 0x02], [0, 0, 0])
  assert.deepEqual(imageSize(gif), { width: 800, height: 600 })
})

test('BMP: размер из DIB-заголовка', () => {
  const bmp = bytes([0x42, 0x4d], new Array(16).fill(0),
    [0x20, 0x03, 0, 0], [0x58, 0x02, 0, 0], [1, 0, 24, 0])
  assert.deepEqual(imageSize(bmp), { width: 800, height: 600 })
})

test('JPEG: размер из маркера SOF0, сегменты пропускаются по длине', () => {
  const jpeg = bytes(
    [0xff, 0xd8],
    // APP0 длиной 16 — его нужно перешагнуть, а не искать SOF внутри.
    [0xff, 0xe0, 0x00, 0x10], [...Buffer.from('JFIF\0')], new Array(9).fill(0),
    [0xff, 0xc0, 0x00, 0x11, 0x08], [0x02, 0x58], [0x03, 0x20],
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
  assert.deepEqual(imageSize(jpeg), { width: 800, height: 600 })
})

test('WebP: размер из блока VP8X', () => {
  const webp = bytes([...Buffer.from('RIFF')], [0, 0, 0, 0], [...Buffer.from('WEBP')],
    [...Buffer.from('VP8X')], [10, 0, 0, 0], [0, 0, 0, 0],
    [0x1f, 0x03, 0],   // ширина-1 = 799
    [0x57, 0x02, 0])   // высота-1 = 599
  assert.deepEqual(imageSize(webp), { width: 800, height: 600 })
})

test('ICO: берётся самый крупный значок, а не первый в каталоге', () => {
  // Каталог из трёх записей: 16×16, 48×48, 32×32. Человек считает размером
  // значка самый крупный кадр в файле — так же отвечает и Pillow.
  const ico = bytes([0, 0, 1, 0, 3, 0],
    [16, 16, 0, 0, 1, 0, 32, 0], [0, 1, 0, 0], [0x16, 0, 0, 0],
    [48, 48, 0, 0, 1, 0, 32, 0], [0, 9, 0, 0], [0x16, 0, 0, 0],
    [32, 32, 0, 0, 1, 0, 32, 0], [0, 4, 0, 0], [0x16, 0, 0, 0])
  assert.deepEqual(imageSize(ico), { width: 48, height: 48 })
})

test('ICO: нулевой размер в каталоге означает 256', () => {
  const ico = bytes([0, 0, 1, 0, 1, 0], [0, 0, 0, 0, 1, 0, 32, 0], [0, 1, 0, 0], [0x16, 0, 0, 0])
  assert.deepEqual(imageSize(ico), { width: 256, height: 256 })
})

test('TIFF: размер из тегов, с поправкой на поворот', () => {
  const tiff = (width, height, orientation) => {
    const tags = [[0x0100, 3, width], [0x0101, 3, height]]
    if (orientation) tags.push([0x0112, 3, orientation])
    const ifd = Buffer.alloc(2 + tags.length * 12 + 4)
    ifd.writeUInt16LE(tags.length, 0)
    tags.forEach(([tag, type, value], i) => {
      const at = 2 + i * 12
      ifd.writeUInt16LE(tag, at); ifd.writeUInt16LE(type, at + 2)
      ifd.writeUInt32LE(1, at + 4); ifd.writeUInt16LE(value, at + 8)
    })
    const header = Buffer.alloc(8)
    header.write('II', 0, 'latin1'); header.writeUInt16LE(42, 2); header.writeUInt32LE(8, 4)
    return new Uint8Array(Buffer.concat([header, ifd]))
  }
  assert.deepEqual(imageSize(tiff(590, 88)), { width: 590, height: 88 })
  // Повороты 5..8 кладут кадр на бок: на экране стороны меняются местами.
  assert.deepEqual(imageSize(tiff(88, 590, 6)), { width: 590, height: 88 })
  assert.deepEqual(imageSize(tiff(88, 590, 8)), { width: 590, height: 88 })
  // Повороты 1..4 сторон не меняют.
  assert.deepEqual(imageSize(tiff(590, 88, 3)), { width: 590, height: 88 })
})

test('JPEG: снимок с телефона отдаёт размер так, как он виден', () => {
  // Ориентация 6 — «повернуть на 90°». В тестовом файле SOF хранит
  // 800×600, значит на экране это 600×800. Без поворота — 800×600.
  assert.deepEqual(imageSize(jpegWithExif([])), { width: 800, height: 600 })
  assert.deepEqual(imageSize(jpegWithExif([[0x0112, 3, 6]])), { width: 600, height: 800 })
  assert.deepEqual(imageSize(jpegWithExif([[0x0112, 3, 8]])), { width: 600, height: 800 })
  // Повороты 1..4 стороны не меняют.
  assert.deepEqual(imageSize(jpegWithExif([[0x0112, 3, 3]])), { width: 800, height: 600 })
})

test('мусор не ломает разбор и не выдумывает размер', () => {
  assert.equal(imageSize(bytes([1, 2, 3, 4, 5, 6, 7, 8])), null)
  assert.equal(imageSize(bytes([])), null)
  // Оборванный PNG: сигнатура есть, IHDR нет.
  assert.equal(imageSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), null)
})

// ── EXIF ────────────────────────────────────────────────────────────────

/** Собирает JPEG с одним сегментом APP1/EXIF и перечисленными тегами. */
function jpegWithExif(tags, { little = true } = {}) {
  const entries = []
  const extras = []
  // Смещение данных считается от начала TIFF-заголовка.
  let extraAt = 8 + 2 + tags.length * 12 + 4
  for (const [tag, type, value] of tags) {
    const e = Buffer.alloc(12)
    const w16 = (off, v) => little ? e.writeUInt16LE(v, off) : e.writeUInt16BE(v, off)
    const w32 = (off, v) => little ? e.writeUInt32LE(v, off) : e.writeUInt32BE(v, off)
    w16(0, tag); w16(2, type)
    if (type === 2) {
      const s = Buffer.from(String(value) + '\0', 'latin1')
      w32(4, s.length)
      if (s.length <= 4) s.copy(e, 8)
      else { w32(8, extraAt); extras.push(s); extraAt += s.length }
    } else {
      w32(4, 1); w32(8, Number(value))
    }
    entries.push(e)
  }
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4)
  little ? ifd.writeUInt16LE(entries.length, 0) : ifd.writeUInt16BE(entries.length, 0)
  entries.forEach((e, i) => e.copy(ifd, 2 + i * 12))
  const header = Buffer.alloc(8)
  header.write(little ? 'II' : 'MM', 0, 'latin1')
  little ? header.writeUInt16LE(42, 2) : header.writeUInt16BE(42, 2)
  little ? header.writeUInt32LE(8, 4) : header.writeUInt32BE(8, 4)
  const tiff = Buffer.concat([header, ifd, ...extras])
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const app1 = Buffer.alloc(4)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(payload.length + 2, 2)
  return new Uint8Array(Buffer.concat([
    Buffer.from([0xff, 0xd8]), app1, payload,
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 3,
      1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
  ]))
}

test('EXIF: камера и дата съёмки читаются', () => {
  const file = jpegWithExif([
    [0x010f, 2, 'Canon'],
    [0x0110, 2, 'Canon EOS 5D Mark III'],
    [0x0112, 3, 6],
    [0x0132, 2, '2019:05:14 10:22:35'],
  ])
  const exif = readExif(file)
  assert.equal(exif.make, 'Canon')
  assert.equal(exif.model, 'Canon EOS 5D Mark III')
  assert.equal(exif.orientation, 6)
  assert.equal(exif.dateTime, '2019-05-14 10:22')
})

test('EXIF: читается и обратный порядок байтов (motorola)', () => {
  const exif = readExif(jpegWithExif([[0x010f, 2, 'NIKON']], { little: false }))
  assert.equal(exif.make, 'NIKON')
})

test('EXIF: отсутствует — возвращается пусто, а не выдумка', () => {
  const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    0x02, 0x58, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
  assert.deepEqual(readExif(plain), {})
  assert.deepEqual(readExif(new Uint8Array([1, 2, 3])), {})
})

test('EXIF: испорченное смещение не роняет разбор', () => {
  const broken = jpegWithExif([[0x010f, 2, 'Canon']])
  // Портим смещение первого IFD в TIFF-заголовке.
  broken[2 + 4 + 6 + 4] = 0xff
  assert.doesNotThrow(() => readExif(broken))
})

// ── Строка для показа и поиска ──────────────────────────────────────────

test('строка собирается только из прочитанного', () => {
  assert.equal(
    describeImageMeta({ width: 4032, height: 3024 }, { dateTime: '2019-05-14 10:22', make: 'Canon', model: 'Canon EOS 5D' }),
    'Изображение 4032×3024 · снято 2019-05-14 10:22 · Canon EOS 5D')
  // Модель уже содержит название производителя — не дублируем.
  assert.equal(
    describeImageMeta({ width: 800, height: 600 }, { make: 'NIKON', model: 'NIKON D750' }),
    'Изображение 800×600 · NIKON D750')
  assert.equal(describeImageMeta({ width: 800, height: 600 }, {}), 'Изображение 800×600')
  assert.equal(describeImageMeta(null, {}), '')
})

// ── Как это попадает в источник ─────────────────────────────────────────

test('снимок перестаёт быть пустой записью', async () => {
  const jpeg = jpegWithExif([
    [0x010f, 2, 'Apple'],
    [0x0110, 2, 'iPhone 13'],
    [0x9003, 2, '2026:03:08 19:41:07'],
  ])
  const source = await parseLocalFile(new File([jpeg], 'IMG_0421.jpg', { type: 'image/jpeg' }))

  assert.equal(source.kind, 'image')
  // Статус не меняется: текста на снимке никто не прочитал.
  assert.equal(source.status, 'needs-connector')
  // Но запись больше не пустая — по ней можно искать.
  assert.equal(source.meta.width, 800)
  assert.equal(source.meta.height, 600)
  assert.equal(source.meta.dateTime, '2026-03-08 19:41')
  assert.equal(source.meta.camera, 'Apple iPhone 13')
  assert.match(source.text, /Изображение 800×600 · снято 2026-03-08 19:41 · Apple iPhone 13/)
  assert.ok(source.wordCount > 0)
})

test('у снимка без EXIF остаётся только то, что есть', async () => {
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
    Buffer.from([0, 0, 0x03, 0x20]), Buffer.from([0, 0, 0x02, 0x58]),
    Buffer.from([8, 2, 0, 0, 0]),
  ])
  const source = await parseLocalFile(new File([png], 'snimok.png', { type: 'image/png' }))
  assert.equal(source.text, 'Изображение 800×600')
  assert.equal(source.meta.dateTime, undefined)
  assert.equal(source.meta.camera, undefined)
})

test('нечитаемый заголовок не мешает добавить файл', async () => {
  const junk = Buffer.from([0xff, 0xd8, 0xff, 0x13, 0x37, 0x42, 0, 1, 2, 3, 4, 5])
  const source = await parseLocalFile(new File([junk], 'bitoe.jpg', { type: 'image/jpeg' }))
  assert.equal(source.kind, 'image')
  assert.equal(source.status, 'needs-connector')
  assert.equal(source.text, '')
  assert.deepEqual(source.meta, {})
})

test('сведения о снимке — не описание: статус и сообщение об этом говорят', async () => {
  const source = await parseLocalFile(new File([jpegWithExif([])], 'a.jpg', { type: 'image/jpeg' }))
  assert.match(source.error, /расшифровка и распознавание/)
  assert.ok(!/описан|распозна(но|ли)/i.test(source.text),
    'строка со сведениями не должна выглядеть как результат распознавания')
})
