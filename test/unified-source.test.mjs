import test from 'node:test'
import assert from 'node:assert/strict'
import { createPendingSourceFromDescriptor, instagramUrlDescriptor, parseTimeOffset, sharedUrlDescriptor, sourceProvider, sourceProviderLabel, unifiedSourceView, webUrlDescriptor, youtubeUrlDescriptor } from '../src/unified-source.js'

test('YouTube share descriptor preserves start time and playlist context outside canonical URL',()=>{
  const d=youtubeUrlDescriptor('https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s&list=PLdemo&index=3&si=tracking')
  assert.equal(d.provider,'youtube')
  assert.equal(d.providerId,'M7lc1UVf-VE')
  assert.equal(d.canonicalUrl,'https://www.youtube.com/watch?v=M7lc1UVf-VE')
  assert.equal(d.captureContext.startSeconds,90)
  assert.equal(d.captureContext.playlistId,'PLdemo')
  assert.equal(d.captureContext.playlistIndex,2)
})

test('YouTube shorts and youtu.be links map to the same provider model',()=>{
  assert.equal(youtubeUrlDescriptor('https://youtu.be/M7lc1UVf-VE?t=45')?.captureContext.startSeconds,45)
  assert.equal(youtubeUrlDescriptor('https://www.youtube.com/shorts/M7lc1UVf-VE')?.sourceType,'shorts')
})

test('Instagram img_index is capture context, not canonical identity',()=>{
  const d=instagramUrlDescriptor('https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=test')
  assert.equal(d.canonicalUrl,'https://www.instagram.com/p/Db7z448jYex/')
  assert.equal(d.captureContext.requestedMediaIndex,1)
})

test('generic web canonicalization removes tracking params',()=>{
  const d=webUrlDescriptor('https://example.com/article?utm_source=x&topic=notes#section')
  assert.equal(d.provider,'web')
  assert.equal(d.canonicalUrl,'https://example.com/article?topic=notes')
})

test('shared URL descriptor detects Instagram, YouTube and web',()=>{
  assert.equal(sharedUrlDescriptor('https://www.instagram.com/reel/DaszqnpoLCl/')?.provider,'instagram')
  assert.equal(sharedUrlDescriptor('https://youtu.be/M7lc1UVf-VE')?.provider,'youtube')
  assert.equal(sharedUrlDescriptor('https://example.com')?.provider,'web')
})

test('pending source contract is provider-agnostic',()=>{
  const descriptor=sharedUrlDescriptor('https://youtu.be/M7lc1UVf-VE?t=30')
  const source=createPendingSourceFromDescriptor(descriptor,123)
  assert.equal(source.id,'youtube:M7lc1UVf-VE')
  assert.equal(source.status,'saved')
  assert.equal(source.captureContext.startSeconds,30)
  assert.equal(source.createdAt,123)
})

test('unified source view hides provider-specific storage shape',()=>{
  const instagram={id:'instagram:x',kind:'instagram',name:'Instagram post',instagram:{caption:'Caption',owner:{username:'alice'},media:[{},{}],requestContext:{routeType:'p'},favorite:true,offlinePinned:true}}
  const view=unifiedSourceView(instagram)
  assert.equal(view.provider,'instagram')
  assert.equal(view.author,'@alice')
  assert.equal(view.sourceType,'carousel')
  assert.equal(view.offline,'media-offline')
  assert.equal(sourceProvider(instagram),'instagram')
  assert.equal(sourceProviderLabel(view.provider),'Instagram')
})

test('time offsets parse YouTube-style compact values',()=>{
  assert.equal(parseTimeOffset('1h2m3s'),3723)
  assert.equal(parseTimeOffset('95s'),95)
  assert.equal(parseTimeOffset('120'),120)
})
