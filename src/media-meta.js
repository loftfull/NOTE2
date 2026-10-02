// Технические сведения из самого медиафайла: размер кадра и EXIF.
//
// Зачем это есть. Снимок, добавленный без настроенного сервиса
// распознавания, оставался пустой записью: ни текста, ни одного факта, по
// которому его можно найти позже. Между тем размер кадра, дата съёмки и
// камера лежат в первых килобайтах файла — без сети, без модели и без
// декодирования картинки.
//
// Граница, которую здесь нельзя переходить: это ТЕХНИЧЕСКИЕ СВЕДЕНИЯ, а не
// описание. Ничего не додумывается — что прочитано из байтов, то и
// записано. Подпись к изображению по-прежнему делает только модель, и
// запись остаётся в статусе needs-connector, пока её нет.
//
// Разбор ручной и намеренно минимальный: нужны четыре поля, а не библиотека
// на 40 КБ. Все функции обязаны возвращать пусто на мусоре, а не бросать:
// на вход приходит произвольный файл с устройства.

const ascii = (bytes, from, length) => {
  let out = ''
  for (let i = from; i < from + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i])
  return out
}

const u16be = (b, i) => (b[i] << 8) | b[i + 1]
const u16le = (b, i) => b[i] | (b[i + 1] << 8)
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

/**
 * Размер кадра по заголовку файла, без декодирования.
 * @returns {{width: number, height: number}|null}
 */
export function imageSize(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input || [])
  // Минимум — заголовок GIF: 13 байт. Каждый формат ниже проверяет свою
  // длину сам, иначе короткий GIF отсекался бы вместе с мусором.
  if (b.length < 13) return null
  const ok = size => (size && size.width > 0 && size.height > 0 ? size : null)

  // PNG: ширина и высота — первые два поля IHDR, всегда по смещению 16.
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && ascii(b, 12, 4) === 'IHDR') {
    return b.length >= 24 ? ok({ width: u32be(b, 16), height: u32be(b, 20) }) : null
  }

  if (ascii(b, 0, 3) === 'GIF') return ok({ width: u16le(b, 6), height: u16le(b, 8) })

  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
    // BMP: у заголовков BITMAPCOREHEADER (12 байт) поля 16-битные,
    // у всех остальных — 32-битные со знаком; высота бывает отрицательной.
    const headerSize = u32le(b, 14)
    if (headerSize === 12) return ok({ width: u16le(b, 18), height: u16le(b, 20) })
    const width = u32le(b, 18) | 0
    const height = u32le(b, 22) | 0
    return ok({ width: Math.abs(width), height: Math.abs(height) })
  }

  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 30) return ok(webpSize(b))

  // JPEG: размер берётся из SOF, но показывается с поправкой на поворот.
  // Снимок с телефона почти всегда хранится «лёжа» и разворачивается тегом
  // ориентации; без поправки портрет 3024×4032 выглядел бы альбомом.
  if (b[0] === 0xff && b[1] === 0xd8) return ok(applyOrientation(jpegSize(b), readExif(b).orientation))

  // ICO: файл хранит несколько кадров. Размером значка человек считает
  // самый крупный из них — так же отвечает и Pillow.
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && u16le(b, 4) > 0) {
    return ok(icoSize(b))
  }

  // TIFF: размер лежит тегами 0x0100 и 0x0101 в первом IFD. Сканы часто
  // приходят именно в нём, поэтому формат стоит понимать.
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0)
    || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) {
    return ok(tiffSize(b))
  }

  return null
}

/** Повороты 5..8 кладут кадр на бок: на экране стороны меняются местами. */
function applyOrientation(size, orientation) {
  if (!size || !(orientation >= 5 && orientation <= 8)) return size
  return { width: size.height, height: size.width }
}

function icoSize(b) {
  const count = u16le(b, 4)
  let best = null
  for (let n = 0; n < count; n += 1) {
    const at = 6 + n * 16
    if (at + 16 > b.length) break
    const width = b[at] || 256
    const height = b[at + 1] || 256
    if (!best || width * height > best.width * best.height) best = { width, height }
  }
  return best
}

function tiffSize(b) {
  const little = b[0] === 0x49
  const u16 = i => (little ? u16le : u16be)(b, i)
  const u32 = i => (little ? u32le : u32be)(b, i)
  const at = u32(4)
  if (at <= 0 || at + 2 > b.length) return null
  const count = u16(at)
  if (count > 512) return null
  let width = 0, height = 0, orientation = 0
  for (let n = 0; n < count; n += 1) {
    const entry = at + 2 + n * 12
    if (entry + 12 > b.length) break
    const tag = u16(entry)
    if (tag !== 0x0100 && tag !== 0x0101 && tag !== 0x0112) continue
    // SHORT (3) лежит в младших двух байтах поля значения, LONG (4) — целиком.
    const type = u16(entry + 2)
    const value = type === 3 ? u16(entry + 8) : u32(entry + 8)
    if (tag === 0x0100) width = value
    else if (tag === 0x0101) height = value
    else orientation = value
  }
  return width && height ? applyOrientation({ width, height }, orientation) : null
}

