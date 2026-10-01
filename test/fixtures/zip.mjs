// Минимальный сборщик ZIP для тестов: DOCX, XLSX, PPTX, ODT и EPUB — это zip,
// и проверять их разбор надо на настоящем контейнере, а не на подставленном
// разборщике. Записи кладутся без сжатия (метод 0) — archive-text.js его
// поддерживает, и так тест не зависит от DecompressionStream.
import zlib from 'node:zlib'

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

/**
 * @param entries [name, contents, { store }] — contents: строка или Uint8Array.
 *   store: true — без сжатия (обязательно для mimetype в ODF и EPUB).
 */
export function zip(entries) {
  const locals = []
  const central = []
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
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(body, 30 + nameBytes.length)
    locals.push(local)

    const dir = new Uint8Array(46 + nameBytes.length)
    const dv = new DataView(dir.buffer)
    dv.setUint32(0, 0x02014b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, 20, true)
    dv.setUint16(10, method, true)
    dv.setUint32(16, crc, true)
    dv.setUint32(20, body.length, true)
    dv.setUint32(24, raw.length, true)
    dv.setUint16(28, nameBytes.length, true)
    dv.setUint32(42, offset, true)
    dir.set(nameBytes, 46)
    central.push(dir)

    offset += local.length
  }

  const centralSize = central.reduce((n, d) => n + d.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = offset + centralSize + eocd.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...central, eocd]) { out.set(part, at); at += part.length }
  return out
}
