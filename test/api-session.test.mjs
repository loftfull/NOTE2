import test from 'node:test'
import assert from 'node:assert/strict'
import { authenticatedFetch, clearApiSessionAuth, setApiSessionAuth } from '../src/api-session.js'

test('API session bearer is attached only to the configured gateway origin', async () => {
  const original=globalThis.fetch
  const seen=[]
  globalThis.fetch=async(input,init={})=>{seen.push({url:String(input),headers:new Headers(init.headers)});return new Response('{}',{status:200,headers:{'content-type':'application/json'}})}
  try{
    setApiSessionAuth('session-secret','https://gateway.example/api/account')
    await authenticatedFetch('https://gateway.example/api/ai',{method:'POST'})
    await authenticatedFetch('https://other.example/api/ai',{method:'POST'})
    assert.equal(seen[0].headers.get('authorization'),'Bearer session-secret')
    assert.equal(seen[1].headers.get('authorization'),null)
  }finally{clearApiSessionAuth();globalThis.fetch=original}
})
