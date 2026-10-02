const DB_KEY = 'noteai:v3:workspace'
const SETTINGS_KEY = 'noteai:v3:settings'

export const defaultWorkspace = { notes: [], tasks: [], chats: [] }
export const defaultSettings = {
  theme: 'system',
  language: 'ru',
  fontScale: 'normal',
  density: 'compact',
  aiEndpoint: '/api/ai',
  embedEndpoint: '/api/embed',
  visionEndpoint: '/api/vision',
  transcribeEndpoint: '/api/transcribe',
  youtubeEndpoint: '/api/youtube',
  syncEndpoint: '/api/sync',
  syncWorkspaceId: 'default',
  syncToken: '',
  syncRevision: 0,
  accountEndpoint: '/api/account',
  accountWorkspaceId: 'default',
  accountRevision: 0,
  accountEmail: '',
  aiModel: 'server-default',
  profile: { name: 'Локальный профиль', email: 'local@noteai.app' }
}

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

export function loadWorkspace() {
  return { ...defaultWorkspace, ...safeParse(localStorage.getItem(DB_KEY), {}) }
}

export function saveWorkspace(workspace) {
  localStorage.setItem(DB_KEY, JSON.stringify(workspace))
}

export function loadSettings() {
  return { ...defaultSettings, ...safeParse(localStorage.getItem(SETTINGS_KEY), {}) }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function exportBundle(workspace, settings, extras = {}) {
  const { syncToken, ...portableSettings } = settings || {}
  return JSON.stringify({ format: 'noteai-v3.6', exportedAt: new Date().toISOString(), workspace, settings: portableSettings, sources: extras.sources || [], chunks: extras.chunks || [] }, null, 2)
}

export function importBundle(text) {
  const parsed = JSON.parse(text)
  if (!['noteai-v3','noteai-v3.1','noteai-v3.2','noteai-v3.3','noteai-v3.4','noteai-v3.5','noteai-v3.6'].includes(parsed?.format) || !parsed.workspace) throw new Error('Unsupported NoteAI backup')
  return { workspace: { ...defaultWorkspace, ...parsed.workspace }, settings: { ...defaultSettings, ...(parsed.settings || {}) }, sources: Array.isArray(parsed.sources) ? parsed.sources : [], chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [] }
}