function webpSize(b) {
  const chunk = ascii(b, 12, 4)
  // VP8X: ширина и высота по 24 бита, записаны на единицу меньше реальных.
  if (chunk === 'VP8X') {
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
    return { width, height }
  }
  if (chunk === 'VP8 ') {
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return null
}

function jpegSize(b) {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue }
    const marker = b[i + 1]
    // Маркеры без полезной нагрузки.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return null   // конец или начало данных
    const length = u16be(b, i + 2)
    if (length < 2) return null
    // SOF0..SOF15, кроме DHT (c4), JPG (c8) и DAC (cc): в них размер кадра.
    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { width: u16be(b, i + 7), height: u16be(b, i + 5) }
    i += 2 + length
  }
  return null
}

// Теги, которые действительно пригодятся. Остальное не читается: чем
// меньше разбора чужого формата, тем меньше поверхности для ошибок.
const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_ORIENTATION = 0x0112
const TAG_DATETIME = 0x0132
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_EXIF_IFD = 0x8769

/**
 * EXIF из JPEG: производитель, модель, ориентация, дата съёмки.
 * @returns {{make?: string, model?: string, orientation?: number, dateTime?: string}}
 */
export function readExif(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input || [])
  try {
    const app1 = findExifSegment(b)
    if (!app1) return {}
    return readTiff(b, app1)
  } catch {
    // Испорченный EXIF — обычное дело у файлов, прошедших через чужие
    // редакторы. Отсутствие сведений не должно мешать добавить файл.
    return {}
  }
}

function findExifSegment(b) {
  if (!(b[0] === 0xff && b[1] === 0xd8)) return 0
  let i = 2
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 0
    const marker = b[i + 1]
    if (marker === 0xda || marker === 0xd9) return 0
    const length = u16be(b, i + 2)
    if (length < 2) return 0
    if (marker === 0xe1 && ascii(b, i + 4, 6) === 'Exif\0\0') return i + 10
    i += 2 + length
  }
  return 0
}

function readTiff(b, tiff) {
  const order = ascii(b, tiff, 2)
  if (order !== 'II' && order !== 'MM') return {}
  const little = order === 'II'
  const u16 = i => (little ? u16le : u16be)(b, i)
  const u32 = i => (little ? u32le : u32be)(b, i)
  if (u16(tiff + 2) !== 42) return {}

  const out = {}
  const readIfd = (offset, depth) => {
    if (depth > 2) return
    const at = tiff + offset
    if (at + 2 > b.length || offset <= 0) return
    const count = u16(at)
    // Заведомо неправдоподобное число записей — признак мусора.
    if (count > 512) return
    for (let n = 0; n < count; n += 1) {
      const entry = at + 2 + n * 12
      if (entry + 12 > b.length) return
      const tag = u16(entry)
      const type = u16(entry + 2)
      const length = u32(entry + 4)
      const valueAt = length * typeSize(type) <= 4 ? entry + 8 : tiff + u32(entry + 8)

      if (tag === TAG_EXIF_IFD && type === 4) { readIfd(u32(entry + 8), depth + 1); continue }
      if (type === 2) {
        const s = readString(b, valueAt, length)
        if (tag === TAG_MAKE) out.make = s
        else if (tag === TAG_MODEL) out.model = s
        else if (tag === TAG_DATETIME_ORIGINAL) out.dateTime = formatExifDate(s) || out.dateTime
        else if (tag === TAG_DATETIME && !out.dateTime) out.dateTime = formatExifDate(s)
      } else if (tag === TAG_ORIENTATION && type === 3) {
        const value = u16(valueAt)
        if (value >= 1 && value <= 8) out.orientation = value
      }
    }
  }
  readIfd(u32(tiff + 4), 0)
  for (const key of Object.keys(out)) if (out[key] === '' || out[key] == null) delete out[key]
  return out
}

const typeSize = type => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1

function readString(b, at, length) {
  if (at < 0 || at >= b.length) return ''
  let end = Math.min(at + length, b.length)
  let out = ''
  for (let i = at; i < end; i += 1) {
    const c = b[i]
    if (c === 0) break
    // Управляющие символы в этих полях — признак, что смещение неверное.
    if (c < 0x20 && c !== 0x09) return ''
    out += String.fromCharCode(c)
  }
  return out.trim()
}

/** «2019:05:14 10:22:35» → «2019-05-14 10:22». Иначе пусто. */
function formatExifDate(value = '') {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value).trim())
  if (!m) return ''
  const [, y, mo, d, h, mi] = m
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return ''
  return `${y}-${mo}-${d} ${h}:${mi}`
}

/**
 * Одна строка для показа и поиска — только из того, что прочитано.
 * Пустая строка, если читать было нечего.
 */
export function describeImageMeta(size, exif = {}) {
  const parts = []
  if (size?.width && size?.height) parts.push(`Изображение ${size.width}×${size.height}`)
  if (exif.dateTime) parts.push(`снято ${exif.dateTime}`)
  const camera = cameraName(exif)
  if (camera) parts.push(camera)
  return parts.join(' · ')
}

/** «NIKON» + «NIKON D750» → «NIKON D750»: производитель уже внутри модели. */
export function cameraName({ make = '', model = '' } = {}) {
  if (!make && !model) return ''
  if (!model) return make
  if (make && model.toLowerCase().startsWith(make.toLowerCase())) return model
  return [make, model].filter(Boolean).join(' ')
}
