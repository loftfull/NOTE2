import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')

test('Instagram enrichment survives as contextual tools inside the unified Source Viewer',()=>{
  for(const text of ['Обработать весь пост','КОЛЛЕКЦИИ','Инструменты Instagram'])assert.ok(app.includes(text),text)
  for(const cls of ['instagramKnowledgePanel','instagramCoverage','sourceAdvancedPanel'])assert.ok(css.includes(`.${cls}`),cls)
  assert.doesNotMatch(app,/mode==='instagram'/)
})
