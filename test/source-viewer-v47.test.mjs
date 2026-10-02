import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runAiTask } from '../src/ai.js'

const app=readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8')
const css=readFileSync(new URL('../src/styles.css', import.meta.url),'utf8')

test('v4.7 uses one Source Viewer shell with provider renderers and four calm tabs',()=>{
  assert.match(app,/function InstagramSourceRenderer/)
  assert.match(app,/function YouTubeSourceRenderer/)
  assert.match(app,/function PdfSourceRenderer/)
  assert.match(app,/sourceViewerShell/)
  assert.match(app,/\['description','Описание'\],\['text','Текст'\],\['summary','Выжимка'\],\['notes','Заметки'\]/)
  assert.match(css,/NOTE2 v4\.7 — one Source Viewer shell inside the v4\.0 visual system/)
})

test('YouTube evidence navigation sends seekTo into the embedded player',()=>{
  assert.match(app,/enablejsapi=1/)
  assert.match(app,/func:'seekTo'/)
  assert.match(app,/locator\?\.startSeconds/)
})

test('Instagram evidence navigation selects exact carousel item and video timestamp',()=>{
  assert.match(app,/locator\?\.instagramItem/)
  assert.match(app,/setIndex\(Math\.min\(Math\.max\(next,0\)/)
  assert.match(app,/el\.currentTime=Math\.max\(0,Number\(locator\.startSeconds\)\|\|0\)/)
})

test('old Instagram library silo is removed from reachable Analysis UI',()=>{
  assert.doesNotMatch(app,/mode==='instagram'/)
  assert.doesNotMatch(app,/setInstagramFilter/)
  assert.doesNotMatch(app,/Instagram Knowledge Library exposes/)
})

test('local source brief preserves evidence citations',async()=>{
  const out=await runAiTask({endpoint:'',action:'source-brief',input:'[S1] 0:00\nПервый важный тезис. Дополнение.\n\n[S2] 0:18\nВторой тезис с деталями.'})
  assert.match(out,/\[S1\]/)
  assert.match(out,/\[S2\]/)
})
