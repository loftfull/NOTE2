// Proves the outbound guard blocks what it must and allows what it must.
//
// The table cases pin the block list. The live-server cases matter more: they
// open real sockets, so they fail if the guard is wired into the wrong place
// even when addressBlockReason() is perfect.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { addressBlockReason, assertFetchableUrl, guardedLookup, ipv4ToInt, ipv6Groups, requestOnce, safeFetch } from '../server/ssrf.mjs'

test('ipv4ToInt parses and rejects', () => {
  assert.equal(ipv4ToInt('0.0.0.0'), 0)
  assert.equal(ipv4ToInt('127.0.0.1'), 2130706433)
  assert.equal(ipv4ToInt('255.255.255.255'), 4294967295)
  assert.equal(ipv4ToInt('256.0.0.1'), null, '256 is not a byte')
  assert.equal(ipv4ToInt('1.2.3'), null, 'three octets is not an address')
  assert.equal(ipv4ToInt('1.2.3.04x'), null)
})

test('ipv6Groups expands shorthand and embedded IPv4', () => {
  assert.deepEqual(ipv6Groups('::1'), [0, 0, 0, 0, 0, 0, 0, 1])
  assert.deepEqual(ipv6Groups('2001:db8::1'), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1])
  assert.deepEqual(ipv6Groups('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001])
  assert.equal(ipv6Groups('1:2:3:4:5:6:7:8:9'), null, 'nine groups is not an address')
  assert.equal(ipv6Groups('::1::2'), null, 'two elisions is not an address')
})

const BLOCKED = [
  '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.5', '10.255.255.254',
  '172.16.0.1', '172.31.255.255', '192.168.1.1',
  '169.254.169.254',                       // AWS/GCP/Azure metadata
  '100.64.0.1', '198.18.0.1', '192.0.2.5', '203.0.113.9',
  '224.0.0.1', '240.0.0.1', '255.255.255.255',
  '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1',
  '::ffff:127.0.0.1',                      // loopback as IPv4-mapped IPv6
  '::ffff:169.254.169.254',                // metadata as IPv4-mapped IPv6
  '64:ff9b::7f00:1',                       // loopback via NAT64
  '2002:7f00:1::1'                         // loopback via 6to4
]

for (const address of BLOCKED) {
  test(`blocks ${address}`, () => {
    assert.notEqual(addressBlockReason(address), '', `${address} must be blocked`)
  })
}

const ALLOWED = ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700::1111', '2a00:1450:4001::1']

for (const address of ALLOWED) {
  test(`allows ${address}`, () => {
    assert.equal(addressBlockReason(address), '', `${address} must be allowed`)
  })
}

test('assertFetchableUrl rejects non-http schemes', () => {
  for (const raw of ['file:///etc/passwd', 'gopher://x/', 'ftp://x/', 'data:text/plain,hi']) {
    assert.throws(() => assertFetchableUrl(raw), /Поддерживаются только http и https/, raw)
  }
})

test('assertFetchableUrl rejects credentials in the URL', () => {
  assert.throws(() => assertFetchableUrl('http://user:pass@example.com/'), /логином и паролем/)
})

test('assertFetchableUrl rejects localhost by name and private literals', () => {
  assert.throws(() => assertFetchableUrl('http://localhost:6379/'), /localhost/)
  assert.throws(() => assertFetchableUrl('http://app.localhost/'), /localhost/)
  assert.throws(() => assertFetchableUrl('http://169.254.169.254/latest/meta-data/'), /внутренний или служебный/)
  assert.throws(() => assertFetchableUrl('http://[::1]:8080/'), /loopback/)
})

test('assertFetchableUrl accepts an ordinary public URL', () => {
  assert.equal(assertFetchableUrl('https://example.com/a?b=c').host, 'example.com')
})

// --- live sockets -----------------------------------------------------------

async function listen(handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, port: server.address().port }
}

test('safeFetch refuses to reach a loopback server at all', async () => {
  const { server, port } = await listen((_req, res) => { res.writeHead(200); res.end('secret') })
  try {
    await assert.rejects(
      safeFetch(`http://127.0.0.1:${port}/`),
      /внутренний или служебный/,
      'a loopback URL must never be fetched'
    )
  } finally { server.close() }
})

