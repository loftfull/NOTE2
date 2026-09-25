import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleYoutube, jsonStringField, pickCaptionTrack, videoMetadataFromHtml } from '../server/routes/youtube.mjs'
import { loadConfig } from '../server/config.mjs'

const config = loadConfig({})

test('jsonStringField reads escaped values from the embedded JSON', () => {
  assert.equal(jsonStringField('{"title":"Как это \\"работает\\""}', 'title'), 'Как это "работает"')
  assert.equal(jsonStringField('{"ownerChannelName":"Канал"}', 'ownerChannelName'), 'Канал')
  assert.equal(jsonStringField('{"title":"a"}', 'missing'), '')
})

test('videoMetadataFromHtml prefers embedded JSON, then og tags', () => {
  const html = `<meta property="og:title" content="OG название">
    <meta property="og:description" content="Описание">
    <meta property="og:image" content="https://i.ytimg.com/vi/abc/hq.jpg">
    {"title":"JSON название","ownerChannelName":"Мой канал","lengthSeconds":"635"}`
  const meta = videoMetadataFromHtml(html, 'abc')
  assert.equal(meta.title, 'JSON название')
  assert.equal(meta.channel, 'Мой канал')
  assert.equal(meta.description, 'Описание')
  assert.equal(meta.thumbnail, 'https://i.ytimg.com/vi/abc/hq.jpg')
  assert.equal(meta.lengthSeconds, 635)
})

test('videoMetadataFromHtml falls back to a derived thumbnail', () => {
  assert.equal(videoMetadataFromHtml('', 'xyz123').thumbnail, 'https://i.ytimg.com/vi/xyz123/hqdefault.jpg')
})

test('pickCaptionTrack prefers a human track in a preferred language', () => {
  const tracks = [
    { languageCode: 'en', isAuto: true },
    { languageCode: 'ru', isAuto: true },
    { languageCode: 'ru', isAuto: false, name: 'Русские' }
  ]
  assert.equal(pickCaptionTrack(tracks).name, 'Русские')
})

test('pickCaptionTrack takes an automatic track rather than nothing', () => {
  const tracks = [{ languageCode: 'ru', isAuto: true, name: 'авто' }]
  assert.equal(pickCaptionTrack(tracks).name, 'авто')
  assert.equal(pickCaptionTrack([]), null)
})

test('pickCaptionTrack prefers any manual track over an auto one in a preferred language', () => {
  const tracks = [{ languageCode: 'ru', isAuto: true }, { languageCode: 'de', isAuto: false, name: 'Deutsch' }]
  assert.equal(pickCaptionTrack(tracks).name, 'Deutsch')
})

test('handleYoutube rejects a link that is not YouTube', async () => {
  await assert.rejects(handleYoutube({ body: { url: 'https://example.com/watch?v=x' }, config }), /не похоже на ссылку YouTube/)
  await assert.rejects(handleYoutube({ body: {}, config }), /Укажите ссылку/)
})

// A stub watch page and caption track, so the route is exercised without
// depending on YouTube's markup staying still or on network access.
function stubFetch({ watchHtml, captionJson, captionStatus = 200 }) {
  return async url => {
    if (String(url).includes('/watch')) {
      return { url, status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(watchHtml) }
    }
    return { url, status: captionStatus, headers: { 'content-type': 'application/json' }, body: Buffer.from(captionJson || '{}') }
  }
}

const WATCH_HTML = `<html><head><meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg"></head>
<body>{"title":"Настоящее название","ownerChannelName":"Канал","lengthSeconds":"212",
"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=ru","languageCode":"ru","name":{"simpleText":"Русские"}}]}</body></html>`

const CAPTIONS = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Первая ' }, { utf8: 'строка' }] },
    { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: 'Вторая строка' }] },
    { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: '[Music]' }] }
  ]
})

test('handleYoutube returns metadata and a transcript when captions exist', async () => {
  const result = await handleYoutube({
    body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    config,
    fetchUrl: stubFetch({ watchHtml: WATCH_HTML, captionJson: CAPTIONS })
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.videoId, 'dQw4w9WgXcQ')
  assert.equal(result.title, 'Настоящее название')
  assert.equal(result.channel, 'Канал')
  assert.equal(result.captionLanguage, 'ru')
  assert.equal(result.autoCaptions, false)
  assert.equal(result.transcript, 'Первая строка\nВторая строка', '[Music] is not transcript text')
  assert.equal(result.sections.length, 2)
  assert.equal(result.sections[0].locator.startSeconds, 0)
  assert.equal(result.sections[1].locator.startSeconds, 2)
})

test('handleYoutube accepts youtu.be and /shorts/ forms', async () => {
  for (const url of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
    const result = await handleYoutube({
      body: { url }, config, fetchUrl: stubFetch({ watchHtml: WATCH_HTML, captionJson: CAPTIONS })
    })
    assert.equal(result.videoId, 'dQw4w9WgXcQ', url)
  }
})

test('handleYoutube saves the video without inventing a transcript when there are no captions', async () => {
  // The rule that matters: no captions means no transcript, reported as such.
  const result = await handleYoutube({
    body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    config,
    fetchUrl: stubFetch({ watchHtml: '<html><body>{"title":"Без субтитров"}</body></html>' })
  })
  assert.equal(result.status, 'saved')
  assert.equal(result.transcript, '')
  assert.deepEqual(result.sections, [])
  assert.equal(result.title, 'Без субтитров')
})

test('handleYoutube degrades to no transcript when the caption track fails to load', async () => {
  const result = await handleYoutube({
    body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    config,
    fetchUrl: stubFetch({ watchHtml: WATCH_HTML, captionStatus: 403 })
  })
  assert.equal(result.status, 'saved')
  assert.equal(result.transcript, '')
})

test('handleYoutube reports an unreachable watch page as a gateway error', async () => {
  const failing = async () => { throw new Error('сеть недоступна') }
  await assert.rejects(
    handleYoutube({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, config, fetchUrl: failing }),
    /Не удалось открыть страницу видео/
  )
})
