import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Android credential bridge uses Android Keystore AES-GCM and web fallback is session-only', async () => {
  const [java, js, prepare] = await Promise.all([
    readFile(new URL('../native/android/SecureCredentialsPlugin.java', import.meta.url),'utf8'),
    readFile(new URL('../src/secure-credentials.js', import.meta.url),'utf8'),
    readFile(new URL('../scripts/prepare-android.mjs', import.meta.url),'utf8')
  ])
  assert.match(java,/AndroidKeyStore/)
  assert.match(java,/AES\/GCM\/NoPadding/)
  assert.match(java,/KeyGenParameterSpec/)
  assert.doesNotMatch(java,/EncryptedSharedPreferences/)
  assert.match(js,/sessionStorage/)
  assert.doesNotMatch(js,/localStorage/)
  assert.match(prepare,/registerPlugin\(SecureCredentialsPlugin\.class\)/)
  assert.match(prepare,/android:allowBackup=\\"false\\"|android:allowBackup="false"/)
})
