// The Instagram bridge. The fetcher is injected: the point under test is the
// guard around an external command and what happens to its output, not the
// command itself.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGateway } from '../server.mjs'
import { loadConfig } from '../server/config.mjs'
import { handleInstagram, runFetcher } from '../server/routes/instagram.mjs'

const POST = {
  shortcode: 'CabcDEF1234',
  caption: 'Текст поста про рецепты',
  owner: { username: 'chef', fullName: 'Повар' },
  type: 'carousel',
  media: [
    { kind: 'image', url: 'https://cdn.example.com/1.jpg', width: 1080, height: 1080 },
    { kind: 'video', url: 'https://cdn.example.com/2.mp4', width: 1080, height: 1920 }
  ]
}

async function config(extra = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'note2-ig-'))
  return { config: loadConfig({ NOTE2_DATA_DIR: dataDir, NOTE2_STATIC_DIR: 'no-such-dir', ...extra }), dataDir }
}

test('the route is 503 and names the variable when no fetcher is configured', async () => {
  const { config: cfg, dataDir } = await config()
  try {
    await assert.rejects(
      handleInstagram({ body: { url: 'https://www.instagram.com/p/CabcDEF1234/' }, config: cfg }),
      /NOTE2_INSTAGRAM_COMMAND/
    )
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

test('a non-Instagram URL is refused before any command is spawned', async () => {
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'should-never-run' })
  let spawned = false
  try {
    for (const url of ['https://example.com/p/abc/', 'https://www.instagram.com/someone/', 'not a url']) {
      await assert.rejects(handleInstagram({
        body: { url }, config: cfg, deps: { runFetcher: async () => { spawned = true; return '{}' } }
      }), /instagram|Некорректная ссылка|Нужна ссылка/i, url)
    }
    assert.equal(spawned, false, 'a rejected URL must never reach the command')
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

test('the fetcher receives the canonical URL as a single argument', async () => {
  // Shell metacharacters in a pasted URL must be inert. They are, because the
  // URL is validated to be an instagram.com post and passed as an argv entry.
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'fetcher' })
  let seen = null
  try {
    await handleInstagram({
      body: { url: 'https://instagram.com/reel/CabcDEF1234/?img_index=2' },
      config: cfg,
      deps: {
        runFetcher: async (command, args) => { seen = { command, args }; return JSON.stringify(POST) },
        fetchUrl: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('bytes') })
      }
    })
    assert.equal(seen.command, 'fetcher')
    assert.deepEqual(seen.args, ['https://www.instagram.com/reel/CabcDEF1234/'])
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

test('a post is normalised, archived and returned with media metadata', async () => {
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'fetcher' })
  try {
    const result = await handleInstagram({
      body: { url: 'https://www.instagram.com/p/CabcDEF1234/' },
      config: cfg,
      deps: {
        runFetcher: async () => JSON.stringify(POST),
        fetchUrl: async url => ({
          status: 200,
          headers: { 'content-type': url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' },
          body: Buffer.alloc(url.endsWith('.mp4') ? 2048 : 1024, 1)
        })
      }
    })
    assert.equal(result.shortcode, 'CabcDEF1234')
    assert.equal(result.owner.username, 'chef')
    assert.equal(result.media.length, 2)
    assert.equal(result.media[0].archived, true)
    assert.equal(result.media[0].bytes, 1024)
    assert.equal(result.media[1].contentType, 'video/mp4')
    assert.equal(result.requestContext.requestedMediaIndex, 0)
    assert.equal(result.archiveVersion, 1)
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

test('one unreachable media file does not lose the post', async () => {
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'fetcher' })
  try {
    const result = await handleInstagram({
      body: { url: 'https://www.instagram.com/p/CabcDEF1234/' },
      config: cfg,
      deps: {
        runFetcher: async () => JSON.stringify(POST),
        fetchUrl: async url => {
          if (url.endsWith('.mp4')) throw new Error('сеть недоступна')
          return { status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(16) }
        }
      }
    })
    assert.equal(result.media[0].archived, true)
    assert.equal(result.media[1].archived, false)
    assert.match(result.media[1].error, /сеть недоступна/)
    assert.equal(result.caption, 'Текст поста про рецепты', 'the post survives a missing file')
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

test('output that is not JSON, or a post with no media, is refused', async () => {
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'fetcher' })
  const call = output => handleInstagram({
    body: { url: 'https://www.instagram.com/p/CabcDEF1234/' }, config: cfg, deps: { runFetcher: async () => output }
  })
  try {
    await assert.rejects(call('<html>login</html>'), /вернул не JSON/)
    await assert.rejects(call(JSON.stringify({ ...POST, media: [] })), /не вернул медиафайлы/)
    await assert.rejects(call(JSON.stringify({ ...POST, media: [{ kind: 'image', url: 'javascript:alert(1)' }] })), /некорректный URL/)
  } finally { await rm(dataDir, { recursive: true, force: true }) }
})

// --- the spawn wrapper itself -----------------------------------------------

test('runFetcher returns stdout on success', async () => {
  const output = await runFetcher('node', ['-e', 'process.stdout.write(JSON.stringify({ok:true}))'])
  assert.equal(JSON.parse(output).ok, true)
})

test('runFetcher reports a non-zero exit with the last line of stderr', async () => {
  await assert.rejects(
    runFetcher('node', ['-e', 'console.error("post is private"); process.exit(3)']),
    /Сборщик Instagram завершился с ошибкой: post is private/
  )
})

test('runFetcher reports a missing command rather than hanging', async () => {
  await assert.rejects(runFetcher('no-such-command-here', []), /Не удалось запустить сборщик/)
})

test('runFetcher kills a command that does not finish', async () => {
  await assert.rejects(
    runFetcher('node', ['-e', 'setTimeout(()=>{}, 60000)'], { timeoutMs: 300 }),
    /не ответил за/
  )
})

test('runFetcher refuses an oversized stdout instead of buffering it', async () => {
  await assert.rejects(
    runFetcher('node', ['-e', 'const b=Buffer.alloc(1024*1024,97);for(let i=0;i<16;i++)process.stdout.write(b)']),
    /слишком большой ответ/
  )
})

test('the media route is reachable and 404s for an unknown post', async () => {
  const { config: cfg, dataDir } = await config({ NOTE2_INSTAGRAM_COMMAND: 'fetcher' })
  const server = createGateway(cfg)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const missing = await fetch(`${base}/api/instagram/CabcDEF1234/media/0`)
    assert.equal(missing.status, 404)
    assert.match((await missing.json()).error, /не найден/)

    const bad = await fetch(`${base}/api/instagram/${encodeURIComponent('../../etc')}/media/0`)
    assert.equal(bad.status, 400)
  } finally { server.close(); await rm(dataDir, { recursive: true, force: true }) }
})
