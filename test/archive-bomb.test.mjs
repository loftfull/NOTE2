// Regression tests for the decompression cap in src/archive-text.js.
//
// The defect these pin down: inflateRaw() piped the whole entry through
// new Response(stream).arrayBuffer(), which materialises everything before the
// size is known. A deflate stream expands by up to ~1000x, so a small crafted
// DOCX/XLSX/EPUB could claim gigabytes and take down the tab along with the
// user's unsaved editor state. The declared size in the ZIP header was read
// but never enforced.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { extractZipEntry, MAX_ENTRY_BYTES } from '../src/archive-text.js'

// Builds a ZIP containing a single stored-or-deflated entry, and the matching
// central-directory record that listZipEntries would have produced for it.
function zipWithEntry(name, raw, { method = 8, declaredSize = null } = {}) {
  const body = method === 8 ? deflateRawSync(raw) : Buffer.from(raw)
  const nameBuf = Buffer.from(name, 'utf8')
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(method, 8)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(body.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBuf.length, 26)
  header.writeUInt16LE(0, 28)
  const bytes = new Uint8Array(Buffer.concat([header, nameBuf, body]))
  const entry = {
    name,
    method,
    compressedSize: body.length,
    size: declaredSize === null ? raw.length : declaredSize,
    localOffset: 0
  }
  return { bytes, entry }
}

test('a normal entry still round-trips', async () => {
  const raw = Buffer.from('<w:document>Обычный документ</w:document>', 'utf8')
  const { bytes, entry } = zipWithEntry('word/document.xml', raw)
  const out = await extractZipEntry(bytes, entry)
  assert.equal(Buffer.from(out).toString('utf8'), raw.toString('utf8'))
})

test('a highly compressible entry is rejected once it passes its declared size', async () => {
  // 8 MB of zeros deflates to a few KB — the shape of a decompression bomb.
  const raw = Buffer.alloc(8 * 1024 * 1024, 0)
  // The header understates the real size, so the cap must come from the
  // smaller declared value and trip before the full 8 MB is buffered.
  const { bytes, entry } = zipWithEntry('word/document.xml', raw, { declaredSize: 4096 })
  assert.ok(entry.compressedSize < 64 * 1024, 'fixture should be strongly compressible')
  await assert.rejects(
    () => extractZipEntry(bytes, entry),
    /decompression limit/,
    'an entry that expands past its declared size must be refused'
  )
})

test('a lying header cannot raise the absolute ceiling', async () => {
  const raw = Buffer.alloc(2 * 1024 * 1024, 0)
  // Declared size far above the hard cap: the limit must still be the ceiling,
  // never the attacker-supplied number.
  const { bytes, entry } = zipWithEntry('xl/sharedStrings.xml', raw, {
    declaredSize: MAX_ENTRY_BYTES * 100
  })
  // This payload is under the ceiling, so it must still extract — the point is
  // that the inflated cap did not become MAX_ENTRY_BYTES * 100.
  const out = await extractZipEntry(bytes, entry)
  assert.equal(out.length, raw.length)
  assert.ok(MAX_ENTRY_BYTES <= 64 * 1024 * 1024, 'ceiling stays bounded')
})

test('a truncated entry is refused before decompression', async () => {
  const raw = Buffer.from('content', 'utf8')
  const { bytes, entry } = zipWithEntry('word/document.xml', raw)
  await assert.rejects(
    () => extractZipEntry(bytes.slice(0, bytes.length - 3), { ...entry }),
    /Truncated ZIP entry/
  )
})
