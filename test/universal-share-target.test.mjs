import test from 'node:test'
import assert from 'node:assert/strict'
import { sharedSourceDescriptorFromEvent, sharedUrlsFromEvent } from '../src/share-target.js'

test('universal share target extracts YouTube share with start time',()=>{
  const descriptor=sharedSourceDescriptorFromEvent({texts:['Посмотри https://youtu.be/M7lc1UVf-VE?t=95']})
  assert.equal(descriptor.provider,'youtube')
  assert.equal(descriptor.providerId,'M7lc1UVf-VE')
  assert.equal(descriptor.captureContext.startSeconds,95)
})

test('universal share target extracts Instagram with slide context',()=>{
  const descriptor=sharedSourceDescriptorFromEvent({texts:['https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=x']})
  assert.equal(descriptor.provider,'instagram')
  assert.equal(descriptor.captureContext.requestedMediaIndex,1)
})

test('universal share target falls back to ordinary web URL',()=>{
  const descriptor=sharedSourceDescriptorFromEvent({title:'Article',texts:['https://example.com/page?utm_source=share&x=1']})
  assert.equal(descriptor.provider,'web')
  assert.equal(descriptor.canonicalUrl,'https://example.com/page?x=1')
})

test('shared event can contain multiple URLs without losing order',()=>{
  assert.deepEqual(sharedUrlsFromEvent({texts:['A https://example.com/one B https://youtu.be/M7lc1UVf-VE']}),['https://example.com/one','https://youtu.be/M7lc1UVf-VE'])
})
