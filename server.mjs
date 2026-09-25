#!/usr/bin/env node
// NoteAI gateway.
//
// The browser handles notes, documents and search on its own. This process
// exists for the things a browser cannot do: fetch a pasted link without
// becoming an SSRF hole, read YouTube captions across an origin it may not
// touch, hold an account and a synced workspace, and forward media to a model
// the client must not hold the key for.
//
// Two rules shape every route:
//
//   1. An unconfigured capability returns 503 with a message naming the
//      environment variable that would enable it. It never degrades into a
//      local imitation — the app's contract is that model output is either
//      real or absent, and a plausible-looking substitute is the one failure
//      that cannot be detected downstream.
//   2. Every response is JSON, including every error. An HTML error page
//      reaches the user as `Unexpected token '<'`, which the app is required
//      never to show.

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { aiConfigured, embedConfigured, loadConfig, transcribeConfigured, visionConfigured } from './server/config.mjs'
import { HttpError, describeError, matchPath, readJson, sendError, sendJson } from './server/http.mjs'
import { handleSourceUrl } from './server/routes/source-url.mjs'
import { handleYoutube } from './server/routes/youtube.mjs'
import {
  handleListSessions, handleLogin, handleLogout, handleMe, handlePullWorkspace,
  handlePushWorkspace, handleRegister, handleRevokeSession
} from './server/routes/account.mjs'
import { handleLegacyPull, handleLegacyPush } from './server/routes/sync.mjs'
import { handleAi, handleEmbed } from './server/routes/ai.mjs'
import { handleTranscribe, handleVision } from './server/routes/media.mjs'
import {
  createUploadManager, handleUploadChunk, handleUploadDelete, handleUploadInit,
  handleUploadStatus, handleUploadTranscribe
} from './server/routes/uploads.mjs'
import { handleInstagram, handleInstagramMedia } from './server/routes/instagram.mjs'
import { createStore } from './server/store.mjs'

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
}

/**
 * Serves the built client. Paths are resolved and then checked to still be
 * inside the root, so '../../etc/passwd' and its encoded forms cannot escape.
 */
async function serveStatic(req, res, config) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    return sendError(res, 400, 'Некорректный путь')
  }
  if (pathname.endsWith('/')) pathname += 'index.html'

  const root = resolve(config.staticDir)
  const target = resolve(join(root, normalize(pathname)))
  if (target !== root && !target.startsWith(root + sep)) {
    return sendError(res, 403, 'Доступ запрещён')
  }

  let info
  try {
    info = await stat(target)
  } catch {
    // A single-page app: unknown paths fall back to index.html so a deep link
    // reloads. An /api/* miss never reaches here, so this cannot mask a 404
    // from the API as an HTML page.
    const index = join(root, 'index.html')
    try {
      await stat(index)
      res.writeHead(200, { 'Content-Type': STATIC_TYPES['.html'], 'Cache-Control': 'no-cache' })
      return createReadStream(index).pipe(res)
    } catch {
      return sendError(res, 404, 'Клиент не собран. Выполните npm run build.')
    }
  }
  if (info.isDirectory()) return serveStatic({ ...req, url: `${pathname}/` }, res, config)

  const type = STATIC_TYPES[extname(target).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff'
  })
  createReadStream(target).pipe(res)
}

/**
 * The route table. Each entry declares the method and path it answers and a
 * handler that returns a JSON-serialisable value or throws an HttpError.
 */
