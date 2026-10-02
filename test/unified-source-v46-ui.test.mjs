import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8')
const css=readFileSync(new URL('../src/styles.css', import.meta.url),'utf8')

test('v4.6 Sources restores v4.0 shell and removes provider silos from primary UI',()=>{
  assert.match(app,/Все сохранённые материалы в одной библиотеке/)
  assert.match(app,/Instagram, YouTube и обычные веб-страницы определяются автоматически/)
  assert.doesNotMatch(app,/setMode\('instagram'\)>Instagram/)
  assert.match(app,/sourceProviderFilters/)
  assert.match(app,/unifiedSourceList/)
  assert.match(css,/NOTE2 v4\.6 — restore v4\.0 visual shell/)
})

test('capture sheet exposes one universal link action instead of separate Instagram and YouTube entries',()=>{
  assert.match(app,/Instagram, YouTube (?:и|или) веб(?:-страница)?/)
  assert.doesNotMatch(app,/<span>Instagram<\/span><small>Пост, Reels, карусель<\/small>/)
  assert.doesNotMatch(app,/onClick=\{\(\)=>go\('youtube'\)\}/)
})

test('universal link intake routes YouTube and Instagram through provider-aware ingestion',()=>{
  assert.match(app,/sharedUrlDescriptor\(value\)/)
  assert.match(app,/descriptor\?\.provider==='instagram'/)
  assert.match(app,/descriptor\?\.provider==='youtube'/)
  assert.match(app,/ingestYoutube\(value,settings\.youtubeEndpoint\)/)
})
