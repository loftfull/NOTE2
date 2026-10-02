import test from 'node:test'
import assert from 'node:assert/strict'
import { exportBundle, importBundle } from '../src/storage.js'

test('v3.6 backup exports sources/chunks and imports round-trip', () => {
  const workspace = { notes:[{id:'n1'}], tasks:[], chats:[] }
  const settings = { theme:'dark' }
  const text = exportBundle(workspace, settings, { sources:[{id:'s1'}], chunks:[{id:'s1:0',sourceId:'s1'}] })
  const raw = JSON.parse(text)
  assert.equal(raw.format, 'noteai-v3.6')
  const imported = importBundle(text)
  assert.equal(imported.workspace.notes[0].id, 'n1')
  assert.equal(imported.sources[0].id, 's1')
  assert.equal(imported.chunks[0].sourceId, 's1')
})

test('v3.2 backup remains import-compatible', () => {
  const imported = importBundle(JSON.stringify({ format:'noteai-v3.2', workspace:{notes:[],tasks:[],chats:[]}, settings:{theme:'light'} }))
  assert.equal(imported.settings.theme, 'light')
})
