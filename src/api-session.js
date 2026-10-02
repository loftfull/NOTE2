let apiSession = { token: '', origin: '' }

function baseHref() {
  try { return window.location.href } catch { return 'http://localhost/' }
}
function originFor(endpoint) {
  try { return new URL(endpoint || '/api/account', baseHref()).origin } catch { return '' }
}

export function setApiSessionAuth(token = '', accountEndpoint = '/api/account') {
  apiSession = { token: String(token || ''), origin: token ? originFor(accountEndpoint) : '' }
}
export function clearApiSessionAuth() { apiSession = { token: '', origin: '' } }
export function apiSessionOrigin() { return apiSession.origin }
export function apiSessionConfigured() { return Boolean(apiSession.token && apiSession.origin) }

export async function authenticatedFetch(input, init = {}) {
  const raw = typeof input === 'string' || input instanceof URL ? input : input.url
  const target = new URL(raw, baseHref())
  const headers = new Headers(init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined))
  if (apiSession.token && apiSession.origin && target.origin === apiSession.origin && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${apiSession.token}`)
  return fetch(input, { ...init, headers })
}