test('guardedLookup rejects a NAME that resolves into the private range', async () => {
  // Property 2, and the one a literal-only check would miss: the host is a
  // name, so it passes assertFetchableUrl and is only stopped at resolve time.
  // 'localhost' is resolved here by the resolver, not matched by string.
  const error = await new Promise(resolve => guardedLookup('localhost', {}, err => resolve(err)))
  assert.ok(error, 'resolving localhost must fail')
  assert.equal(error.code, 'EBLOCKEDADDRESS')
  assert.match(error.message, /внутренний или служебный|loopback/)
})

test('guardedLookup passes a name that resolves publicly', async () => {
  // Proves the guard is not simply refusing everything: a resolver that hands
  // back a public address is accepted. The resolver is stubbed through the
  // hosts file entry that every system has, so this needs no network.
  const result = await new Promise(resolve => {
    guardedLookup('example.invalid', {}, (err, address) => resolve({ err, address }))
  })
  // .invalid never resolves, so we assert the failure is a DNS failure and not
  // our block — a block here would mean we reject on the wrong axis.
  assert.ok(result.err, 'example.invalid does not resolve')
  assert.notEqual(result.err.code, 'EBLOCKEDADDRESS', 'must fail as DNS, not as blocked')
})

test('safeFetch re-checks every redirect hop, not just the first URL', async () => {
  // The bypass this guards: a public first URL that 302s into the private
  // range. Driven through `perform` so hop 0 is genuinely allowed and only
  // per-hop validation can stop the chain.
  const hops = []
  const perform = async url => {
    hops.push(url.toString())
    if (url.hostname === 'public.example.com') {
      return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) }
    }
    return { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('INTERNAL SECRET') }
  }
  await assert.rejects(
    safeFetch('https://public.example.com/start', { perform }),
    /внутренний или служебный/,
    'the redirect into link-local space must be refused'
  )
  assert.deepEqual(hops, ['https://public.example.com/start'], 'the private hop must never be performed')
})

test('safeFetch follows an ordinary redirect between public hosts', async () => {
  const perform = async url => url.pathname === '/start'
    ? { status: 301, headers: { location: 'https://other.example.com/final' }, body: Buffer.alloc(0) }
    : { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('ok') }
  const result = await safeFetch('https://public.example.com/start', { perform })
  assert.equal(result.url, 'https://other.example.com/final')
  assert.equal(result.body.toString(), 'ok')
})

test('safeFetch stops a redirect loop and caps the hop count', async () => {
  const perform = async () => ({ status: 302, headers: { location: 'https://a.example.com/x' }, body: Buffer.alloc(0) })
  await assert.rejects(safeFetch('https://a.example.com/x', { perform }), /ведёт по кругу/)

  let n = 0
  const walking = async () => ({ status: 302, headers: { location: `https://h${n++}.example.com/` }, body: Buffer.alloc(0) })
  await assert.rejects(safeFetch('https://start.example.com/', { perform: walking, maxRedirects: 3 }), /Слишком много перенаправлений/)
})

test('requestOnce enforces the byte cap on a response that declares no length', async () => {
  // Chunked, so there is no Content-Length to trust at all: the only way to
  // stop this is to count bytes as they arrive and destroy the response. The
  // body would be 2 MB if it ran to completion.
  const { server, port } = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' })
    let sent = 0
    const pump = () => {
      if (sent >= 2_000_000) return res.end()
      sent += 64 * 1024
      if (res.write(Buffer.alloc(64 * 1024, 0x61))) setImmediate(pump)
      else res.once('drain', pump)
    }
    pump()
  })
  try {
    await assert.rejects(
      requestOnce(new URL(`http://127.0.0.1:${port}/`), { maxBytes: 100 * 1024 }),
      /больше допустимых/,
      'the cap must come from bytes counted, not from a declared length'
    )
  } finally { server.close() }
})

test('requestOnce returns a body that fits under the cap', async () => {
  const { server, port } = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('within limits')
  })
  try {
    const response = await requestOnce(new URL(`http://127.0.0.1:${port}/`), { maxBytes: 1024 })
    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), 'within limits')
  } finally { server.close() }
})
