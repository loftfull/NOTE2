function fallbackHref() {
  try { return window.location.href } catch { return 'http://localhost/' }
}

export function gatewayApiEndpointFor(endpoint = '/api/ai', path = '/api/source-url', baseHref = fallbackHref()) {
  try {
    const base = new URL(endpoint || '/api/ai', baseHref)
    return new URL(path, base.origin).toString()
  } catch {
    return path
  }
}

export function healthEndpointFor(endpoint = '/api/ai', baseHref = fallbackHref()) {
  return gatewayApiEndpointFor(endpoint, '/api/health', baseHref)
}
