// /api/instagram — archive a post so its text and media become a source.
//
// There is no public API for this. The original gateway shelled out to an
// external fetcher (the client still writes provenance.provider =
// 'instaloader'), and that is what this does: it runs a command the operator
// configures, expects JSON on stdout, and normalises it with the recovered
// instagram-core.mjs.
//
// It does not scrape Instagram itself and does not ship a fetcher. Without
// NOTE2_INSTAGRAM_COMMAND the route is 503 with that said plainly — the
// client already handles this by saving the link with status
// 'needs-connector' and the reason attached, which is the honest outcome.
//
// The command is spawned with an argument array and no shell, so a pasted URL
// cannot become a shell metacharacter. The URL is validated by
// instagramUrlDescriptor first, so what reaches the command is a canonical
// instagram.com post URL and nothing else.

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { instagramArchiveKey, instagramUrlDescriptor, normalizeInstagramPost } from '../../instagram-core.mjs'
import { HttpError } from '../http.mjs'
import { safeFetch } from '../ssrf.mjs'

const COMMAND_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** Runs the configured fetcher. Never through a shell. */
export function runFetcher(command, args, { timeoutMs = COMMAND_TIMEOUT_MS, spawnFn = spawn } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out = []
    const err = []
    let outBytes = 0
    let settled = false

    const finish = fn => (...params) => { if (!settled) { settled = true; clearTimeout(timer); fn(...params) } }
    const done = finish(resolvePromise)
    const fail = finish(reject)

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      fail(new HttpError(504, `Сборщик Instagram не ответил за ${Math.round(timeoutMs / 1000)} с`))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      outBytes += chunk.length
      if (outBytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL')
        return fail(new HttpError(502, 'Сборщик Instagram вернул слишком большой ответ'))
      }
      out.push(chunk)
    })
    child.stderr.on('data', chunk => { if (err.length < 64) err.push(chunk) })

    child.on('error', error => fail(new HttpError(503, `Не удалось запустить сборщик Instagram: ${error.message}`)))
    child.on('close', code => {
      if (code !== 0) {
        const detail = Buffer.concat(err).toString('utf8').trim().split('\n').at(-1) || `код ${code}`
        return fail(new HttpError(502, `Сборщик Instagram завершился с ошибкой: ${detail.slice(0, 300)}`))
      }
      done(Buffer.concat(out).toString('utf8'))
    })
  })
}

function archiveDir(config, shortcode) {
  const root = resolve(join(config.dataDir, 'instagram'))
  const path = resolve(join(root, instagramArchiveKey(shortcode)))
  if (!path.startsWith(root + sep)) throw new HttpError(400, 'Некорректный путь архива')
  return path
}

export async function handleInstagram({ body, config, deps = {} }) {
  const command = config.instagram.command
  if (!command) {
    throw new HttpError(503, 'Сбор Instagram не настроен. Задайте NOTE2_INSTAGRAM_COMMAND — команду, которая по ссылке возвращает JSON поста.')
  }

  // Validates the URL and gives us the canonical form. Anything that is not an
  // instagram.com post throws here, before a command is spawned.
  const descriptor = instagramUrlDescriptor(String(body?.url || ''))

  const raw = await (deps.runFetcher || runFetcher)(command, [descriptor.canonicalUrl], {
    timeoutMs: config.limits.upstreamTimeoutMs
  })

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new HttpError(502, 'Сборщик Instagram вернул не JSON')
  }

  // Throws on a post with no media, a bad shortcode or a non-http media URL.
  const post = normalizeInstagramPost(payload, descriptor.canonicalUrl)

  const dir = archiveDir(config, post.shortcode)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'post.json'), JSON.stringify(post, null, 2), 'utf8')

  // Media is archived so the post survives deletion upstream. A media URL
  // comes from the fetcher's output, so it goes through the address guard like
  // any other third-party URL.
  const media = []
  for (const item of post.media) {
    const entry = { ...item, bytes: 0, archived: false }
    try {
      const response = await (deps.fetchUrl || safeFetch)(item.url, {
        maxBytes: config.limits.uploadBytes,
        timeoutMs: config.limits.requestTimeoutMs
      })
      if (response.status < 400 && response.body.length) {
        await writeFile(join(dir, `media-${item.index}`), response.body)
        entry.bytes = response.body.length
        entry.archived = true
        entry.contentType = String(response.headers['content-type'] || item.mimeType).split(';')[0]
      }
    } catch (error) {
      // Recorded, not thrown: one unreachable image should not lose the post.
      entry.error = error.message
    }
    media.push(entry)
  }

  return {
    ...post,
    media,
    archivedAt: new Date().toISOString(),
    archiveVersion: 1,
    requestContext: descriptor
  }
}

/** GET /api/instagram/:shortcode/media/:index — the archived bytes. */
export async function handleInstagramMedia({ params, config, res }) {
  const dir = archiveDir(config, params.shortcode)
  const index = Number(params.index)
  if (!Number.isInteger(index) || index < 0 || index > 29) throw new HttpError(400, 'Некорректный номер медиа')

  let post
  try {
    post = JSON.parse(await readFile(join(dir, 'post.json'), 'utf8'))
  } catch {
    throw new HttpError(404, 'Пост не найден в архиве')
  }
  const item = (post.media || []).find(entry => Number(entry.index) === index)
  if (!item) throw new HttpError(404, 'Медиа не найдено')

  let bytes
  try {
    bytes = await readFile(join(dir, `media-${index}`))
  } catch {
    throw new HttpError(404, 'Файл медиа не сохранён')
  }

  res.writeHead(200, {
    'Content-Type': item.contentType || item.mimeType || 'application/octet-stream',
    'Content-Length': bytes.length,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(bytes)
}
