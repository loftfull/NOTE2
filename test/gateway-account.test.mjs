// Accounts, device sessions and workspace sync, driven over HTTP against a
// real gateway with a real data directory.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGateway } from '../server.mjs'
import { loadConfig } from '../server/config.mjs'
import { createSyncSnapshot } from '../sync-core.mjs'

const PASSWORD = 'correct horse battery staple'
const TOKEN = 'let-me-in'

async function withGateway(env, run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'note2-test-'))
  const config = loadConfig({ NOTE2_DATA_DIR: dataDir, NOTE2_REGISTRATION_TOKEN: TOKEN, NOTE2_STATIC_DIR: 'no-such-dir', ...env })
  const server = createGateway(config)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`

  const api = async (path, { method = 'GET', token = '', body, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, data: await response.json().catch(() => ({})) }
  }

  const register = (email = 'user@example.com', password = PASSWORD) =>
    api('/api/account/register', { method: 'POST', headers: { 'X-Registration-Token': TOKEN }, body: { email, password, deviceName: 'Тестовое устройство' } })

  try { return await run({ api, register, base }) }
  finally { server.close(); await rm(dataDir, { recursive: true, force: true }) }
}

test('registration is closed unless a token is configured', async () => {
  await withGateway({ NOTE2_REGISTRATION_TOKEN: '' }, async ({ api }) => {
    const { status, data } = await api('/api/account/register', {
      method: 'POST', body: { email: 'a@example.com', password: PASSWORD }
    })
    assert.equal(status, 403)
    assert.match(data.error, /Регистрация закрыта/)
  })
})

test('registration refuses a wrong token', async () => {
  await withGateway({}, async ({ api }) => {
    const { status } = await api('/api/account/register', {
      method: 'POST', headers: { 'X-Registration-Token': 'wrong' }, body: { email: 'a@example.com', password: PASSWORD }
    })
    assert.equal(status, 403)
  })
})

test('register issues a token and me() reads the account back', async () => {
  await withGateway({}, async ({ api, register }) => {
    const created = await register()
    assert.equal(created.status, 200)
    assert.equal(created.data.account.email, 'user@example.com')
    assert.ok(created.data.token.startsWith('nai1.'), 'token must be the split form')
    assert.equal(created.data.account.password, undefined, 'the password record must never leave the server')

    const me = await api('/api/account/me', { token: created.data.token })
    assert.equal(me.status, 200)
    assert.equal(me.data.account.email, 'user@example.com')
  })
})

test('a short password is refused with a readable reason', async () => {
  await withGateway({}, async ({ register }) => {
    const { status, data } = await register('a@example.com', 'short')
    assert.equal(status, 400)
    assert.match(data.error, /не короче 12 символов/)
  })
})

test('the same email cannot be registered twice', async () => {
  await withGateway({}, async ({ register }) => {
    await register()
    const second = await register()
    assert.equal(second.status, 409)
  })
})

test('login fails identically for an unknown account and a wrong password', async () => {
  // Different messages here would turn the endpoint into an account
  // enumerator: an attacker learns which addresses are registered.
  await withGateway({}, async ({ api, register }) => {
    await register('real@example.com')
    const unknown = await api('/api/account/login', { method: 'POST', body: { email: 'nobody@example.com', password: PASSWORD } })
    const wrong = await api('/api/account/login', { method: 'POST', body: { email: 'real@example.com', password: 'wrong password here' } })
    assert.equal(unknown.status, 401)
    assert.equal(wrong.status, 401)
    assert.equal(unknown.data.error, wrong.data.error, 'the two failures must be indistinguishable')
  })
})

test('login succeeds and issues a second, independent session', async () => {
  await withGateway({}, async ({ api, register }) => {
    const first = await register()
    const second = await api('/api/account/login', { method: 'POST', body: { email: 'user@example.com', password: PASSWORD, deviceName: 'Телефон' } })
    assert.equal(second.status, 200)
    assert.notEqual(second.data.token, first.data.token)

    const sessions = await api('/api/account/sessions', { token: second.data.token })
    assert.equal(sessions.data.sessions.length, 2)
    assert.equal(sessions.data.sessions.filter(s => s.current).length, 1)
    assert.ok(sessions.data.sessions.every(s => s.secretHash === undefined), 'session secrets must never be listed')
  })
})

test('an invalid or tampered token is rejected', async () => {
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    const [prefix, id, secret] = data.token.split('.')
    for (const bad of ['', 'garbage', `${prefix}.${id}.${'x'.repeat(secret.length)}`]) {
      const response = await api('/api/account/me', { token: bad })
      assert.equal(response.status, 401, `token ${JSON.stringify(bad)} must not authenticate`)
    }
  })
})

test('logout revokes only the session that used it', async () => {
  await withGateway({}, async ({ api, register }) => {
    const phone = await register()
    const laptop = await api('/api/account/login', { method: 'POST', body: { email: 'user@example.com', password: PASSWORD } })

    assert.equal((await api('/api/account/logout', { method: 'POST', token: phone.data.token })).status, 200)
    assert.equal((await api('/api/account/me', { token: phone.data.token })).status, 401, 'the logged-out session is gone')
    assert.equal((await api('/api/account/me', { token: laptop.data.token })).status, 200, 'the other device stays signed in')
  })
})

test('revoking a session reports whether it was the current one', async () => {
  await withGateway({}, async ({ api, register }) => {
    const phone = await register()
    const laptop = await api('/api/account/login', { method: 'POST', body: { email: 'user@example.com', password: PASSWORD } })
    const sessions = await api('/api/account/sessions', { token: laptop.data.token })
    const other = sessions.data.sessions.find(s => !s.current)

    const revoked = await api(`/api/account/sessions/${other.id}`, { method: 'DELETE', token: laptop.data.token })
    assert.equal(revoked.status, 200)
    assert.equal(revoked.data.current, false)
    assert.equal((await api('/api/account/me', { token: phone.data.token })).status, 401)

    const self = sessions.data.sessions.find(s => s.current)
    const selfRevoked = await api(`/api/account/sessions/${self.id}`, { method: 'DELETE', token: laptop.data.token })
    assert.equal(selfRevoked.data.current, true, 'the client signs itself out when this is true')
  })
})

test('one account cannot revoke another account\'s session', async () => {
  await withGateway({}, async ({ api, register }) => {
    const victim = await register('victim@example.com')
    const attacker = await register('attacker@example.com')
    const victimSessions = await api('/api/account/sessions', { token: victim.data.token })
    const targetId = victimSessions.data.sessions[0].id

    const attempt = await api(`/api/account/sessions/${targetId}`, { method: 'DELETE', token: attacker.data.token })
    assert.equal(attempt.status, 404, 'reported as not found, so session ids cannot be probed across accounts')
    assert.equal((await api('/api/account/me', { token: victim.data.token })).status, 200, 'the victim stays signed in')
  })
})

// --- workspace sync ---------------------------------------------------------

const snapshotWith = notes => createSyncSnapshot({
  workspace: { notes, tasks: [], chats: [] },
  settings: { style: 'yasny', syncToken: 'SHOULD NOT BE STORED', accountEmail: 'leak@example.com' },
  sources: [],
  chunks: []
})

test('pull before any push is a 404, not an empty workspace', async () => {
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    const pulled = await api('/api/account/sync/default', { token: data.token })
    assert.equal(pulled.status, 404)
  })
})

test('push then pull round-trips the workspace', async () => {
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    const notes = [{ id: 'n1', title: 'Заметка', body: 'Текст' }]

    const pushed = await api('/api/account/sync/default', {
      method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith(notes) }
    })
    assert.equal(pushed.status, 200)
    assert.equal(pushed.data.revision, 1)

    const pulled = await api('/api/account/sync/default', { token: data.token })
    assert.equal(pulled.status, 200)
    assert.equal(pulled.data.revision, 1)
    assert.deepEqual(pulled.data.snapshot.workspace.notes, notes)
  })
})

test('push strips sync credentials out of the stored settings', async () => {
  // A snapshot carries the whole settings object. Storing another device's
  // token on the server would hand every signed-in device that credential.
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    await api('/api/account/sync/default', { method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith([]) } })
    const pulled = await api('/api/account/sync/default', { token: data.token })
    assert.equal(pulled.data.snapshot.settings.syncToken, undefined)
    assert.equal(pulled.data.snapshot.settings.accountEmail, undefined)
    assert.equal(pulled.data.snapshot.settings.style, 'yasny', 'ordinary settings still sync')
  })
})

test('a stale push is a 409 carrying the current revision, not an overwrite', async () => {
  // Two devices with the same base revision. The second must be refused, or a
  // day of notes disappears with no error anyone sees.
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    await api('/api/account/sync/default', { method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'a' }]) } })

    const stale = await api('/api/account/sync/default', {
      method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'b' }]) }
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.data.currentRevision, 1, 'the client shows which revision it is behind')

    const pulled = await api('/api/account/sync/default', { token: data.token })
    assert.deepEqual(pulled.data.snapshot.workspace.notes, [{ id: 'a' }], 'the first push survives')
  })
})

test('a malformed snapshot is refused before it is stored', async () => {
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    for (const snapshot of [{}, { format: 'wrong' }, { format: 'noteai-sync-v1', workspace: {} }]) {
      const response = await api('/api/account/sync/default', { method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot } })
      assert.equal(response.status, 400, JSON.stringify(snapshot))
      assert.match(response.data.error, /Снимок не принят/)
    }
  })
})

test('workspaces are isolated between accounts', async () => {
  await withGateway({}, async ({ api, register }) => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    await api('/api/account/sync/default', { method: 'PUT', token: alice.data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'alice-note' }]) } })

    const bobPull = await api('/api/account/sync/default', { token: bob.data.token })
    assert.equal(bobPull.status, 404, "Bob's 'default' is his own, not Alice's")
  })
})

test('a workspace id that tries to escape the data directory is refused', async () => {
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    const bad = await api(`/api/account/sync/${encodeURIComponent('../../etc/passwd')}`, { token: data.token })
    assert.equal(bad.status, 400)
    assert.match(bad.data.error, /Некорректный идентификатор/)
  })
})

test('sync requires authentication', async () => {
  await withGateway({}, async ({ api }) => {
    assert.equal((await api('/api/account/sync/default')).status, 401)
    assert.equal((await api('/api/account/sync/default', { method: 'PUT', body: { snapshot: snapshotWith([]) } })).status, 401)
    assert.equal((await api('/api/account/sessions')).status, 401)
  })
})

test('two simultaneous pushes cannot both win', async () => {
  // Without the per-file lock this is a read-modify-write race: both read
  // revision 0, both write revision 1, and one device's notes vanish.
  await withGateway({}, async ({ api, register }) => {
    const { data } = await register()
    const [first, second] = await Promise.all([
      api('/api/account/sync/default', { method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'first' }]) } }),
      api('/api/account/sync/default', { method: 'PUT', token: data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'second' }]) } })
    ])
    const codes = [first.status, second.status].sort()
    assert.deepEqual(codes, [200, 409], 'exactly one push is accepted')

    const pulled = await api('/api/account/sync/default', { token: data.token })
    assert.equal(pulled.data.revision, 1, 'the revision advanced once, not twice')
  })
})

test('concurrent registrations do not lose an account', async () => {
  // The accounts file is read-modify-written too. Two registrations landing
  // together must both persist.
  await withGateway({}, async ({ api, register }) => {
    const results = await Promise.all([
      register('one@example.com'), register('two@example.com'), register('three@example.com')
    ])
    assert.ok(results.every(r => r.status === 200), 'all three registrations succeed')
    for (const result of results) {
      assert.equal((await api('/api/account/me', { token: result.data.token })).status, 200)
    }
  })
})

// --- the pre-account sync mode ---------------------------------------------

test('legacy sync is off unless a token is configured', async () => {
  await withGateway({}, async ({ api }) => {
    const response = await api('/api/sync/default', { token: 'anything' })
    assert.equal(response.status, 503)
    assert.match(response.data.error, /NOTE2_SYNC_TOKEN/)
  })
})

test('legacy sync refuses a wrong token and round-trips with the right one', async () => {
  await withGateway({ NOTE2_SYNC_TOKEN: 'shared-secret-value' }, async ({ api }) => {
    assert.equal((await api('/api/sync/default', { token: 'wrong' })).status, 401)
    assert.equal((await api('/api/sync/default')).status, 401, 'no token is not a free pass')

    const pushed = await api('/api/sync/default', {
      method: 'PUT', token: 'shared-secret-value', body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'legacy' }]) }
    })
    assert.equal(pushed.status, 200)
    assert.equal(pushed.data.revision, 1)

    const pulled = await api('/api/sync/default', { token: 'shared-secret-value' })
    assert.deepEqual(pulled.data.snapshot.workspace.notes, [{ id: 'legacy' }])
  })
})

test('legacy sync storage never collides with an account workspace', async () => {
  // Both default to the workspace id 'default'. Sharing a file would let the
  // legacy token read an account's notes.
  await withGateway({ NOTE2_SYNC_TOKEN: 'shared-secret-value' }, async ({ api, register }) => {
    const account = await register()
    await api('/api/account/sync/default', {
      method: 'PUT', token: account.data.token, body: { baseRevision: 0, snapshot: snapshotWith([{ id: 'private-note' }]) }
    })

    const legacy = await api('/api/sync/default', { token: 'shared-secret-value' })
    assert.equal(legacy.status, 404, 'the legacy token must not see the account workspace')
  })
})
