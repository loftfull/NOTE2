// Outbound request guard for user-supplied URLs.
//
// The client lets a person paste any link and asks the gateway to fetch it.
// Without a guard that is a server-side request forgery primitive: the gateway
// sits inside a network the browser cannot reach, so `http://169.254.169.254/`
// or `http://10.0.0.5:6379/` would be fetched with the gateway's own
// credentials and reach the user as page content.
//
// Three properties matter, and each is a separate defect if missing:
//
//   1. The literal host must not be a private address.
//   2. The *resolved* address must not be private — a public name can resolve
//      into the private range, which is the standard bypass.
//   3. Validation must happen at connect time, not before it. Checking with
//      dns.resolve() and then handing the name to a socket lets DNS rebinding
//      return a public address to the check and a private one to the connect.
//      We therefore validate inside the socket's own lookup callback, so the
//      address that is approved is the address that is used.
//
// Redirects are followed manually because every hop is a fresh URL that has to
// pass the same three checks; `fetch`'s automatic redirect would skip them.

import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export const MAX_REDIRECTS = 5
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
export const DEFAULT_TIMEOUT_MS = 15_000

/** Parses dotted-quad IPv4 into a 32-bit unsigned integer, or null. */
export function ipv4ToInt(value = '') {
  const parts = String(value).split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const byte = Number(part)
    if (byte > 255) return null
    out = out * 256 + byte
  }
  return out >>> 0
}

// Ranges that must never be reachable from a user-supplied URL. Each entry is
// [first, last] inclusive, as 32-bit integers, with the reason it is here.
const BLOCKED_V4 = [
  ['0.0.0.0', '0.255.255.255'],            // "this network"
  ['10.0.0.0', '10.255.255.255'],          // RFC1918 private
  ['100.64.0.0', '100.127.255.255'],       // RFC6598 carrier-grade NAT
  ['127.0.0.0', '127.255.255.255'],        // loopback
  ['169.254.0.0', '169.254.255.255'],      // link-local, incl. cloud metadata
  ['172.16.0.0', '172.31.255.255'],        // RFC1918 private
  ['192.0.0.0', '192.0.0.255'],            // IETF protocol assignments
  ['192.0.2.0', '192.0.2.255'],            // TEST-NET-1
  ['192.31.196.0', '192.31.196.255'],      // AS112
  ['192.52.193.0', '192.52.193.255'],      // AMT
  ['192.88.99.0', '192.88.99.255'],        // deprecated 6to4 relay anycast
  ['192.168.0.0', '192.168.255.255'],      // RFC1918 private
  ['198.18.0.0', '198.19.255.255'],        // benchmarking
  ['198.51.100.0', '198.51.100.255'],      // TEST-NET-2
  ['203.0.113.0', '203.0.113.255'],        // TEST-NET-3
  ['224.0.0.0', '239.255.255.255'],        // multicast
  ['240.0.0.0', '255.255.255.255']         // reserved + broadcast
].map(([from, to]) => [ipv4ToInt(from), ipv4ToInt(to)])

function blockedV4(value) {
  const int = ipv4ToInt(value)
  if (int === null) return 'не является корректным IPv4-адресом'
  for (const [from, to] of BLOCKED_V4) {
    if (int >= from && int <= to) return 'указывает на внутренний или служебный адрес'
  }
  return ''
}

