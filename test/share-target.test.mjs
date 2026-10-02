import test from 'node:test'
import assert from 'node:assert/strict'
import { instagramUrlFromSharedEvent } from '../src/share-target.js'

test('extracts Instagram URL from shared text',()=>{
  assert.equal(instagramUrlFromSharedEvent({texts:['Посмотри https://www.instagram.com/p/ABC_123/?igsh=x']}),'https://www.instagram.com/p/ABC_123/?igsh=x')
  assert.equal(instagramUrlFromSharedEvent({title:'https://instagram.com/reel/Reel123/'}),'https://instagram.com/reel/Reel123/')
})

test('ignores unrelated shared content',()=>assert.equal(instagramUrlFromSharedEvent({texts:['https://example.com/post']}),''))

test('preserves Instagram shared context for the two real control URLs',async()=>{
  const { instagramSharedUrlDescriptor }=await import('../src/share-target.js')
  const reel=instagramSharedUrlDescriptor('https://www.instagram.com/reel/DaszqnpoLCl/?igsh=MTY0Z3l3OWU5MzU1dw==')
  assert.equal(reel.shortcode,'DaszqnpoLCl')
  assert.equal(reel.routeType,'reel')
  assert.equal(reel.requestedMediaIndex,0)
  const carousel=instagramSharedUrlDescriptor('https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=MWtvejAyaHZ3Y2V0aQ==')
  assert.equal(carousel.shortcode,'Db7z448jYex')
  assert.equal(carousel.requestedMediaIndex,1)
})
