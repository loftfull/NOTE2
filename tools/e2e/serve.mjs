// Статический сервер для проверок: отдаёт собранное приложение.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const T = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json',
  '.map':'application/json', '.png':'image/png' }
export function serve(root) {
  const server = http.createServer((q, s) => {
    const u = decodeURIComponent(q.url.split('?')[0])
    const p = path.join(root, u === '/' ? 'index.html' : u)
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end('no'); return }
    s.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' })
    fs.createReadStream(p).pipe(s)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({
    server, base: `http://127.0.0.1:${server.address().port}/`,
  })))
}
