// Request and response helpers shared by every route.
//
// One rule runs through all of it: a failure is JSON with an `error` string.
// The client reads `data.error` on every non-2xx response, and an HTML error
// page would surface to the user as `Unexpected token '<'`, which is the exact
// failure mode the app is required never to show.

export const JSON_TYPE = 'application/json; charset=utf-8'

export function sendJson(res, status, payload, extraHeaders = null) {
  const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf8')
  res.writeHead(status, {
    ...(extraHeaders || {}),
    'Content-Type': JSON_TYPE,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    // The gateway answers a WebView and a browser; it never renders markup of
    // its own, so nothing here should ever be sniffed or framed.
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  })
  res.end(body)
}

export function sendError(res, status, message, extra = null, headers = null) {
  // `extra` carries machine-readable detail alongside the message — a push
  // conflict returns currentRevision so the client can say which revision it
  // is behind instead of only that something went wrong.
  sendJson(res, status, { error: String(message || 'Внутренняя ошибка сервера'), ...(extra || {}) }, headers)
}

/** Turns a thrown value into a status and a message meant for a person. */
export function describeError(error) {
  const message = error?.message || 'Внутренняя ошибка сервера'
  const data = error?.data && typeof error.data === 'object' ? error.data : null
  const headers = error?.headers && typeof error.headers === 'object' ? error.headers : null
  if (error?.status) return { status: Number(error.status), message, data, headers }
  if (error?.code === 'EBLOCKEDADDRESS') return { status: 400, message, data, headers }
  if (/Некорректн|не настроен|Поддерживаются|Нужна ссылка|больше допустимых|Слишком много|по кругу|внутренний или служебный|localhost/i.test(message)) {
    return { status: 400, message, data, headers }
  }
  return { status: 500, message, data, headers }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/** Reads a request body with a hard cap, destroying the socket if exceeded. */
export function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let received = 0
    req.on('data', chunk => {
      received += chunk.length
      if (received > maxBytes) {
        // Stop reading rather than buffering a body we have already refused.
        req.destroy()
        reject(new HttpError(413, `Тело запроса больше допустимых ${Math.round(maxBytes / 1024 / 1024)} МБ`))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function readJson(req, maxBytes = 1024 * 1024) {
  const buffer = await readBody(req, maxBytes)
  if (!buffer.length) return {}
  try {
    const parsed = JSON.parse(buffer.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'Ожидался JSON-объект в теле запроса')
    }
    return parsed
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Тело запроса не является корректным JSON')
  }
}

/** The bearer token on the request, or ''. */
export function bearerToken(req) {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim())
  return match ? match[1].trim() : ''
}

/** The client sends the original filename percent-encoded in a header. */
export function requestFilename(req, fallback = 'upload') {
  const raw = req.headers['x-file-name']
  if (!raw) return fallback
  try {
    // Strip any directory part: this value is attacker-controlled and is used
    // in log lines and in multipart bodies sent upstream.
    return decodeURIComponent(String(raw)).split(/[\\/]/).pop().slice(0, 255) || fallback
  } catch {
    return fallback
  }
}

/**
 * Matches a path against a pattern with :params, e.g. '/api/sync/:workspaceId'.
 * Returns the decoded params or null.
 */
export function matchPath(pattern, pathname) {
  const want = pattern.split('/').filter(Boolean)
  const got = pathname.split('/').filter(Boolean)
  if (want.length !== got.length) return null
  const params = {}
  for (let i = 0; i < want.length; i += 1) {
    if (want[i].startsWith(':')) {
      try { params[want[i].slice(1)] = decodeURIComponent(got[i]) } catch { return null }
    } else if (want[i] !== got[i]) {
      return null
    }
  }
  return params
}
