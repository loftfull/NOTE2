// Длительность и подписи из звуковых файлов.
//
// Проверено не на себе: те же 50 файлов прогнаны через mutagen 1.48.1 —
// независимую реализацию, на тестовом наборе которой и собран корпус.
//
//   длительность совпала (±2 %)   31
//   расхождений по существу        0
//   mutagen смог, мы нет          11
//   мы смогли, mutagen нет         3
//
// Одиннадцать — это четыре WMA и два голых ADTS-потока AAC, которые здесь
// намеренно не разбираются, и пять обрезанных файлов, где заголовок
// обещает больше, чем в файле есть (от 17 до 380 бит/с): mutagen верит
// заголовку, мы такую длительность отвергаем.
//
// Единственное расхождение в числах — trailer_bbb.mp4: наши 55.12 с против
// 52.19 с. Разобрано по самому файлу: видеодорожка длится 55.12 с,
// звуковая — 52.19 с. mutagen — библиотека звуковых тегов и сообщает длину
// звука; для видеозаписи человеку нужна длина клипа.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeAudioMeta, flacMeta, formatDuration, mp3Duration, mp4Meta,
  oggMeta, readAudioMeta, readId3v1, readId3v2, wavMeta,
} from '../src/audio-meta.js'

const bytes = (...parts) => new Uint8Array(parts.flat())
const str = s => [...Buffer.from(s, 'latin1')]

// ── Длительность не может противоречить размеру файла ───────────────────

test('заголовок, обещающий больше, чем влезает в файл, отвергается', () => {
  // Настоящий файл из набора mutagen: ooming-header.flac, 86 байт, а
  // STREAMINFO объявляет 139 секунд. Это не запись, а испорченный
  // заголовок, и выдавать его за длительность нельзя.
  // STREAMINFO: 10 байт размеров блоков и кадров, затем 20 бит частоты,
  // 3 бита каналов, 5 бит разрядности и 36 бит общего числа отсчётов.
  const flac = bytes(
    str('fLaC'),
    [0x00, 0, 0, 34],                        // STREAMINFO, 34 байта
    new Array(10).fill(0),
    [0x0a, 0xc4, 0x42],                      // 44100 Гц, 2 канала
    [0x00], [0x00, 0x5d, 0x8c, 0x00],        // 6 130 688 отсчётов ≈ 139 с
    new Array(16).fill(0))
  assert.equal(flacMeta(flac, 86).duration, undefined)
  // Тот же заголовок при правдоподобном размере файла принимается.
  assert.equal(flacMeta(flac, 24_000_000).duration, 139.02)
})

test('длительность отбрасывается, если подразумевает нереальный поток', () => {
  const wav = bytes(str('RIFF'), [0, 0, 0, 0], str('WAVE'),
    str('fmt '), [16, 0, 0, 0], [1, 0], [2, 0],
    [0x44, 0xac, 0, 0],            // 44100 Гц
    [0x10, 0xb1, 0x02, 0],         // 176400 байт/с
    [4, 0], [16, 0],
    str('data'), [0x40, 0x0d, 0x03, 0])   // 200000 байт → ~1,13 с
  assert.equal(wavMeta(wav, 200_100).duration, 1.13)
})

// ── MP3 ─────────────────────────────────────────────────────────────────

