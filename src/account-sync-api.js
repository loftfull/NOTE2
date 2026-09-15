import { createSyncSnapshot, validateSyncSnapshot } from '../sync-core.mjs'

function base(value = '/api/account') { return String(value || '/api/account').replace(/\/$/, '') }
async function bodyOrError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || fallback || `Request returned ${response.status}`)
    error.status = response.status; error.data = data; throw error
  }
  return data
}
function auth(token, json = false) { const headers = { Authorization: `Bearer ${token}` }; if (json) headers['Content-Type'] = 'application/json'; return headers }

export async function registerAccount({ endpoint = '/api/account', email, password, displayName = '', registrationToken = '', deviceName = 'NoteAI device' }) {
  const response = await fetch(`${base(endpoint)}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(registrationToken ? { 'X-Registration-Token': registrationToken } : {}) }, body: JSON.stringify({ email, password, displayName, deviceName }) })
  return bodyOrError(response, 'Unable to create account')
}
export async function loginAccount({ endpoint = '/api/account', email, password, deviceName = 'NoteAI device' }) {
  const response = await fetch(`${base(endpoint)}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, deviceName }) })
  return bodyOrError(response, 'Unable to sign in')
}
export async function accountMe({ endpoint = '/api/account', token }) {
  return bodyOrError(await fetch(`${base(endpoint)}/me`, { headers: auth(token) }), 'Unable to read account')
}
export async function logoutAccount({ endpoint = '/api/account', token }) {
  return bodyOrError(await fetch(`${base(endpoint)}/logout`, { method: 'POST', headers: auth(token) }), 'Unable to sign out')
}
export async function listAccountSessions({ endpoint = '/api/account', token }) {
  return bodyOrError(await fetch(`${base(endpoint)}/sessions`, { headers: auth(token) }), 'Unable to list sessions')
}
export async function revokeAccountSession({ endpoint = '/api/account', token, sessionId }) {
  return bodyOrError(await fetch(`${base(endpoint)}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: auth(token) }), 'Unable to revoke session')
}
export async function pullAccountSync({ endpoint = '/api/account', workspaceId = 'default', token }) {
  const data = await bodyOrError(await fetch(`${base(endpoint)}/sync/${encodeURIComponent(workspaceId)}`, { headers: auth(token) }), 'Unable to pull workspace')
  return { ...data, snapshot: validateSyncSnapshot(data.snapshot) }
}
export async function pushAccountSync({ endpoint = '/api/account', workspaceId = 'default', token, baseRevision = 0, workspace, settings, sources, chunks }) {
  const snapshot = createSyncSnapshot({ workspace, settings, sources, chunks })
  return bodyOrError(await fetch(`${base(endpoint)}/sync/${encodeURIComponent(workspaceId)}`, { method: 'PUT', headers: auth(token, true), body: JSON.stringify({ baseRevision: Number(baseRevision || 0), snapshot }) }), 'Unable to push workspace')
}
