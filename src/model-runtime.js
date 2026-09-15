// Resolves which model should serve a request, fetches its key, and runs it.
//
// Before this, every AI call site repeated the same three arguments
// (endpoint, model, system) and none of them knew about the registry. One
// helper means adding a provider or changing selection rules touches one place,
// and the call sites say what they want rather than how to get it.

import { runAiTask } from './ai.js'
import { MODEL_ROLES, selectModel } from './models.js'
import { getCredential } from './secure-credentials.js'

/** The registry entry for a role, with its secret attached, or null. */
export async function resolveModel(settings = {}, role = MODEL_ROLES.chat) {
  const record = selectModel(settings.models, role, settings.activeModelId)
  if (!record) return null
  const apiKey = record.apiKeyRef ? await getCredential(record.apiKeyRef).catch(() => '') : ''
  return { modelRecord: record, apiKey }
}

/**
 * Run an AI task using the best available route:
 *   1. a model from the registry that can do this role;
 *   2. otherwise the legacy gateway endpoint, if one is configured;
 *   3. otherwise local extraction, clearly marked as local.
 *
 * Always returns runAiTask's { text, origin, action, error } shape, so the
 * fail-closed contract holds whichever route was taken.
 */
export async function runTask(settings = {}, { action, input, system, history, role = MODEL_ROLES.chat, signal } = {}) {
  const resolved = await resolveModel(settings, role)
  return runAiTask({
    ...(resolved || {}),
    endpoint: resolved ? '' : settings.aiEndpoint,
    model: settings.aiModel,
    action,
    input,
    system,
    history,
    signal
  })
}

/** True when anything at all can answer — used to disable AI affordances. */
export function hasAiRoute(settings = {}) {
  return Boolean(selectModel(settings.models, MODEL_ROLES.chat, settings.activeModelId) || settings.aiEndpoint)
}
