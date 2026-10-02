import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const analysis=fs.readFileSync(new URL('../src/instagram-analysis.js',import.meta.url),'utf8')

test('Instagram viewer exposes structured extraction, offline pin and media-to-note actions',()=>{
  assert.match(app,/Структурированные данные/)
  assert.match(app,/Сохранить офлайн/)
  assert.match(app,/Слайд → заметку/)
  assert.match(app,/pinInstagramSourceOffline/)
  assert.match(app,/instagramMediaNoteBlock/)
})

test('structured Instagram fields join source search sections',()=>{
  assert.match(analysis,/structuredKnowledge/)
  assert.match(analysis,/Структурированные данные/)
})

test('structured object card can be manually edited without preserving false provenance',()=>{
  assert.match(app,/applyStructuredUserEdits/)
  assert.match(app,/Редактировать/)
  assert.match(app,/Изменено пользователем/)
})
