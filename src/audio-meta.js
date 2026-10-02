// Технические сведения из звуковых и видеофайлов: длительность и подписи.
//
// Та же причина, что у изображений: запись, добавленная без настроенного
// сервиса расшифровки, оставалась строкой с именем файла. Длительность —
// первое, что человек хочет знать о записи, и она лежит в самом файле.
//
// Граница та же: это сведения из заголовка, а не содержание. Расшифровку
// по-прежнему делает только сервис, и статус остаётся needs-connector.
//
// Форматы разбираются вручную, без библиотеки. WMA/ASF и голый ADTS-поток
// AAC не разбираются: первый требует обхода объектов ASF, второй — прохода
// по кадрам через весь файл. Честнее вернуть пусто, чем угадать.

const ascii = (b, from, length) => {
  let out = ''
  for (let i = from; i < from + length && i < b.length; i += 1) out += String.fromCharCode(b[i])
  return out
}
const u16be = (b, i) => (b[i] << 8) | b[i + 1]
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
const u64be = (b, i) => u32be(b, i) * 2 ** 32 + u32be(b, i + 4)

const utf8 = (b, from, length) => {
  try { return new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(from, from + length)) }
  catch { return ascii(b, from, length) }
}

const clean = value => String(value || '').replace(/\0.*$/s, '').replace(/\s+/g, ' ').trim()

// Самый скупой поток, который встречается у настоящего звука, — речевой
// Opus около 6 кбит/с. Порог взят на порядок ниже, чтобы наверняка не
// задеть живые файлы и при этом отсечь явную ложь заголовка.
const MIN_BITS_PER_SECOND = 1000

/**
 * Длительность правдоподобна: от десятой доли секунды до суток, и — если
 * известен размер файла — не больше, чем в него физически помещается.
 *
 * Последнее не придирка. В наборе mutagen есть ooming-header.flac: 86 байт,
 * а STREAMINFO объявляет 139 секунд. Без этой проверки приложение показало
 * бы «Запись 2:19» там, где записи нет вовсе, — то есть выдумало бы факт.
 */
const sane = (seconds, bytes = 0) => {
  if (!Number.isFinite(seconds) || seconds <= 0.05 || seconds >= 24 * 3600) return undefined
  if (bytes > 0 && bytes * 8 / seconds < MIN_BITS_PER_SECOND) return undefined
  return Math.round(seconds * 100) / 100
}

// ── MP3 ─────────────────────────────────────────────────────────────────

const ID3_FRAMES = {
  TIT2: 'title', TPE1: 'artist', TALB: 'album',
  TT2: 'title', TP1: 'artist', TAL: 'album',   // ID3v2.2 — трёхбуквенные
}

/** Подписи из ID3v2 в голове файла. */
export function readId3v2(b) {
  if (ascii(b, 0, 3) !== 'ID3') return {}
  const major = b[3]
  if (major < 2 || major > 4) return {}
  // Размер синхробезопасный: по семь значащих бит в байте.
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
  const end = Math.min(10 + size, b.length)
  const idLength = major === 2 ? 3 : 4
  const headerLength = major === 2 ? 6 : 10
  const out = {}
  let at = 10
  while (at + headerLength <= end) {
    const id = ascii(b, at, idLength)
    if (!/^[A-Z0-9]+$/.test(id)) break
    const frameSize = major === 2
      ? (b[at + 3] << 16) | (b[at + 4] << 8) | b[at + 5]
      : major === 4
        // В 2.4 размер тоже синхробезопасный — в 2.3 обычный.
        ? ((b[at + 4] & 0x7f) << 21) | ((b[at + 5] & 0x7f) << 14) | ((b[at + 6] & 0x7f) << 7) | (b[at + 7] & 0x7f)
        : u32be(b, at + 4)
    if (frameSize <= 0 || at + headerLength + frameSize > end) break
    const field = ID3_FRAMES[id]
    if (field && !out[field]) {
      const value = decodeTextFrame(b, at + headerLength, frameSize)
      if (value) out[field] = value
    }
    at += headerLength + frameSize
  }
  return out
}

