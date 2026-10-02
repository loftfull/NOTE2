export const SYNC_FORMAT = 'noteai-sync-v1'

export function validWorkspaceId(value = '') {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(value || ''))
}

export function sanitizeSyncSettings(settings = {}) {
  const { syncToken, syncRevision, syncEndpoint, syncWorkspaceId, accountEndpoint, accountWorkspaceId, accountRevision, accountEmail, ...safe } = settings || {}
  return safe
}

export function createSyncSnapshot({ workspace, settings, sources = [], chunks = [] } = {}) {
  return {
    format: SYNC_FORMAT,
    createdAt: new Date().toISOString(),
    workspace: workspace || { notes: [], tasks: [], chats: [] },
    settings: sanitizeSyncSettings(settings || {}),
    sources: Array.isArray(sources) ? sources : [],
    chunks: Array.isArray(chunks) ? chunks : []
  }
}

export function validateSyncSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== SYNC_FORMAT) throw new Error('Unsupported sync snapshot')
  if (!snapshot.workspace || !Array.isArray(snapshot.workspace.notes) || !Array.isArray(snapshot.workspace.tasks)) throw new Error('Invalid workspace snapshot')
  if (!Array.isArray(snapshot.sources) || !Array.isArray(snapshot.chunks)) throw new Error('Invalid source snapshot')
  return snapshot
}