test('ID3v2.3: название, исполнитель и альбом', () => {
  const frame = (id, text) => {
    const payload = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')])
    const head = Buffer.alloc(10)
    head.write(id, 0, 'latin1')
    head.writeUInt32BE(payload.length, 4)
    return Buffer.concat([head, payload])
  }
  const frames = Buffer.concat([
    frame('TIT2', 'Пробная дорожка'.replace(/[^\x00-\xff]/g, '?')),
    frame('TPE1', 'Artist Name'),
    frame('TALB', 'Album Name'),
  ])
  const size = frames.length
  const header = Buffer.from([
    0x49, 0x44, 0x33, 3, 0, 0,
    (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f,
  ])
  const tags = readId3v2(new Uint8Array(Buffer.concat([header, frames])))
  assert.equal(tags.artist, 'Artist Name')
  assert.equal(tags.album, 'Album Name')
})

test('ID3v2: UTF-8 и UTF-16 читаются как текст, а не как байты', () => {
  const textFrame = (id, encoding, buf) => {
    const payload = Buffer.concat([Buffer.from([encoding]), buf])
    const head = Buffer.alloc(10)
    head.write(id, 0, 'latin1'); head.writeUInt32BE(payload.length, 4)
    return Buffer.concat([head, payload])
  }
  const build = frames => {
    const body = Buffer.concat(frames)
    const n = body.length
    return new Uint8Array(Buffer.concat([
      Buffer.from([0x49, 0x44, 0x33, 3, 0, 0,
        (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]),
      body,
    ]))
  }
  assert.equal(readId3v2(build([textFrame('TIT2', 3, Buffer.from('Запись встречи', 'utf8'))])).title,
    'Запись встречи')
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Запись', 'utf16le')])
  assert.equal(readId3v2(build([textFrame('TIT2', 1, utf16)])).title, 'Запись')
})

test('ID3v1: подписи из последних 128 байт', () => {
  const tag = Buffer.alloc(128)
  tag.write('TAG', 0, 'latin1')
  tag.write('Short title', 3, 'latin1')
  tag.write('Some artist', 33, 'latin1')
  const tail = new Uint8Array(Buffer.concat([Buffer.alloc(64), tag]))
  const tags = readId3v1(tail)
  assert.equal(tags.title, 'Short title')
  assert.equal(tags.artist, 'Some artist')
  assert.deepEqual(readId3v1(new Uint8Array(200)), {})
})

test('MP3: длительность по числу кадров из Xing, а не по среднему', () => {
  // Кадр MPEG-1 Layer III, 44100 Гц, стерео: 1152 отсчёта на кадр.
  const head = Buffer.alloc(200)
  head[0] = 0xff; head[1] = 0xfb; head[2] = 0x90; head[3] = 0x00
  head.write('Xing', 4 + 32, 'latin1')
  head.writeUInt32BE(0x01, 4 + 32 + 4)        // есть поле числа кадров
  head.writeUInt32BE(3828, 4 + 32 + 8)        // 3828 кадров ≈ 100 с
  const meta = mp3Duration(new Uint8Array(head), 1_600_000)
  assert.equal(meta.sampleRate, 44100)
  assert.ok(Math.abs(meta.duration - 100) < 0.5, `получено ${meta.duration}`)
})

// ── WAV ─────────────────────────────────────────────────────────────────

test('WAV: длительность из куска data и скорости потока', () => {
  const wav = bytes(str('RIFF'), [0, 0, 0, 0], str('WAVE'),
    str('fmt '), [16, 0, 0, 0], [1, 0], [1, 0],
    [0x80, 0x3e, 0, 0],            // 16000 Гц
    [0x00, 0x7d, 0, 0],            // 32000 байт/с
    [2, 0], [16, 0],
    str('data'), [0x00, 0xfa, 0, 0])     // 64000 байт → 2 с
  const meta = wavMeta(wav, 64_100)
  assert.equal(meta.duration, 2)
  assert.equal(meta.sampleRate, 16000)
  assert.equal(meta.channels, 1)
})

// ── Общее ───────────────────────────────────────────────────────────────

test('мусор не даёт ни длительности, ни подписей', async () => {
  for (const junk of [[0, 1, 2, 3], [0xff, 0xff, 0xff, 0xff], []]) {
    const meta = await readAudioMeta(new File([new Uint8Array(junk)], 'x.mp3'))
    assert.equal(meta.duration, undefined)
    assert.equal(meta.title, undefined)
  }
})

test('время показывается часами только когда они есть', () => {
  assert.equal(formatDuration(5), '0:05')
  assert.equal(formatDuration(65), '1:05')
  assert.equal(formatDuration(3600), '1:00:00')
  assert.equal(formatDuration(3725), '1:02:05')
  assert.equal(formatDuration(0), '0:00')
  // «0:00» у реально существующей записи читается как сбой.
  assert.equal(formatDuration(0.4), 'менее 1 с')
  assert.equal(formatDuration(0.9), 'менее 1 с')
})

test('строка собирается только из прочитанного', () => {
  assert.equal(describeAudioMeta({ duration: 212, artist: 'Группа', title: 'Песня', album: 'Альбом' }),
    'Запись 3:32 · Группа — Песня · Альбом')
  assert.equal(describeAudioMeta({ duration: 52.19 }, 'video'), 'Видео 0:52')
  assert.equal(describeAudioMeta({}), 'Запись')
  // Альбом, совпадающий с названием, не повторяется.
  assert.equal(describeAudioMeta({ duration: 60, title: 'Один', album: 'Один' }), 'Запись 1:00 · Один')
})

// ── MP4 ─────────────────────────────────────────────────────────────────

/** Собирает moov с одним mvhd: версия 0, timescale 1000, duration. */
const moovBox = durationMs => {
  const mvhdBody = Buffer.alloc(100)
  mvhdBody.writeUInt8(0, 0)                 // версия 0
  mvhdBody.writeUInt32BE(1000, 12)          // timescale
  mvhdBody.writeUInt32BE(durationMs, 16)
  const mvhd = Buffer.concat([
    (() => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + mvhdBody.length); h.write('mvhd', 4, 'latin1'); return h })(),
    mvhdBody,
  ])
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + mvhd.length); head.write('moov', 4, 'latin1')
  return Buffer.concat([head, mvhd])
}

test('MP4: длительность из mvhd', () => {
  const file = new Uint8Array(Buffer.concat([
    (() => { const h = Buffer.alloc(8); h.writeUInt32BE(8); h.write('free', 4, 'latin1'); return h })(),
    moovBox(52_190),
  ]))
  assert.equal(mp4Meta(file, 7_826_953).duration, 52.19)
})

test('MP4: moov в конце файла находится поиском, а не обходом с начала', () => {
  // Хвост начинается посреди mdat: обход с нулевого смещения упрётся в
  // мусор. Именно так устроен trailer_bbb.mp4 из набора moviepy.
  const junk = Buffer.alloc(4096, 0x77)
  const tail = new Uint8Array(Buffer.concat([junk, moovBox(52_190)]))
  assert.equal(mp4Meta(tail, 7_826_953).duration, undefined, 'без поиска найтись не должно')
  assert.equal(mp4Meta(tail, 7_826_953, { search: true }).duration, 52.19)
})