function decodeTextFrame(b, at, length) {
  if (length < 2) return ''
  const encoding = b[at]
  const from = at + 1
  const size = length - 1
  // 0 — latin1, 1 — UTF-16 с меткой порядка, 2 — UTF-16BE, 3 — UTF-8.
  if (encoding === 0) return clean(ascii(b, from, size))
  if (encoding === 3) return clean(utf8(b, from, size))
  if (encoding === 1 || encoding === 2) {
    let i = from, big = encoding === 2
    if (encoding === 1) {
      if (b[i] === 0xff && b[i + 1] === 0xfe) { big = false; i += 2 }
      else if (b[i] === 0xfe && b[i + 1] === 0xff) { big = true; i += 2 }
    }
    let out = ''
    for (; i + 1 < at + length; i += 2) {
      const code = big ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8)
      if (code === 0) break
      out += String.fromCharCode(code)
    }
    return clean(out)
  }
  return ''
}

/** Подписи из ID3v1 — 128 байт в самом конце файла. */
export function readId3v1(tail) {
  const at = tail.length - 128
  if (at < 0 || ascii(tail, at, 3) !== 'TAG') return {}
  const out = {}
  const title = clean(ascii(tail, at + 3, 30))
  const artist = clean(ascii(tail, at + 33, 30))
  const album = clean(ascii(tail, at + 63, 30))
  if (title) out.title = title
  if (artist) out.artist = artist
  if (album) out.album = album
  return out
}

const MPEG_RATES = {
  1: [44100, 48000, 32000],   // MPEG-1
  2: [22050, 24000, 16000],   // MPEG-2
  0: [11025, 12000, 8000],    // MPEG-2.5
}
// Килобиты в секунду по индексу, MPEG-1 Layer III и MPEG-2 Layer III.
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]

/**
 * Длительность MP3. У файлов с переменным битрейтом считать по среднему
 * нельзя — для них в первом кадре лежит заголовок Xing или VBRI с числом
 * кадров; у постоянного битрейта остаётся деление размера на скорость.
 */
export function mp3Duration(b, totalBytes = 0) {
  const start = findFrame(b)
  if (start < 0) return {}
  const header = parseFrameHeader(b, start)
  if (!header) return {}

  const xing = findXing(b, start, header)
  if (xing?.frames) {
    const seconds = xing.frames * header.samplesPerFrame / header.sampleRate
    return { duration: sane(seconds, totalBytes), sampleRate: header.sampleRate, channels: header.channels }
  }
  // Постоянный битрейт: вычитаем теги, остальное делим на скорость потока.
  const audioBytes = Math.max(0, (totalBytes || b.length) - start)
  const seconds = audioBytes * 8 / (header.bitrate * 1000)
  return { duration: sane(seconds, totalBytes), sampleRate: header.sampleRate, channels: header.channels, bitrate: header.bitrate }
}

function findFrame(b) {
  // Пропускаем тег ID3v2, если он есть: внутри него встречаются байты,
  // похожие на начало кадра.
  let at = 0
  if (ascii(b, 0, 3) === 'ID3') {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
    at = 10 + size
  }
  for (let i = at; i + 4 < b.length && i < at + 200_000; i += 1) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0 && parseFrameHeader(b, i)) return i
  }
  return -1
}

