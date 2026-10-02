import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8')
const css=readFileSync(new URL('../src/styles.css', import.meta.url),'utf8')

test('v4.8 capture sheet opens native pickers instead of routing file buttons to a technical import screen',()=>{
  assert.match(app,/ref=\{imageRef\}[^>]+type="file"[^>]+accept="image\/\*"/s)
  assert.match(app,/ref=\{videoRef\}[^>]+accept="video\/\*"/s)
  assert.match(app,/ref=\{audioRef\}[^>]+accept="audio\/\*"/s)
  assert.match(app,/ref=\{fileRef\}[^>]+application\/pdf/s)
  assert.match(app,/onClick=\{\(\)=>pick\(imageRef\)\}/)
  assert.match(app,/onClick=\{\(\)=>pick\(videoRef\)\}/)
  assert.match(app,/onClick=\{\(\)=>pick\(audioRef\)\}/)
  assert.match(app,/onClick=\{\(\)=>pick\(fileRef\)\}/)
})

test('v4.8 capture sheet saves links directly and supports clipboard paste',()=>{
  assert.match(app,/onLink\?\.\(link\.trim\(\)\)/)
  assert.match(app,/navigator\.clipboard\?\.readText/)
  assert.match(app,/Instagram, YouTube или веб-страница/)
})

test('v4.8 app queues capture payload into existing source ingestion pipeline exactly once',()=>{
  assert.match(app,/setCapturePayload\(\{id:Date\.now\(\),type:'files',files:picked\}\)/)
  assert.match(app,/setCapturePayload\(\{id:Date\.now\(\),type:'link',url\}\)/)
  assert.match(app,/captureConsumedRef\.current===capturePayload\.id/)
  assert.match(app,/await importFiles\(capturePayload\.files\|\|\[\]\)/)
  assert.match(app,/await addUrl\(capturePayload\.url\|\|''\)/)
  assert.match(css,/v4\.8 — direct capture intake/)
})
