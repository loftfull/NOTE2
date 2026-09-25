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

import { loadConfig } from './server/config.mjs'
import { HttpError, describeError, matchPath, readJson, sendError, sendJson } from './server/http.mjs'
import { handleSourceUrl } from './server/routes/source-url.mjs'

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
        capabilities: deps.capabilities ? deps.capabilities(config) : {}
      })
    },
    {
      method: 'POST',
      path: '/api/source-url',
      handler: async ctx => handleSourceUrl(ctx)
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
        const { status, message } = describeError(error)
        if (status >= 500) console.error(`[gateway] ${req.method} ${url.pathname}:`, error)
        if (res.writableEnded) return
        return sendError(res, status, message)
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
