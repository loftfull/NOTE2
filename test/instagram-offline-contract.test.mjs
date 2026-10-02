import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('offline module uses stable source/index keys and local-first blob lookup',()=>{
  const code=fs.readFileSync(new URL('../src/instagram-offline.js',import.meta.url),'utf8')
  assert.match(code,/sourceId.*index/)
  assert.match(code,/getOfflineAsset/)
  assert.match(code,/putOfflineAsset/)
})

test('source database has dedicated offline blob store and v3 migration',()=>{
  const code=fs.readFileSync(new URL('../src/source-db.js',import.meta.url),'utf8')
  assert.match(code,/DB_VERSION = 3/)
  assert.match(code,/offlineAssets/)
  assert.match(code,/putOfflineAsset/)
  assert.match(code,/deleteOfflineAssetsForSource/)
})
