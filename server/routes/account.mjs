// /api/account/* — accounts, device sessions and the synced workspace.
//
// All the cryptography is in account-auth-core.mjs, which survived the upload:
// scrypt password records, split session tokens (`nai1.<id>.<secret>`) where
// only the SHA-256 of the secret is stored, and constant-time comparison. This
// module is the HTTP shape around it, plus the two rules the core cannot
// enforce on its own:
//
//   - registration is closed by default, so a gateway reachable from the
//     internet does not accumulate strangers' accounts;
//   - a push carries the revision it was based on, and a mismatch is a 409
//     rather than an overwrite. Two devices editing the same workspace is the
//     normal case, and last-write-wins loses a day's notes without a trace.

import {
  accountIdForEmail, createPasswordRecord, createSessionCredential, normalizeEmail,
  parseSessionToken, publicAccount, publicSession, sessionExpiry, validEmail,
  validatePassword, verifyPassword, verifySessionSecret
} from '../../account-auth-core.mjs'
import { sanitizeSyncSettings, validWorkspaceId, validateSyncSnapshot } from '../../sync-core.mjs'
import { HttpError, bearerToken } from '../http.mjs'

const GENERIC_SIGNIN_FAILURE = 'Неверный адрес или пароль'

/** Resolves a bearer token to a live session and its account, or throws 401. */
export async function requireSession(store, token) {
  const parsed = parseSessionToken(token)
  if (!parsed) throw new HttpError(401, 'Требуется вход в аккаунт')

  const db = await store.readAccounts()
  const session = db.sessions?.[parsed.sessionId]
  if (!session) throw new HttpError(401, 'Сессия не найдена или отозвана')
  if (!verifySessionSecret(parsed.secret, session.secretHash)) throw new HttpError(401, 'Некорректный токен сессии')
  if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) throw new HttpError(401, 'Срок действия сессии истёк')

  const account = db.accounts?.[session.accountId]
  if (!account) throw new HttpError(401, 'Аккаунт не найден')
  return { session: { ...session, id: parsed.sessionId }, account }
}

function issueSession(db, accountId, deviceName) {
  const credential = createSessionCredential()
  const now = new Date().toISOString()
  db.sessions[credential.sessionId] = {
    id: credential.sessionId,
    accountId,
    secretHash: credential.secretHash,
    deviceName: String(deviceName || 'NoteAI device').slice(0, 120),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: sessionExpiry()
  }
  return credential
}

export async function handleRegister({ req, body, config, store }) {
  // Closed by default. An open gateway with no token is a choice the operator
  // has to make explicitly, not a default they discover after the fact.
  if (!config.allowOpenRegistration) {
    const expected = config.accountRegistrationToken
    if (!expected) {
      throw new HttpError(403, 'Регистрация закрыта. Задайте NOTE2_REGISTRATION_TOKEN или NOTE2_ALLOW_OPEN_REGISTRATION=1.')
    }
    const offered = String(req?.headers?.['x-registration-token'] || '')
    if (offered !== expected) throw new HttpError(403, 'Неверный токен регистрации')
  }

  const email = normalizeEmail(body?.email)
  if (!validEmail(email)) throw new HttpError(400, 'Некорректный адрес электронной почты')
  try {
    validatePassword(body?.password)
  } catch (error) {
    throw new HttpError(400, error.message === 'Password must be at least 12 characters'
      ? 'Пароль должен быть не короче 12 символов'
      : 'Пароль слишком длинный')
  }

  const id = accountIdForEmail(email)
  const passwordRecord = await createPasswordRecord(body.password)

  return store.updateAccounts(async db => {
    if (db.accounts[id]) throw new HttpError(409, 'Аккаунт с таким адресом уже существует')
    db.accounts[id] = {
      id,
      email,
      displayName: String(body?.displayName || '').slice(0, 160),
      password: passwordRecord,
      createdAt: new Date().toISOString()
    }
    const credential = issueSession(db, id, body?.deviceName)
    return { account: publicAccount(db.accounts[id]), token: credential.token, session: publicSession({ ...db.sessions[credential.sessionId], current: true }) }
  })
}

