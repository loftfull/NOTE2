// Regression tests for tools/recover-v410-source.mjs
//
// These build a synthetic split upload in a temp directory and run the real
// script as a subprocess, so they exercise the actual entry point rather than a
// reimplementation of it. Run with: node --test tools/*.test.mjs
// (the bare directory form needs a root package.json, which this repo has not.)
//
// What they pin down (each corresponds to a way the v4.10 salvage could quietly
// go wrong):
//   1. an entry whose CRC-32 does not match is never written;
//   2. an entry whose compressed stream is cut short is never written;
//   3. an archive with no end-of-central-directory is reported as INCOMPLETE,
//      so a partial salvage cannot be mistaken for a verified import;
//   4. an entry name containing ../ cannot escape the output directory.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateRawSync, crc32 } from 'node:zlib'

const SCRIPT = resolve(import.meta.dirname, 'recover-v410-source.mjs')

function localEntry(name, contents, { corruptCrc = false, truncateBy = 0 } = {}) {
  const raw = Buffer.from(contents)
  const deflated = deflateRawSync(raw)
  const nameBuf = Buffer.from(name, 'utf8')
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(8, 8) // deflate
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(corruptCrc ? 0xdeadbeef : crc32(raw) >>> 0, 14)
  header.writeUInt32LE(deflated.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBuf.length, 26)
  header.writeUInt16LE(0, 28)
  const body = truncateBy ? deflated.subarray(0, deflated.length - truncateBy) : deflated
  return Buffer.concat([header, nameBuf, body])
}

// Writes `blob` out as part-NN.b64 chunks, mimicking the real upload. Chunk
// boundaries are 4-byte aligned so each part decodes independently, as the
// committed parts do.
function writeParts(dir, blob) {
  mkdirSync(dir, { recursive: true })
  const b64 = blob.toString('base64')
  const chunk = 2000
  let n = 1
  for (let i = 0; i < b64.length; i += chunk) {
    writeFileSync(join(dir, `part-${String(n++).padStart(2, '0')}.b64`), b64.slice(i, i + chunk))
  }
}

function run(partsDir, outDir) {
  return execFileSync(process.execPath, [SCRIPT, '--parts', partsDir, '--out', outDir], { encoding: 'utf8' })
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'note2-recover-'))
  return { parts: join(base, 'parts'), out: join(base, 'out') }
}

test('writes entries whose CRC-32 matches', () => {
  const { parts, out } = fixture()
  writeParts(parts, localEntry('work/src/ok.js', 'export const value = 1\n'))
  const stdout = run(parts, out)
  assert.match(stdout, /RECOVERED \(CRC-32 verified\): 1/)
  assert.equal(readFileSync(join(out, 'work/src/ok.js'), 'utf8'), 'export const value = 1\n')
})

test('rejects an entry whose CRC-32 does not match, and does not write it', () => {
  const { parts, out } = fixture()
  writeParts(parts, localEntry('work/src/tampered.js', 'export const value = 2\n', { corruptCrc: true }))
  const stdout = run(parts, out)
  assert.match(stdout, /RECOVERED \(CRC-32 verified\): 0/)
  assert.match(stdout, /CRC-32 mismatch|inflate failed/)
  assert.equal(existsSync(join(out, 'work/src/tampered.js')), false)
})

test('rejects an entry whose compressed stream is cut short', () => {
  const { parts, out } = fixture()
  // A long, compressible body so removing bytes reliably truncates the stream.
  writeParts(parts, localEntry('work/src/cut.js', 'x'.repeat(4000), { truncateBy: 12 }))
  const stdout = run(parts, out)
  assert.match(stdout, /RECOVERED \(CRC-32 verified\): 0/)
  assert.equal(existsSync(join(out, 'work/src/cut.js')), false)
})

test('reports an archive with no end-of-central-directory as INCOMPLETE', () => {
  const { parts, out } = fixture()
  // Local headers only — exactly the shape of the committed v4.10 upload.
  writeParts(parts, localEntry('work/src/ok.js', 'ok\n'))
  const stdout = run(parts, out)
  assert.match(stdout, /End-of-central-directory present: false/)
  assert.match(stdout, /upload is INCOMPLETE/)
})

test('refuses to write an entry name that escapes the output directory', () => {
  const { parts, out } = fixture()
  writeParts(parts, localEntry('../../escaped.js', 'pwned\n'))
  const stdout = run(parts, out)
  assert.match(stdout, /path traversal refused/)
  assert.match(stdout, /RECOVERED \(CRC-32 verified\): 0/)
  assert.equal(existsSync(resolve(out, '../../escaped.js')), false)
})
