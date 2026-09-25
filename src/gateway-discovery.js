// Finds out whether a gateway is serving this app, and wires up exactly the
// capabilities it actually has.
//
// The endpoints default to empty on purpose: a preset '/api/embed' that
// nothing serves produced a guaranteed HTTP 404 on every single import. But
// empty has its own cost — when the gateway IS serving the app, the user has
// to type '/api/ai' by hand to get features that are already running.
//
// So: ask. /api/health reports which capabilities are wired, and only those
// get an endpoint. A capability the gateway reports as false stays unset, so
// the UI keeps showing it as unavailable instead of offering a button that
// 503s.
//
// This never overwrites a value the user set. Someone pointing at a gateway on
// another host, or at no gateway at all, keeps their choice.

import { isNativeRuntime } from './gateway-url.js'

const HEALTH_TIMEOUT_MS = 2500

/** Which setting each capability fills in, when the gateway reports it. */
export const CAPABILITY_ENDPOINTS = {
  ai: ['aiEndpoint', '/api/ai'],
  embed: ['embedEndpoint', '/api/embed'],
  vision: ['visionEndpoint', '/api/vision'],
  transcribe: ['transcribeEndpoint', '/api/transcribe'],
  youtube: ['youtubeEndpoint', '/api/youtube']
}

/**
 * Asks the same origin whether a gateway is there. Returns null when there is
 * none — including when something answers but is not our gateway, which is the
 * case that matters: a static host serving index.html for every path would
 * otherwise look like a positive answer.
 */
export async function probeGateway(fetchImpl = globalThis.fetch, origin = '') {
  // A relative probe is meaningless in a native WebView: it resolves against
  // the app bundle, so it can only ever find the app's own files.
  if (!origin && isNativeRuntime()) return null

  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS) : null
  try {
    const response = await fetchImpl(`${String(origin).replace(/\/$/, '')}/api/health`, {
      signal: controller?.signal,
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return null
    if (!String(response.headers.get('content-type') || '').includes('application/json')) return null

    const data = await response.json()
    // The service name is the check that matters. Without it, any JSON API on
    // the same origin would be treated as our gateway.
    if (data?.service !== 'noteai-gateway') return null
    return { capabilities: data.capabilities || {}, origin: String(origin || '') }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * The settings to apply given a probe result. Returns an empty object when
 * there is nothing to change, so a caller can skip the state update entirely.
 */
export function endpointsFromProbe(settings = {}, probe = null) {
  if (!probe) return {}
  const prefix = String(probe.origin || '').replace(/\/$/, '')
  const patch = {}

  for (const [capability, [key, path]] of Object.entries(CAPABILITY_ENDPOINTS)) {
    if (!probe.capabilities?.[capability]) continue
    // Only fill a blank. A value the user chose is theirs.
    if (String(settings[key] || '').trim()) continue
    patch[key] = `${prefix}${path}`
  }
  return patch
}

/** Convenience: probe and compute the patch in one call. */
export async function discoverGateway(settings = {}, fetchImpl = globalThis.fetch, origin = '') {
  const probe = await probeGateway(fetchImpl, origin)
  return { probe, patch: endpointsFromProbe(settings, probe) }
}
