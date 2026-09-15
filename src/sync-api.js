import { createSyncSnapshot, validateSyncSnapshot } from '../sync-core.mjs'

function baseEndpoint(value = '/api/sync') { return String(value || '/api/sync').replace(/\/$/, '') }

async function dataOrError(response, fallback) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || fallback || `Sync returned ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

function headers(token, json = false) {
  const out = { Authorization: `Bearer ${token}` }
  if (json) out['Content-Type'] = 'application/json'
  return out
}

export async function pullWorkspaceSync({ endpoint = '/api/sync', workspaceId = 'default', token }) {
  if (!token) throw new Error('Sync token is required')
  const response = await fetch(`${baseEndpoint(endpoint)}/${encodeURIComponent(workspaceId)}`, { headers: headers(token) })
  const data = await dataOrError(response, 'Unable to pull workspace')
  return { ...data, snapshot: validateSyncSnapshot(data.snapshot) }
}

export async function pushWorkspaceSync({ endpoint = '/api/sync', workspaceId = 'default', token, baseRevision = 0, workspace, settings, sources, chunks }) {
  if (!token) throw new Error('Sync token is required')
  const snapshot = createSyncSnapshot({ workspace, settings, sources, chunks })
  const response = await fetch(`${baseEndpoint(endpoint)}/${encodeURIComponent(workspaceId)}`, {
    method: 'PUT', headers: headers(token, true), body: JSON.stringify({ baseRevision: Number(baseRevision || 0), snapshot })
  })
  return dataOrError(response, 'Unable to push workspace')
}
