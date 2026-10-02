// Определение вида файла. Дефекты найдены прогоном 902 настоящих файлов из
// чужих тестовых наборов (Pillow 12.3.0, mutagen 1.48.1, python-docx 1.2.0,
// moviepy 2.2.1) — см. tools/corpus/README.md.
//
// Главный из них: вид медиа определялся ИСКЛЮЧИТЕЛЬНО по File.type. Когда
// он пустой — а на Android и у части провайдеров файлов это обычное дело —
// любая фотография, запись и видео становились «неизвестным двоичным
// форматом». Это не только неверная подпись: importFiles вызывает
// enrichWithConnector только для видов image/audio/video, поэтому снимок,
// выбранный на телефоне, молча не попадал в распознавание вообще.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferKind, sniffKind, parseLocalFile } from '../src/ingest.js'

const kind = (name, type = '') => inferKind({ name, type })

// ── По расширению, когда типа нет ───────────────────────────────────────

const BY_EXTENSION = [
  ['изображения', 'image', ['snapshot.png', 'photo.jpg', 'photo.jpeg', 'scan.tif',
    'scan.tiff', 'icon.bmp', 'icon.ico', 'anim.gif', 'shot.webp', 'shot.avif',
    'photo.heic', 'photo.heif', 'raw.jfif']],
  ['аудио', 'audio', ['track.mp3', 'track.m4a', 'track.aac', 'track.flac',
    'track.ogg', 'track.opus', 'track.wav', 'track.wma', 'track.oga', 'track.weba']],
  ['видео', 'video', ['clip.mp4', 'clip.m4v', 'clip.mov', 'clip.webm',
    'clip.mkv', 'clip.avi', 'clip.3gp']],
]

for (const [label, expected, names] of BY_EXTENSION) {
  test(`${label}: вид определяется по расширению, когда File.type пустой`, () => {
    for (const name of names) {
      assert.equal(kind(name), expected, `${name} → ${kind(name)}, ожидалось ${expected}`)
    }
  })
}

test('тип из браузера по-прежнему главнее расширения', () => {
  // Файл с расширением .bin, но браузер знает, что это изображение.
  assert.equal(kind('dump.bin', 'image/png'), 'image')
  assert.equal(kind('dump.bin', 'audio/mpeg'), 'audio')
  assert.equal(kind('dump.bin', 'video/mp4'), 'video')
})

test('неизвестное расширение остаётся неизвестным', () => {
  assert.equal(kind('proshivka.bin'), 'binary')
  assert.equal(kind('archive.7z'), 'binary')
  assert.equal(kind('noextension'), 'binary')
})

// ── SVG — разметка, а не растр ──────────────────────────────────────────

test('SVG читается как разметка, а не отправляется в распознавание', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">'
    + '<title>Схема обработки</title><style>text{font:12px sans-serif}</style>'
    + '<text x="10" y="30">Источник попадает в индекс</text></svg>'
  const source = await parseLocalFile(new File([svg], 'shema.svg', { type: 'image/svg+xml' }))
  assert.equal(source.kind, 'svg')
  assert.equal(source.status, 'ready')
  assert.match(source.text, /Источник попадает в индекс/)
  assert.match(source.text, /Схема обработки/)
  assert.ok(!source.text.includes('font:12px'), 'содержимое <style> просочилось')
})

// ── Содержимое важнее имени ─────────────────────────────────────────────

const head = bytes => new File([new Uint8Array(bytes)], 'bez-rasshireniya', { type: '' })

test('вид определяется по сигнатуре, когда нет ни типа, ни расширения', async () => {
  const cases = [
    ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'image'],
    ['JPEG', [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1], 'image'],
    ['GIF', [...Buffer.from('GIF89a'), 1, 0, 1, 0, 0, 0, 0], 'image'],
    ['BMP', [0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'image'],
    ['TIFF', [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0, 0, 0], 'image'],
    ['MP3 с тегом ID3', [...Buffer.from('ID3'), 3, 0, 0, 0, 0, 0, 0, 0, 0], 'audio'],
    ['Ogg', [...Buffer.from('OggS'), 0, 2, 0, 0, 0, 0, 0, 0, 0], 'audio'],
    ['FLAC', [...Buffer.from('fLaC'), 0, 0, 0, 34, 0, 0, 0, 0, 0], 'audio'],
    ['PDF', [...Buffer.from('%PDF-1.7'), 0x0a, 0x25, 0, 0], 'pdf'],
  ]
  for (const [label, bytes, expected] of cases) {
    assert.equal(await sniffKind(head(bytes)), expected, `${label} → ожидалось ${expected}`)
  }
})

test('MP4 и WebM различаются по контейнеру', async () => {
  const mp4 = [0, 0, 0, 0x20, ...Buffer.from('ftypisom'), 0, 0, 2, 0, ...Buffer.from('isomiso2')]
  assert.equal(await sniffKind(head(mp4)), 'video')
  const m4a = [0, 0, 0, 0x20, ...Buffer.from('ftypM4A '), 0, 0, 0, 0, ...Buffer.from('M4A mp42')]
  assert.equal(await sniffKind(head(m4a)), 'audio')
  const webm = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0, 0, 0, 0, 0, 0, 0x1f]
  assert.equal(await sniffKind(head(webm)), 'video')
})

test('RIFF различает WAV и WebP', async () => {
  const wav = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVEfmt ')]
  assert.equal(await sniffKind(head(wav)), 'audio')
  const webp = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]
  assert.equal(await sniffKind(head(webp)), 'image')
})

test('сигнатура ничего не меняет, когда вид и так известен', async () => {
  // Текстовый файл с именем и типом не должен пересматриваться по байтам.
  const file = new File(['просто текст'], 'zametka.txt', { type: 'text/plain' })
  assert.equal(await sniffKind(file), 'text')
})

test('файл без узнаваемой сигнатуры остаётся неизвестным', async () => {
  assert.equal(await sniffKind(head([0x13, 0x37, 0x42, 0x00, 1, 2, 3, 4, 5, 6, 7, 8])), 'binary')
})

// ── Сквозная проверка: снимок с телефона доходит до распознавания ───────

test('снимок без типа получает вид image, а не «двоичный формат»', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const source = await parseLocalFile(new File([png], 'IMG_20261002_084500.jpg', { type: '' }))
  assert.equal(source.kind, 'image')
  assert.equal(source.status, 'needs-connector')
  assert.match(source.error, /расшифровка и распознавание/)
})
