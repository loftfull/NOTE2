import { Capacitor, registerPlugin } from '@capacitor/core'
import { clearApiSessionAuth } from './api-session.js'
export { apiSessionConfigured, apiSessionOrigin, authenticatedFetch, clearApiSessionAuth, setApiSessionAuth } from './api-session.js'

const SecureCredentials = registerPlugin('SecureCredentials')
const WEB_PREFIX = 'noteai:session-secret:'
function webStorage() { try { return window.sessionStorage } catch { return null } }

export async function setCredential(key, value) {
  const name = String(key || '').trim()
  if (!name) throw new Error('Credential key is required')
  if (Capacitor.isNativePlatform()) { await SecureCredentials.set({ key: name, value: String(value || '') }); return }
  webStorage()?.setItem(`${WEB_PREFIX}${name}`, String(value || ''))
}
export async function getCredential(key) {
  const name = String(key || '').trim(); if (!name) return ''
  if (Capacitor.isNativePlatform()) { try { return String((await SecureCredentials.get({ key: name }))?.value || '') } catch { return '' } }
  return webStorage()?.getItem(`${WEB_PREFIX}${name}`) || ''
}
export async function removeCredential(key) {
  const name = String(key || '').trim(); if (!name) return
  if (Capacitor.isNativePlatform()) { try { await SecureCredentials.remove({ key: name }) } catch {}; return }
  webStorage()?.removeItem(`${WEB_PREFIX}${name}`)
}
export async function clearCredentials() {
  if (Capacitor.isNativePlatform()) { try { await SecureCredentials.clear() } catch {}; clearApiSessionAuth(); return }
  const store = webStorage(); if (store) for (let i = store.length - 1; i >= 0; i -= 1) { const key = store.key(i); if (key?.startsWith(WEB_PREFIX)) store.removeItem(key) }
  clearApiSessionAuth()
}
export function credentialSecurityMode() { return Capacitor.isNativePlatform() ? 'android-keystore' : 'session-only' }