function buildRoutes(config, deps = {}) {
  const store = deps.store || createStore(config.dataDir)
  const uploads = deps.uploads || createUploadManager(config)
  const withStore = handler => ctx => handler({ ...ctx, store })
  const withUploads = handler => ctx => handler({ ...ctx, uploads })

  return [
    {
      method: 'GET',
      path: '/api/health',
      handler: async () => ({
        status: 'ok',
        service: 'noteai-gateway',
        time: new Date().toISOString(),
        // Reports which capabilities are actually wired, so the client can
        // show the truth instead of offering a button that cannot work.
        capabilities: {
          sourceUrl: true,
          youtube: true,
          ai: aiConfigured(config),
          embed: embedConfigured(config),
          vision: visionConfigured(config),
          transcribe: transcribeConfigured(config),
          instagram: Boolean(config.instagram.command),
          legacySync: Boolean(config.legacySyncToken)
        }
      })
    },
    {
      method: 'POST',
      path: '/api/source-url',
      handler: async ctx => handleSourceUrl(ctx)
    },
    {
      method: 'POST',
      path: '/api/youtube',
      handler: async ctx => handleYoutube(ctx)
    },

    // Accounts and device sessions.
    { method: 'POST', path: '/api/account/register', handler: withStore(handleRegister) },
    { method: 'POST', path: '/api/account/login', handler: withStore(handleLogin) },
    { method: 'GET', path: '/api/account/me', handler: withStore(handleMe) },
    { method: 'POST', path: '/api/account/logout', handler: withStore(handleLogout) },
    { method: 'GET', path: '/api/account/sessions', handler: withStore(handleListSessions) },
    { method: 'DELETE', path: '/api/account/sessions/:sessionId', handler: withStore(handleRevokeSession) },

    // The synced workspace. The snapshot cap is generous because it carries
    // every note and every indexed chunk in one body.
    { method: 'GET', path: '/api/account/sync/:workspaceId', handler: withStore(handlePullWorkspace) },
    {
      method: 'PUT',
      path: '/api/account/sync/:workspaceId',
      maxBody: config.limits.snapshotBytes,
      handler: withStore(handlePushWorkspace)
    },

    // Model-backed routes. Each refuses with 503 when unconfigured rather
    // than answering with something that is not a model's output.
    { method: 'POST', path: '/api/ai', maxBody: 4 * 1024 * 1024, handler: async ctx => handleAi(ctx) },
    { method: 'POST', path: '/api/embed', maxBody: 8 * 1024 * 1024, handler: async ctx => handleEmbed(ctx) },
    // rawBody: the file is the body, so it must not be parsed as JSON.
    { method: 'POST', path: '/api/vision', rawBody: true, handler: async ctx => handleVision(ctx) },
    { method: 'POST', path: '/api/transcribe', rawBody: true, handler: async ctx => handleTranscribe(ctx) },

    // Instagram, through an external fetcher the operator configures.
    { method: 'POST', path: '/api/instagram', handler: async ctx => handleInstagram(ctx) },
    {
      method: 'GET',
      path: '/api/instagram/:shortcode/media/:index',
      // Writes bytes itself rather than returning JSON.
      handler: async ctx => { await handleInstagramMedia(ctx); return undefined }
    },

    // Resumable upload for media too large to post in one request.
    { method: 'POST', path: '/api/uploads/init', handler: withUploads(handleUploadInit) },
    {
      method: 'PUT',
      path: '/api/uploads/:uploadId/chunks/:index',
      rawBody: true,
      handler: withUploads(handleUploadChunk)
    },
    { method: 'POST', path: '/api/uploads/:uploadId/transcribe', handler: withUploads(handleUploadTranscribe) },
    { method: 'GET', path: '/api/uploads/:uploadId', handler: withUploads(handleUploadStatus) },
    { method: 'DELETE', path: '/api/uploads/:uploadId', handler: withUploads(handleUploadDelete) },

    // The pre-account sync mode the client still offers.
    { method: 'GET', path: '/api/sync/:workspaceId', handler: withStore(handleLegacyPull) },
    {
      method: 'PUT',
      path: '/api/sync/:workspaceId',
      maxBody: config.limits.snapshotBytes,
      handler: withStore(handleLegacyPush)
    }
  ]
}

export function createGateway(config = loadConfig(), deps = {}) {
  const routes = buildRoutes(config, deps)

  return createServer(async (req, res) => {
    let url
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    } catch {
      return sendError(res, 400, 'Некорректный запрос')
    }

    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Метод не поддерживается')
      return serveStatic(req, res, config)
    }

    // A path that looks like an API route but matches nothing must 404 as
    // JSON. Falling through to the SPA would hand the client index.html and
    // produce the 'Unexpected token <' failure this gateway exists to prevent.
    let matchedPath = false
    for (const route of routes) {
      const params = matchPath(route.path, url.pathname)
      if (!params) continue
      matchedPath = true
      if (route.method !== req.method) continue

      try {
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) && !route.rawBody
          ? await readJson(req, route.maxBody || 1024 * 1024)
          : {}
        const result = await route.handler({ req, res, url, params, body, config, deps })
        if (res.writableEnded) return
        return sendJson(res, route.status || 200, result)
      } catch (error) {
        const { status, message, data } = describeError(error)
        if (status >= 500) console.error(`[gateway] ${req.method} ${url.pathname}:`, error)
        if (res.writableEnded) return
        return sendError(res, status, message, data)
      }
    }

    return matchedPath
      ? sendError(res, 405, `Метод ${req.method} не поддерживается для ${url.pathname}`)
      : sendError(res, 404, `Неизвестный маршрут ${url.pathname}`)
  })
}

export function startGateway(config = loadConfig(), deps = {}) {
  const server = createGateway(config, deps)
  return new Promise(resolve => {
    server.listen(config.port, config.host, () => resolve(server))
  })
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
if (isEntry) {
  const config = loadConfig()
  startGateway(config).then(server => {
    const { port } = server.address()
    console.log(`NoteAI gateway слушает http://${config.host}:${port}`)
    console.log(`Статика: ${config.staticDir}`)
    console.log(`Данные:  ${config.dataDir}`)
  }).catch(error => {
    console.error('Не удалось запустить шлюз:', error)
    process.exit(1)
  })
}

export { HttpError }
