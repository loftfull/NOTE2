import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
const storage=fs.readFileSync(new URL('../src/storage.js',import.meta.url),'utf8')

test('v4.9 hides redundant mobile header and compacts page top',()=>{
  assert.match(css,/\.main>\.header\{display:none!important\}/)
  assert.match(css,/\.page\{padding-top:6px!important\}/)
})

test('v4.9 exposes live profile typography and density settings',()=>{
  assert.match(app,/Размер текста/)
  assert.match(app,/Плотность/)
  assert.match(app,/fontScale/)
  assert.match(app,/density/)
  assert.match(storage,/fontScale: 'normal'/)
})

test('v4.9 Today capture actions open direct capture instead of dead import routes',()=>{
  assert.match(app,/function Dashboard\(\{workspace,navigate,openEditor,newNote,openCapture\}\)/)
  assert.match(app,/onClick=\{openCapture\}[^>]*><KnowledgeObject kind="pdf"/)
})
