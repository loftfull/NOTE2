import test from 'node:test'
import assert from 'node:assert/strict'
import { captionEventsToSections, captionTracksFromHtml, normalizeTranscription, splitVisionPages, youtubeVideoId } from '../media-connectors.mjs'

test('YouTube URL parser accepts watch, short and youtu.be links', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=2'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), '')
})

test('caption track parser extracts public track metadata without leaking base URL to UI', () => {
  const html = '<script>var x={"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=x\\u0026lang=en","name":{"simpleText":"English"},"languageCode":"en","kind":"asr"}]};</script>'
  const tracks = captionTracksFromHtml(html)
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].languageCode, 'en')
  assert.equal(tracks[0].isAuto, true)
  assert.match(tracks[0].baseUrl, /timedtext/)
})

test('caption JSON becomes time-coded evidence sections', () => {
  const sections = captionEventsToSections({ events: [
    { tStartMs: 1250, dDurationMs: 2500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
    { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'Next line' }] }
  ] })
  assert.equal(sections.length, 2)
  assert.equal(sections[0].locator.startSeconds, 1.25)
  assert.equal(sections[0].text, 'Hello world')
})

test('diarized transcription is normalized into speaker/time locators', () => {
  const result = normalizeTranscription({ segments: [
    { speaker: 'A', start: 0, end: 2.4, text: 'First statement.' },
    { speaker: 'B', start: 2.5, end: 5.2, text: 'Second statement.' }
  ] })
  assert.deepEqual(result.speakers, ['A','B'])
  assert.equal(result.sections[1].locator.startSeconds, 2.5)
  assert.equal(result.duration, 5.2)
  assert.match(result.text, /First statement/)
})

test('vision output preserves PDF page locators', () => {
  const sections = splitVisionPages('--- Page 1 ---\nAlpha\n\n--- Page 2 ---\nBeta')
  assert.equal(sections.length, 2)
  assert.deepEqual(sections[1].locator, { page: 2 })
  assert.equal(sections[1].text, 'Beta')
})
