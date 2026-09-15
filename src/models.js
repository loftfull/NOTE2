// The model registry: the list of AI models the user has added, plus the rules
// for creating, validating and selecting them.
//
// Kept apart from both the UI and the transport on purpose. App.jsx renders it,
// providers.js talks to the network, and this module owns the shape and the
// invariants — which is what makes the registry testable without a browser.
//
// API keys are deliberately NOT stored here. The registry holds a reference
// (`apiKeyRef`); the secret itself goes through secure-credentials.js, which is
// the Android Keystore natively and sessionStorage on the web. That also means
// a key never reaches a settings export or a sync payload.

import { isKeylessProvider, providerInfo, PROVIDERS } from './providers.js'

export const MODEL_ROLES = {
  chat: 'chat',
  embed: 'embed',
  vision: 'vision'
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `m_${crypto.randomUUID().slice(0, 8)}`
  } catch { /* fall through */ }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function keyRefFor(id) {
  return `note2-model-key:${id}`
}

/** Suggested starting point for a provider, so adding a model is a few taps. */
export function draftModelFor(provider = 'ollama') {
  const info = providerInfo(provider)
  return {
    provider,
    label: '',
    baseUrl: info.baseUrl || '',
    model: '',
    roles: [MODEL_ROLES.chat],
    apiKey: ''
  }
}

export function validateModel(draft = {}) {
  const errors = {}
  const provider = draft.provider || 'custom'
  const info = providerInfo(provider)

  if (!String(draft.model || '').trim()) errors.model = 'Укажите идентификатор модели'

  const baseUrl = String(draft.baseUrl || '').trim()
  if (!baseUrl) {
    errors.baseUrl = 'Укажите адрес сервера'
  } else if (!info.gateway) {
    // The gateway is allowed to be a relative path; a real provider is not,
    // because a relative URL in a WebView points at the app's own bundle.
    try {
      const url = new URL(baseUrl)
      if (!['http:', 'https:'].includes(url.protocol)) errors.baseUrl = 'Поддерживаются только http и https'
    } catch {
      errors.baseUrl = 'Адрес должен быть полным, например https://api.groq.com/openai/v1'
    }
  }

  if (!isKeylessProvider(provider) && !info.gateway && !String(draft.apiKey || '').trim() && !draft.hasStoredKey) {
    errors.apiKey = 'Этот провайдер требует ключ'
  }

  if (!Array.isArray(draft.roles) || !draft.roles.length) errors.roles = 'Выберите хотя бы одну роль'

  return { valid: Object.keys(errors).length === 0, errors }
}

/** Builds the stored record. The secret is returned separately, never inlined. */
export function createModelRecord(draft = {}) {
  const { valid, errors } = validateModel(draft)
  if (!valid) {
    const first = Object.values(errors)[0]
    throw new Error(first || 'Модель заполнена неверно')
  }
  const id = draft.id || newId()
  const provider = draft.provider || 'custom'
  const now = Date.now()
  return {
    record: {
      id,
      provider,
      label: String(draft.label || '').trim() || String(draft.model).trim(),
      baseUrl: String(draft.baseUrl).trim(),
      model: String(draft.model).trim(),
      roles: [...new Set(draft.roles)],
      apiKeyRef: isKeylessProvider(provider) ? null : keyRefFor(id),
      free: Boolean(providerInfo(provider).free),
      local: Boolean(providerInfo(provider).local),
      createdAt: draft.createdAt || now,
      updatedAt: now
    },
    secret: isKeylessProvider(provider) ? '' : String(draft.apiKey || '')
  }
}

export function upsertModel(models = [], record) {
  const list = Array.isArray(models) ? [...models] : []
  const at = list.findIndex(m => m.id === record.id)
  if (at === -1) list.push(record)
  else list[at] = { ...list[at], ...record }
  return list
}

export function removeModel(models = [], id) {
  return (Array.isArray(models) ? models : []).filter(m => m.id !== id)
}

/**
 * Pick the model to use for a role.
 *
 * Preference order: the explicitly selected one (if it can do the job), then
 * any model that declares the role. Returns null rather than guessing — the
 * caller must then say "не настроено", never quietly produce something else.
 */
export function selectModel(models = [], role = MODEL_ROLES.chat, activeId = '') {
  const list = (Array.isArray(models) ? models : []).filter(m => m?.id)
  const can = m => Array.isArray(m.roles) && m.roles.includes(role)
  const active = list.find(m => m.id === activeId)
  if (active && can(active)) return active
  return list.find(can) || null
}

export function describeModel(model) {
  if (!model) return 'Модель не выбрана'
  const info = PROVIDERS[model.provider]
  const where = info?.label || model.provider
  return `${model.label} · ${where}`
}

/** Strips anything secret before a model list is exported or synced. */
export function portableModels(models = []) {
  return (Array.isArray(models) ? models : []).map(({ apiKeyRef, ...rest }) => rest)
}
