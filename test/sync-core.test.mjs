import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncSnapshot, sanitizeSyncSettings, validWorkspaceId, validateSyncSnapshot } from '../sync-core.mjs'

test('sync snapshots redact device sync token and validate shape', () => {
  const snapshot = createSyncSnapshot({ workspace:{notes:[],tasks:[],chats:[]}, settings:{theme:'dark',syncToken:'secret',accountEmail:'user@example.com',accountRevision:9,accountEndpoint:'/api/account'}, sources:[], chunks:[] })
  assert.equal(snapshot.settings.theme, 'dark')
  assert.equal('syncToken' in snapshot.settings, false)
  assert.equal('accountEmail' in snapshot.settings, false)
  assert.equal('accountRevision' in snapshot.settings, false)
  assert.equal(validateSyncSnapshot(snapshot), snapshot)
})

test('workspace ids are path-safe', () => {
  assert.equal(validWorkspaceId('main-device_1'), true)
  assert.equal(validWorkspaceId('../secret'), false)
  assert.equal(validWorkspaceId(''), false)
})
