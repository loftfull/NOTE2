import test from 'node:test'
import assert from 'node:assert/strict'
import { accountIdForEmail, createPasswordRecord, createSessionCredential, normalizeEmail, parseSessionToken, sessionExpiry, validEmail, verifyPassword, verifySessionSecret } from '../account-auth-core.mjs'

test('account auth core normalizes identity and stores only password derivation material', async () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com')
  assert.equal(validEmail('user@example.com'), true)
  assert.equal(validEmail('bad-address'), false)
  assert.equal(accountIdForEmail('User@example.com'), accountIdForEmail('user@example.com'))
  const record = await createPasswordRecord('correct horse battery staple')
  assert.equal(record.algorithm, 'scrypt')
  assert.equal('password' in record, false)
  assert.equal(await verifyPassword('correct horse battery staple', record), true)
  assert.equal(await verifyPassword('incorrect password here', record), false)
})

test('device session credentials are parseable but only secret hashes are persisted', () => {
  const credential = createSessionCredential()
  const parsed = parseSessionToken(credential.token)
  assert.equal(parsed.sessionId, credential.sessionId)
  assert.equal(verifySessionSecret(parsed.secret, credential.secretHash), true)
  assert.equal(verifySessionSecret(parsed.secret + 'x', credential.secretHash), false)
  assert.ok(Date.parse(sessionExpiry(30)) > Date.now() + 29 * 86400_000)
})
