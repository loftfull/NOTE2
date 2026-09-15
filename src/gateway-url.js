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

// Detected off the global rather than by importing @capacitor/core, so this
// module stays usable from tests and from the plain web build.
export function isNativeRuntime() {
  try { return Boolean(globalThis.Capacitor?.isNativePlatform?.()) } catch { return false }
}

export function isRelativeEndpoint(endpoint) {
  const value = String(endpoint || '').trim()
  if (!value) return true
  return !/^https?:\/\//i.test(value)
}

/**
 * Decide whether an endpoint can actually be called on this platform.
 *
 * On the web a relative '/api/ai' is correct: the gateway is same-origin. In a
 * Capacitor WebView the origin is the app itself (https://localhost), so the
 * same value resolves to the bundled index.html and the client gets HTML back
 * where it expected JSON. Rather than let that reach the network and surface
 * as a parse error, refuse it here and say what to configure.
 *
 * Returns { url, error }: exactly one is non-null.
 */
export function resolveGatewayEndpoint(endpoint, { native = isNativeRuntime(), baseHref = fallbackHref() } = {}) {
  const value = String(endpoint || '').trim()
  if (!value) return { url: null, error: null } // not configured at all — caller decides

  if (native && isRelativeEndpoint(value)) {
    return {
      url: null,
      error: 'В Android-сборке нужен полный HTTPS-адрес шлюза (например https://gateway.example/api/ai). Относительный путь указывает на само приложение.'
    }
  }

  try {
    const url = new URL(value, baseHref)
    if (native && url.protocol !== 'https:') {
      return { url: null, error: 'В Android-сборке шлюз должен использовать HTTPS.' }
    }
    return { url: url.toString(), error: null }
  } catch {
    return { url: null, error: `Некорректный адрес шлюза: ${value}` }
  }
}