export async function handleLogin({ body, store }) {
  const email = normalizeEmail(body?.email)
  // Both failures return the same message: distinguishing "no such account"
  // from "wrong password" turns this endpoint into an account enumerator.
  if (!validEmail(email)) throw new HttpError(401, GENERIC_SIGNIN_FAILURE)

  const db = await store.readAccounts()
  const id = accountIdForEmail(email)
  const account = db.accounts?.[id]
  const ok = account ? await verifyPassword(body?.password, account.password) : false
  if (!ok) throw new HttpError(401, GENERIC_SIGNIN_FAILURE)

  return store.updateAccounts(async current => {
    const credential = issueSession(current, id, body?.deviceName)
    return { account: publicAccount(current.accounts[id]), token: credential.token, session: publicSession({ ...current.sessions[credential.sessionId], current: true }) }
  })
}

export async function handleMe({ req, store }) {
  const { account } = await requireSession(store, bearerToken(req))
  return { account: publicAccount(account) }
}

export async function handleLogout({ req, store }) {
  const { session } = await requireSession(store, bearerToken(req))
  return store.updateAccounts(async db => {
    delete db.sessions[session.id]
    return { ok: true }
  })
}

export async function handleListSessions({ req, store }) {
  const { account, session } = await requireSession(store, bearerToken(req))
  const db = await store.readAccounts()
  const sessions = Object.values(db.sessions || {})
    .filter(entry => entry.accountId === account.id)
    .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
    .map(entry => publicSession({ ...entry, current: entry.id === session.id }))
  return { sessions }
}

export async function handleRevokeSession({ req, params, store }) {
  const { account, session } = await requireSession(store, bearerToken(req))
  const targetId = String(params.sessionId || '')
  return store.updateAccounts(async db => {
    const target = db.sessions?.[targetId]
    // Scoped to the caller's own account, and reported as not-found rather
    // than forbidden so one account cannot probe another's session ids.
    if (!target || target.accountId !== account.id) throw new HttpError(404, 'Сессия не найдена')
    delete db.sessions[targetId]
    return { ok: true, current: targetId === session.id }
  })
}

function workspaceIdFrom(params) {
  const workspaceId = String(params.workspaceId || 'default')
  if (!validWorkspaceId(workspaceId)) throw new HttpError(400, 'Некорректный идентификатор рабочего пространства')
  return workspaceId
}

export async function handlePullWorkspace({ req, params, store }) {
  const { account } = await requireSession(store, bearerToken(req))
  const workspaceId = workspaceIdFrom(params)
  const stored = await store.readWorkspace(account.id, workspaceId)
  if (!stored) throw new HttpError(404, 'Для этого рабочего пространства ещё нет сохранённой копии')
  return { workspaceId, revision: stored.revision, updatedAt: stored.updatedAt, snapshot: stored.snapshot }
}

export async function handlePushWorkspace({ req, params, body, store }) {
  const { account } = await requireSession(store, bearerToken(req))
  const workspaceId = workspaceIdFrom(params)

  let snapshot
  try {
    snapshot = validateSyncSnapshot(body?.snapshot)
  } catch (error) {
    throw new HttpError(400, `Снимок не принят: ${error.message}`)
  }
  // Never persist another device's credentials, even if a client sends them.
  snapshot = { ...snapshot, settings: sanitizeSyncSettings(snapshot.settings || {}) }

  const baseRevision = Number(body?.baseRevision || 0)

  return store.updateWorkspace(account.id, workspaceId, async current => {
    const currentRevision = Number(current?.revision || 0)
    if (currentRevision !== baseRevision) {
      // The client shows this as "pull before pushing again", which is the
      // only honest option: the gateway cannot merge two note sets.
      throw Object.assign(new HttpError(409, 'На сервере более новая версия. Сначала выполните загрузку.'), {
        data: { currentRevision }
      })
    }
    const next = {
      format: 'noteai-workspace-v1',
      ownerId: account.id,
      workspaceId,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      snapshot
    }
    return { next, result: { workspaceId, revision: next.revision, updatedAt: next.updatedAt } }
  })
}
