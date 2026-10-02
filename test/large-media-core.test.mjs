import test from 'node:test'
import assert from 'node:assert/strict'
import { expectedChunkBytes, mergeTranscriptionParts, totalChunks, uploadIdFromResumeKey, uploadProgress } from '../large-media-core.mjs'

test('large upload math is stable and resumable', () => {
  assert.equal(totalChunks(13 * 1024 * 1024, 6 * 1024 * 1024), 3)
  assert.equal(expectedChunkBytes(13 * 1024 * 1024, 6 * 1024 * 1024, 2), 1024 * 1024)
  assert.equal(uploadProgress([0, 2], 4), 0.5)
  assert.equal(uploadIdFromResumeKey('job-1234567890abcdef'), uploadIdFromResumeKey('job-1234567890abcdef'))
})

test('segmented transcript timestamps are rebased into one timeline', () => {
  const merged = mergeTranscriptionParts([
    { index:0, offsetSeconds:0, normalized:{ text:'one', duration:10, speakers:['A'], sections:[{text:'one',locator:{startSeconds:1,endSeconds:2,speaker:'A'}}] } },
    { index:1, offsetSeconds:10, normalized:{ text:'two', duration:8, speakers:['A'], sections:[{text:'two',locator:{startSeconds:0.5,endSeconds:1.5,speaker:'A'}}] } }
  ])
  assert.equal(merged.text, 'one\ntwo')
  assert.equal(merged.sections[1].locator.startSeconds, 10.5)
  assert.equal(merged.duration, 18)
})
