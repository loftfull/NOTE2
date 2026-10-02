import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalInstagramUrl, instagramArchiveKey, instagramShortcode, normalizeInstagramPost } from '../instagram-core.mjs'

test('instagramShortcode parses post, reel and tv URLs',()=>{
  assert.equal(instagramShortcode('https://www.instagram.com/p/ABC_def-12/?igsh=abc'),'ABC_def-12')
  assert.equal(instagramShortcode('https://instagram.com/reel/C9abcd12/'),'C9abcd12')
  assert.equal(instagramShortcode('http://m.instagram.com/tv/C1234_x/'),'C1234_x')
})

test('instagramShortcode rejects unrelated and profile URLs',()=>{
  assert.throws(()=>instagramShortcode('https://example.com/p/ABC123/'),/instagram\.com/)
  assert.throws(()=>instagramShortcode('https://www.instagram.com/example/'),/пост|Reels|видео/)
})

test('canonicalInstagramUrl removes tracking query',()=>{
  assert.equal(canonicalInstagramUrl('https://instagram.com/p/ABC123/?utm_source=x'),'https://www.instagram.com/p/ABC123/')
})

test('instagramArchiveKey blocks path traversal',()=>{
  assert.equal(instagramArchiveKey('ABC_def-12'),'ABC_def-12')
  assert.throws(()=>instagramArchiveKey('../secret'),/archive key/)
})

test('normalizeInstagramPost preserves carousel order and provenance',()=>{
  const post=normalizeInstagramPost({shortcode:'ABC123',caption:'Описание',owner:{username:'demo'},media:[
    {kind:'image',url:'https://cdn.example/a.jpg',width:1080,height:1350},
    {kind:'video',url:'https://cdn.example/b.mp4',width:1080,height:1920}
  ]},'https://www.instagram.com/p/ABC123/')
  assert.equal(post.media.length,2)
  assert.equal(post.media[0].index,0)
  assert.equal(post.media[1].kind,'video')
  assert.equal(post.owner.username,'demo')
  assert.equal(post.provenance.provider,'instaloader')
})

test('real control URL: Reel DaszqnpoLCl preserves reel route and strips tracking',()=>{
  const url='https://www.instagram.com/reel/DaszqnpoLCl/?igsh=MTY0Z3l3OWU5MzU1dw=='
  assert.equal(instagramShortcode(url),'DaszqnpoLCl')
  assert.equal(canonicalInstagramUrl(url),'https://www.instagram.com/reel/DaszqnpoLCl/')
})

test('real control URL: carousel Db7z448jYex preserves requested second slide as context',async()=>{
  const { instagramUrlDescriptor } = await import('../instagram-core.mjs')
  const url='https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=MWtvejAyaHZ3Y2V0aQ=='
  const d=instagramUrlDescriptor(url)
  assert.equal(d.shortcode,'Db7z448jYex')
  assert.equal(d.routeType,'p')
  assert.equal(d.canonicalUrl,'https://www.instagram.com/p/Db7z448jYex/')
  assert.equal(d.requestedMediaIndex,1)
  assert.match(d.sharedUrl,/img_index=2/)
})