/** Expands an IPv6 literal to its eight 16-bit groups, or null. */
export function ipv6Groups(value = '') {
  let text = String(value).trim().replace(/^\[|\]$/g, '')
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  if (!text.includes(':')) return null

  // A trailing dotted-quad (::ffff:127.0.0.1) becomes two 16-bit groups.
  let tail = ''
  const lastColon = text.lastIndexOf(':')
  const suffix = text.slice(lastColon + 1)
  if (suffix.includes('.')) {
    const int = ipv4ToInt(suffix)
    if (int === null) return null
    tail = `${((int >>> 16) & 0xffff).toString(16)}:${(int & 0xffff).toString(16)}`
    text = `${text.slice(0, lastColon + 1)}${tail}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0
  if (fill < 0) return null
  const parts = [...head, ...Array(fill).fill('0'), ...rest]
  if (parts.length !== 8) return null

  const groups = []
  for (const part of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null
    groups.push(Number.parseInt(part, 16))
  }
  return groups
}

function blockedV6(value) {
  const groups = ipv6Groups(value)
  if (!groups) return 'не является корректным IPv6-адресом'

  const isZero = groups.every(group => group === 0)
  if (isZero) return 'указывает на неуказанный адрес ::'
  if (groups.slice(0, 7).every(group => group === 0) && groups[7] === 1) return 'указывает на loopback ::1'

  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry a real IPv4
  // address in the low 32 bits. Judge them by that address, or 127.0.0.1
  // reaches us written as ::ffff:7f00:1.
  const mapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff
  const nat64 = groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)
  if (mapped || nat64) {
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    return blockedV4(embedded)
  }
  // 6to4 (2002::/16) embeds the IPv4 address of the relay in the next 32 bits.
  if (groups[0] === 0x2002) {
    const embedded = `${groups[1] >> 8}.${groups[1] & 0xff}.${groups[2] >> 8}.${groups[2] & 0xff}`
    return blockedV4(embedded)
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return 'указывает на внутренний адрес (unique local)'
  if ((groups[0] & 0xffc0) === 0xfe80) return 'указывает на link-local адрес'
  if ((groups[0] & 0xff00) === 0xff00) return 'указывает на multicast-адрес'
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return 'указывает на документационный адрес'
  return ''
}

/**
 * Empty string when the address may be contacted, otherwise the reason it may
 * not. Kept pure and exported so the whole block list is unit-testable without
 * opening a socket.
 */
export function addressBlockReason(address = '', family = 0) {
  const value = String(address || '').trim()
  if (!value) return 'пустой адрес'
  if (family === 6 || value.includes(':')) return blockedV6(value)
  return blockedV4(value)
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Checks everything about a URL that can be judged without DNS. Returns the
 * parsed URL, or throws with a message meant for the person who pasted it.
 */
export function assertFetchableUrl(raw = '') {
  let url
  try {
    url = new URL(String(raw).trim())
  } catch {
    throw new Error('Некорректная ссылка')
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Поддерживаются только http и https, получено ${url.protocol.replace(':', '') || 'ничего'}`)
  }
  if (url.username || url.password) throw new Error('Ссылки с логином и паролем не поддерживаются')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host) throw new Error('В ссылке нет имени хоста')

  // A bare literal is judged immediately; a name is judged at connect time.
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (looksLikeIp) {
    const reason = addressBlockReason(host)
    if (reason) throw new Error(`Адрес ${host} ${reason}`)
  } else if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) {
    throw new Error('Адрес localhost недоступен для загрузки по ссылке')
  }
  return url
}

/**
 * dns.lookup with every returned address checked before the socket may use it.
 * Because this runs as the connection's own resolver, the address approved
 * here is the address connected to — a rebinding attack has no window.
 */
export function guardedLookup(hostname, options, callback) {
  const done = typeof options === 'function' ? options : callback
  const opts = typeof options === 'function' ? {} : (options || {})
  dnsLookup(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) return done(error)
    const list = Array.isArray(addresses) ? addresses : [addresses]
    for (const entry of list) {
      const reason = addressBlockReason(entry.address, entry.family)
      if (reason) {
        return done(Object.assign(new Error(`Хост ${hostname} ${reason}`), { code: 'EBLOCKEDADDRESS' }))
      }
    }
    if (opts.all) return done(null, list)
    return done(null, list[0].address, list[0].family)
  })
}

/**
 * One request, no redirect following. Resolves with status, headers, body.
 * Exported so the byte cap can be tested against a real socket without the
 * address policy standing in the way — the two concerns are independent.
 */
export function requestOnce(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(url, { method: 'GET', headers, lookup: guardedLookup, timeout: timeoutMs }, response => {
      const chunks = []
      let received = 0
      response.on('data', chunk => {
        received += chunk.length
        // Enforced while reading, not from Content-Length: a hostile server
        // can understate or omit that header.
        if (received > maxBytes) {
          response.destroy()
          reject(new Error(`Документ больше допустимых ${Math.round(maxBytes / 1024 / 1024)} МБ`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }))
      response.on('error', reject)
    })
    req.on('timeout', () => { req.destroy(new Error('Превышено время ожидания ответа')) })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Fetches a user-supplied URL with every hop re-validated. Returns
 * { url, status, headers, body } for the final response.
 *
 * `perform` exists so a test can drive the redirect chain without a network:
 * per-hop validation is this function's job and must be provable on its own,
 * and a test that starts from a blocked literal would pass at hop 0 without
 * ever reaching the loop.
 */
export async function safeFetch(raw, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, headers = {}, maxRedirects = MAX_REDIRECTS, perform = requestOnce } = {}) {
  let url = assertFetchableUrl(raw)
  const seen = new Set()

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (seen.has(url.toString())) throw new Error('Ссылка ведёт по кругу')
    seen.add(url.toString())

    const response = await perform(url, { timeoutMs, maxBytes, headers })
    const location = response.headers.location
    const redirecting = response.status >= 300 && response.status < 400 && location

    if (!redirecting) return { url: url.toString(), status: response.status, headers: response.headers, body: response.body }

    // The new location is a brand-new URL from an untrusted party, so it goes
    // through the same front door as the original.
    let next
    try {
      next = new URL(location, url)
    } catch {
      throw new Error('Сервер вернул некорректный адрес перенаправления')
    }
    url = assertFetchableUrl(next.toString())
  }
  throw new Error(`Слишком много перенаправлений (больше ${maxRedirects})`)
}
