import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Capacitor 8 share target dependency and Android SEND filters are prepared', async()=>{
  const [pkgRaw,prepare]=await Promise.all([
    readFile(new URL('../package.json',import.meta.url),'utf8'),
    readFile(new URL('../scripts/prepare-android.mjs',import.meta.url),'utf8')
  ])
  const pkg=JSON.parse(pkgRaw)
  assert.equal(pkg.dependencies['@capgo/capacitor-share-target'],'8.0.48')
  assert.match(prepare,/NOTE2_SHARE_TARGET/)
  assert.match(prepare,/android\.intent\.action\.SEND/)
  assert.match(prepare,/android\.intent\.action\.SEND_MULTIPLE/)
  assert.match(prepare,/android:mimeType="text\/\*"/)
  assert.match(prepare,/android:mimeType="image\/\*"/)
  assert.match(prepare,/android:mimeType="video\/\*"/)
})
