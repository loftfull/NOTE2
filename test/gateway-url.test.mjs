import test from 'node:test'
import assert from 'node:assert/strict'
import { gatewayApiEndpointFor, healthEndpointFor } from '../src/gateway-url.js'

test('gateway sibling endpoints follow the configured remote gateway origin',()=>{
  const base='https://app.localhost/settings'
  assert.equal(gatewayApiEndpointFor('https://gateway.example/api/ai','/api/source-url',base),'https://gateway.example/api/source-url')
  assert.equal(healthEndpointFor('https://gateway.example/api/ai',base),'https://gateway.example/api/health')
})

test('relative connector endpoints stay on the current app origin',()=>{
  const base='https://noteai.example/settings'
  assert.equal(gatewayApiEndpointFor('/api/ai','/api/source-url',base),'https://noteai.example/api/source-url')
  assert.equal(healthEndpointFor('/api/ai',base),'https://noteai.example/api/health')
})
