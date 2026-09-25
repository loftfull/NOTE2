import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertApplicationId, hasShareTarget, withShareTarget } from '../scripts/android-manifest.mjs'

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`

test('withShareTarget adds the filters inside the launcher activity', () => {
  const result = withShareTarget(MANIFEST)
  assert.ok(hasShareTarget(result))
  assert.ok(result.includes('android.intent.action.SEND'))
  assert.ok(result.includes('android:mimeType="text/*"'))

  // Inside <activity>, after the launcher filter: a filter placed outside the
  // activity is ignored by Android and the app never appears in the share sheet.
  const activityStart = result.indexOf('<activity')
  const activityEnd = result.indexOf('</activity>')
  const sendAt = result.indexOf('android.intent.action.SEND')
  assert.ok(sendAt > activityStart && sendAt < activityEnd, 'the filters must sit inside the activity')
})

test('withShareTarget is a no-op on a manifest it already changed', () => {
  // The script runs on every sync; an edit that stacks would add a copy each
  // time until the manifest is unusable.
  const once = withShareTarget(MANIFEST)
  const twice = withShareTarget(once)
  assert.equal(twice, once)
  assert.equal(twice.split('android.intent.action.SEND_MULTIPLE').length - 1, 1)
})

test('withShareTarget refuses a manifest with no launcher activity', () => {
  // Better to stop than to write a manifest that silently lacks the filters.
  assert.throws(() => withShareTarget('<manifest></manifest>'), /Не найден launcher-activity/)
})

test('assertApplicationId accepts a match and refuses drift', () => {
  const gradle = 'android {\n  defaultConfig {\n    applicationId "app.noteai.workspace"\n  }\n}'
  assert.equal(assertApplicationId(gradle, 'app.noteai.workspace'), 'app.noteai.workspace')
  assert.throws(() => assertApplicationId(gradle, 'app.other.id'), /Менять package id нельзя/)
  assert.throws(() => assertApplicationId(gradle, ''), /не задан appId/)
})

test('the real generated manifest takes the change', async () => {
  // Guards against Capacitor changing its template out from under the anchor.
  const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8')
  const result = withShareTarget(manifest)
  assert.ok(hasShareTarget(result))
  assert.ok(result.includes('MainActivity'))
})

test('the real build.gradle carries the configured package id', async () => {
  const [gradle, config] = await Promise.all([
    readFile('android/app/build.gradle', 'utf8'),
    readFile('capacitor.config.json', 'utf8')
  ])
  assert.equal(assertApplicationId(gradle, JSON.parse(config).appId), 'app.noteai.workspace')
})
