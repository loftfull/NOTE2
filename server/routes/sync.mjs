// /api/sync/:workspaceId — the pre-account sync mode the client still offers
// under "Старый режим синхронизации".
//
// It predates accounts: one shared token, no users, no devices. It is kept
// because the client's UI still exposes it and removing a working path is not
// this change's business — but it is off unless NOTE2_SYNC_TOKEN is set, and
// its snapshots live under their own owner so they can never collide with an
// account's workspace.

import { timingSafeEqual } from 'node:crypto'
import { sanitizeSyncSettings, validWorkspaceId, validateSyncSnapshot } from '../../sync-core.mjs'
import { HttpError, bearerToken } from '../http.mjs'

const LEGACY_OWNER = 'legacy'

function tokensMatch(offered, expected) {
  const a = Buffer.from(String(offered || ''))
  const b = Buffer.from(String(expected || ''))
  // Compared in constant time, and only after the lengths match, since
  // timingSafeEqual throws on a length mismatch.
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

function requireLegacyToken(req, config) {
  const expected = config.legacySyncToken
  if (!expected) {
    throw new HttpError(503, 'Старый режим синхронизации выключен. Задайте NOTE2_SYNC_TOKEN, чтобы включить его.')
  }
  if (!tokensMatch(bearerToken(req), expected)) throw new HttpError(401, 'Неверный токен синхронизации')
}

function workspaceIdFrom(params) {
  const workspaceId = String(params.workspaceId || 'default')
  if (!validWorkspaceId(workspaceId)) throw new HttpError(400, 'Некорректный идентификатор рабочего пространства')
  return workspaceId
}

export async function handleLegacyPull({ req, params, config, store }) {
  requireLegacyToken(req, config)
  const workspaceId = workspaceIdFrom(params)
  const stored = await store.readWorkspace(LEGACY_OWNER, workspaceId)
  if (!stored) throw new HttpError(404, 'Для этого рабочего пространства ещё нет сохранённой копии')
  return { workspaceId, revision: stored.revision, updatedAt: stored.updatedAt, snapshot: stored.snapshot }
}

export async function handleLegacyPush({ req, params, body, config, store }) {
  requireLegacyToken(req, config)
  const workspaceId = workspaceIdFrom(params)

  let snapshot
  try {
    snapshot = validateSyncSnapshot(body?.snapshot)
  } catch (error) {
    throw new HttpError(400, `Снимок не принят: ${error.message}`)
  }
  snapshot = { ...snapshot, settings: sanitizeSyncSettings(snapshot.settings || {}) }

  const baseRevision = Number(body?.baseRevision || 0)
  return store.updateWorkspace(LEGACY_OWNER, workspaceId, async current => {
    const currentRevision = Number(current?.revision || 0)
    if (currentRevision !== baseRevision) {
      throw Object.assign(new HttpError(409, 'На сервере более новая версия. Сначала выполните загрузку.'), {
        data: { currentRevision }
      })
    }
    const next = {
      format: 'noteai-workspace-v1',
      ownerId: LEGACY_OWNER,
      workspaceId,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      snapshot
    }
    return { next, result: { workspaceId, revision: next.revision, updatedAt: next.updatedAt } }
  })
}