function parseFrameHeader(b, at) {
  if (at + 4 > b.length) return null
  if (b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return null
  const versionBits = (b[at + 1] >> 3) & 0x03
  const layerBits = (b[at + 1] >> 1) & 0x03
  if (versionBits === 1 || layerBits === 0) return null        // зарезервировано
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 0
  const rateIndex = (b[at + 2] >> 2) & 0x03
  if (rateIndex === 3) return null
  const sampleRate = MPEG_RATES[version][rateIndex]
  const bitrateIndex = (b[at + 2] >> 4) & 0x0f
  const table = version === 1 ? BITRATES_V1_L3 : BITRATES_V2_L3
  const bitrate = table[bitrateIndex]
  if (!bitrate || !sampleRate) return null
  const channels = ((b[at + 3] >> 6) & 0x03) === 3 ? 1 : 2
  // Layer III: 1152 отсчёта на кадр у MPEG-1 и 576 у MPEG-2/2.5.
  const samplesPerFrame = layerBits === 1 ? (version === 1 ? 1152 : 576) : 1152
  return { sampleRate, bitrate, channels, samplesPerFrame, version }
}

function findXing(b, frameStart, header) {
  // Заголовок лежит за боковой информацией кадра, её длина зависит от
  // версии и числа каналов.
  const sideInfo = header.version === 1 ? (header.channels === 1 ? 17 : 32) : (header.channels === 1 ? 9 : 17)
  const at = frameStart + 4 + sideInfo
  const tag = ascii(b, at, 4)
  if (tag === 'Xing' || tag === 'Info') {
    const flags = u32be(b, at + 4)
    if (!(flags & 1)) return {}
    return { frames: u32be(b, at + 8) }
  }
  if (ascii(b, frameStart + 4 + 32, 4) === 'VBRI') {
    return { frames: u32be(b, frameStart + 4 + 32 + 14) }
  }
  return {}
}

// ── FLAC ────────────────────────────────────────────────────────────────

export function flacMeta(b, totalBytes = 0) {
  if (ascii(b, 0, 4) !== 'fLaC') return {}
  const out = {}
  let at = 4
  while (at + 4 <= b.length) {
    const last = (b[at] & 0x80) !== 0
    const type = b[at] & 0x7f
    const size = (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]
    const body = at + 4
    if (body + size > b.length) break
    if (type === 0 && size >= 18) {
      // STREAMINFO: частота — 20 бит, затем каналы и число отсчётов (36 бит).
      const sampleRate = (b[body + 10] << 12) | (b[body + 11] << 4) | (b[body + 12] >> 4)
      const channels = ((b[body + 12] >> 1) & 0x07) + 1
      const totalSamples = ((b[body + 13] & 0x0f) * 2 ** 32) + u32be(b, body + 14)
      if (sampleRate > 0) {
        out.sampleRate = sampleRate
        out.channels = channels
        if (totalSamples > 0) out.duration = sane(totalSamples / sampleRate, totalBytes)
      }
    } else if (type === 4) {
      Object.assign(out, vorbisComments(b, body, size))
    }
    if (last) break
    at = body + size
  }
  return out
}

const VORBIS_FIELDS = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album' }

function vorbisComments(b, at, size) {
  const end = Math.min(at + size, b.length)
  let i = at
  const vendorLength = u32le(b, i); i += 4 + vendorLength
  if (i + 4 > end) return {}
  const count = u32le(b, i); i += 4
  if (count > 512) return {}
  const out = {}
  for (let n = 0; n < count && i + 4 <= end; n += 1) {
    const length = u32le(b, i); i += 4
    if (length < 0 || i + length > end) break
    const entry = utf8(b, i, length)
    i += length
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    const field = VORBIS_FIELDS[entry.slice(0, eq).toUpperCase()]
    if (field && !out[field]) {
      const value = clean(entry.slice(eq + 1))
      if (value) out[field] = value
    }
  }
  return out
}

// ── WAV ─────────────────────────────────────────────────────────────────

export function wavMeta(b, totalBytes = 0) {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WAVE') return {}
  let at = 12
  let sampleRate = 0, channels = 0, byteRate = 0
  while (at + 8 <= b.length) {
    const id = ascii(b, at, 4)
    const size = u32le(b, at + 4)
    if (size < 0) break
    if (id === 'fmt ' && at + 8 + 16 <= b.length) {
      channels = b[at + 10] | (b[at + 11] << 8)
      sampleRate = u32le(b, at + 12)
      byteRate = u32le(b, at + 16)
    } else if (id === 'data' && byteRate > 0) {
      return { duration: sane(size / byteRate, totalBytes), sampleRate, channels }
    }
    // Куски выравниваются по чётной границе.
    at += 8 + size + (size % 2)
  }
  return sampleRate ? { sampleRate, channels } : {}
}

// ── MP4 / M4A ───────────────────────────────────────────────────────────

const MP4_TEXT_ATOMS = { '©nam': 'title', '©ART': 'artist', '©alb': 'album' }

/** Обходит дерево боксов в поисках mvhd и подписей в ilst. */
export function mp4Meta(b, totalBytes = 0, { search = false } = {}) {
  const out = {}
  // Обычный путь: обход с начала среза.
  walkAtoms(b, 0, b.length, 0, out, totalBytes)
  if (out.duration || !search) return out

  // Хвост файла начинается не с границы бокса, а посреди mdat, поэтому
  // обход с нулевого смещения сразу упирается в мусор. У файлов, не
  // готовленных для потоковой отдачи, moov лежит в конце — ищем его по
  // сигнатуре и идём уже оттуда. Так разбирается, например, 52-секундный
  // trailer_bbb.mp4 из набора moviepy: moov там в последних 46 КБ.
  const at = findMoov(b)
  if (at >= 0) walkAtoms(b, at, b.length, 0, out, totalBytes)
  return out
}

function findMoov(b) {
  for (let i = 4; i + 8 < b.length; i += 1) {
    if (b[i] !== 0x6d || b[i + 1] !== 0x6f || b[i + 2] !== 0x6f || b[i + 3] !== 0x76) continue
    const size = u32be(b, i - 4)
    if (size >= 8 && i - 4 + size <= b.length) return i - 4
  }
  return -1
}

function walkAtoms(b, from, to, depth, out, totalBytes = 0) {
  if (depth > 6) return
  let at = from
  while (at + 8 <= to) {
    let size = u32be(b, at)
    const type = ascii(b, at + 4, 4)
    let body = at + 8
    if (size === 1) {                    // 64-битный размер
      if (at + 16 > to) return
      size = u64be(b, at + 8)
      body = at + 16
    } else if (size === 0) {
      size = to - at                     // бокс до конца файла
    }
    if (size < 8 || at + size > to) return

    if (type === 'mvhd') {
      const version = b[body]
      const timescale = version === 1 ? u32be(b, body + 20) : u32be(b, body + 12)
      const duration = version === 1 ? u64be(b, body + 24) : u32be(b, body + 16)
      if (timescale > 0) out.duration = sane(duration / timescale, totalBytes)
    } else if (MP4_TEXT_ATOMS[type]) {
      // Подпись лежит во вложенном боксе data: 8 байт заголовка плюс
      // четыре байта вида и четыре — локали.
      const value = clean(utf8(b, body + 16, Math.max(0, size - 24)))
      const field = MP4_TEXT_ATOMS[type]
      if (value && !out[field]) out[field] = value
    } else if (['moov', 'trak', 'mdia', 'udta', 'meta', 'ilst'].includes(type)) {
      // meta — бокс с версией: четыре лишних байта перед детьми.
      walkAtoms(b, type === 'meta' ? body + 4 : body, at + size, depth + 1, out, totalBytes)
    }
    at += size
  }
}

// ── Ogg (Vorbis и Opus) ─────────────────────────────────────────────────

/**
 * Длительность Ogg считается по позиции последней страницы: число
 * отсчётов с начала потока. Поэтому нужен хвост файла, а не только голова.
 */
export function oggMeta(head, tail, totalBytes = 0) {
  if (ascii(head, 0, 4) !== 'OggS') return {}
  const out = {}
  let rate = 0
  let preSkip = 0

  const first = findPagePayload(head, 0)
  if (first) {
    if (ascii(head, first.at, 8) === 'OpusHead') {
      rate = 48000                                  // Opus всегда в 48 кГц
      preSkip = head[first.at + 10] | (head[first.at + 11] << 8)
      out.channels = head[first.at + 9]
    } else if (ascii(head, first.at + 1, 6) === 'vorbis') {
      out.channels = head[first.at + 11]
      rate = u32le(head, first.at + 12)
    }
  }
  if (!rate) return out
  out.sampleRate = rate

  // Подписи лежат во втором заголовочном пакете; он почти всегда на второй
  // или третьей странице, так что ищем в пределах головы.
  for (let i = 0; i + 16 < head.length; i += 1) {
    if (ascii(head, i, 8) === 'OpusTags') { Object.assign(out, vorbisComments(head, i + 8, head.length - i - 8)); break }
    if (head[i] === 3 && ascii(head, i + 1, 6) === 'vorbis') {
      Object.assign(out, vorbisComments(head, i + 7, head.length - i - 7)); break
    }
  }

  const granule = lastGranule(tail && tail.length ? tail : head)
  if (granule > 0) out.duration = sane(Math.max(0, granule - preSkip) / rate, totalBytes)
  return out
}

function findPagePayload(b, from) {
  for (let i = from; i + 27 < b.length; i += 1) {
    if (ascii(b, i, 4) !== 'OggS') continue
    const segments = b[i + 26]
    const at = i + 27 + segments
    return at < b.length ? { at } : null
  }
  return null
}

function lastGranule(b) {
  for (let i = b.length - 27; i >= 0; i -= 1) {
    if (ascii(b, i, 4) !== 'OggS') continue
    // Позиция — 64 бита с обратным порядком байтов, по смещению 6.
    const low = u32le(b, i + 6)
    const high = u32le(b, i + 10)
    const granule = high * 2 ** 32 + low
    if (granule > 0 && Number.isFinite(granule)) return granule
  }
  return 0
}

// ── Сборка ──────────────────────────────────────────────────────────────

/** Сколько головы и хвоста файла читать: заголовки лежат по краям. */
export const AUDIO_HEAD_BYTES = 1024 * 1024
export const AUDIO_TAIL_BYTES = 256 * 1024

/**
 * Сведения о звуке или видео из самого файла.
 * @returns {{duration?: number, sampleRate?: number, channels?: number,
 *            title?: string, artist?: string, album?: string}}
 */
export async function readAudioMeta(file) {
  try {
    const size = Number(file.size || 0)
    const head = new Uint8Array(await file.slice(0, AUDIO_HEAD_BYTES).arrayBuffer())
    const needsTail = size > AUDIO_HEAD_BYTES
    const tail = needsTail
      ? new Uint8Array(await file.slice(Math.max(0, size - AUDIO_TAIL_BYTES)).arrayBuffer())
      : head

    if (ascii(head, 0, 4) === 'fLaC') return flacMeta(head, size)
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return wavMeta(head, size)
    if (ascii(head, 0, 4) === 'OggS') return oggMeta(head, tail, size)
    if (ascii(head, 4, 4) === 'ftyp') {
      // moov лежит либо в начале, либо в конце — у файлов, не готовленных
      // для потоковой отдачи, он в конце.
      const fromHead = mp4Meta(head, size)
      if (fromHead.duration) return fromHead
      return { ...mp4Meta(tail, size, { search: true }), ...fromHead }
    }
    if (ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
      return { ...readId3v1(tail), ...readId3v2(head), ...mp3Duration(head, size) }
    }
    return {}
  } catch {
    return {}
  }
}

/** Одна строка только из прочитанного. */
export function describeAudioMeta(meta = {}, kind = 'audio') {
  const parts = []
  const label = kind === 'video' ? 'Видео' : 'Запись'
  parts.push(meta.duration ? `${label} ${formatDuration(meta.duration)}` : label)
  const credit = [meta.artist, meta.title].filter(Boolean).join(' — ')
  if (credit) parts.push(credit)
  if (meta.album && meta.album !== meta.title) parts.push(meta.album)
  return parts.join(' · ')
}

export function formatDuration(seconds) {
  const value = Number(seconds) || 0
  // «0:00» читается как сбой, хотя запись просто очень короткая.
  if (value > 0 && value < 1) return 'менее 1 с'
  const total = Math.round(value)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = n => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
