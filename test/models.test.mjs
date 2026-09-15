// Tests for the model registry and the OpenAI-compatible client.
//
// The registry is what replaces the lost gateway as the way AI reaches a model,
// so the invariants that matter are: a half-filled model can never be saved, a
// secret never lands in the record, role selection never guesses, and a failing
// provider is reported rather than turned into content.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createModelRecord, draftModelFor, keyRefFor, MODEL_ROLES,
  portableModels, removeModel, selectModel, upsertModel, validateModel
} from '../src/models.js'
import { chatCompletion, isKeylessProvider, listProviderModels, PROVIDERS } from '../src/providers.js'

const groqDraft = {
  provider: 'groq',
  label: 'Llama',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b',
  roles: [MODEL_ROLES.chat],
  apiKey: 'gsk_secret'
}

test('a keyless local provider needs no API key', () => {
  assert.equal(isKeylessProvider('ollama'), true)
  const draft = { ...draftModelFor('ollama'), model: 'llama3' }
  assert.equal(validateModel(draft).valid, true)
})

test('a hosted provider without a key is rejected', () => {
  const { valid, errors } = validateModel({ ...groqDraft, apiKey: '' })
  assert.equal(valid, false)
  assert.match(errors.apiKey, /ключ/)
})

test('a relative base URL is rejected for real providers', () => {
  // A relative URL inside a WebView resolves to the app's own bundle, which is
  // the exact failure mode that produced "Unexpected token '<'".
  const { valid, errors } = validateModel({ ...groqDraft, baseUrl: '/api/ai' })
  assert.equal(valid, false)
  assert.match(errors.baseUrl, /полным/)
})

test('the project gateway may keep a relative path', () => {
  const { valid } = validateModel({
    provider: 'gateway', baseUrl: '/api/ai', model: 'server-default', roles: [MODEL_ROLES.chat]
  })
  assert.equal(valid, true)
})

test('a model with no identifier or no role is rejected', () => {
  assert.equal(validateModel({ ...groqDraft, model: '' }).valid, false)
  assert.equal(validateModel({ ...groqDraft, roles: [] }).valid, false)
})

test('the API key is returned separately and never stored in the record', () => {
  const { record, secret } = createModelRecord(groqDraft)
  assert.equal(secret, 'gsk_secret')
  assert.equal(record.apiKeyRef, keyRefFor(record.id))
  const serialised = JSON.stringify(record)
  assert.doesNotMatch(serialised, /gsk_secret/, 'the secret must not reach the stored record')
  assert.equal('apiKey' in record, false)
})

test('a keyless model carries no key reference at all', () => {
  const { record, secret } = createModelRecord({ ...draftModelFor('ollama'), model: 'llama3' })
  assert.equal(record.apiKeyRef, null)
  assert.equal(secret, '')
})

test('an invalid draft throws instead of saving something broken', () => {
  assert.throws(() => createModelRecord({ provider: 'groq', model: '', roles: [] }))
})

test('upsert adds then updates in place, remove deletes', () => {
  const { record } = createModelRecord(groqDraft)
  let list = upsertModel([], record)
  assert.equal(list.length, 1)
  list = upsertModel(list, { ...record, label: 'Renamed' })
  assert.equal(list.length, 1)
  assert.equal(list[0].label, 'Renamed')
  assert.equal(removeModel(list, record.id).length, 0)
})

test('selectModel honours the active choice only when it can do the job', () => {
  const chat = { id: 'a', label: 'chat', roles: ['chat'] }
  const embed = { id: 'b', label: 'embed', roles: ['embed'] }
  const models = [chat, embed]
  assert.equal(selectModel(models, 'chat', 'a').id, 'a')
  // 'a' is active but cannot embed, so the embedder is chosen instead.
  assert.equal(selectModel(models, 'embed', 'a').id, 'b')
})

test('selectModel returns null rather than substituting a wrong model', () => {
  assert.equal(selectModel([{ id: 'a', roles: ['chat'] }], 'vision', 'a'), null)
  assert.equal(selectModel([], 'chat'), null)
})

test('exported models carry no key reference', () => {
  const { record } = createModelRecord(groqDraft)
  const [exported] = portableModels([record])
  assert.equal('apiKeyRef' in exported, false)
  assert.equal(exported.model, 'llama-3.3-70b')
})

test('every preset provider has a label and a hint', () => {
  for (const [id, info] of Object.entries(PROVIDERS)) {
    assert.ok(info.label, `${id} needs a label`)
    assert.ok(info.hint || info.gateway, `${id} needs a hint`)
  }
})

// --- transport ---

function stubFetch(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

const model = { baseUrl: 'https://api.example/v1', model: 'm1', apiKey: 'k1' }

test('chatCompletion sends the key and returns the message text', async () => {
  let seen = null
  const restore = stubFetch(async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) }
    return new Response(JSON.stringify({ model: 'm1', choices: [{ message: { content: 'Ответ' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } })
  })
  try {
    const result = await chatCompletion(model, { system: 'sys', messages: [{ role: 'user', content: 'привет' }] })
    assert.equal(result.text, 'Ответ')
    assert.equal(seen.url, 'https://api.example/v1/chat/completions')
    assert.equal(seen.auth, 'Bearer k1')
    assert.equal(seen.body.messages[0].role, 'system')
  } finally { restore() }
})

test('an HTML response from a wrong URL is reported, never returned as text', async () => {
  const restore = stubFetch(async () => new Response('<!doctype html><html>login</html>',
    { status: 200, headers: { 'content-type': 'text/html' } }))
  try {
    await assert.rejects(() => chatCompletion(model, { messages: [] }), /не JSON/)
  } finally { restore() }
})

test('a provider error message is surfaced verbatim', async () => {
  const restore = stubFetch(async () => new Response(JSON.stringify({ error: { message: 'Invalid API key' } }),
    { status: 401, headers: { 'content-type': 'application/json' } }))
  try {
    await assert.rejects(() => chatCompletion(model, { messages: [] }), /Invalid API key/)
  } finally { restore() }
})

test('an empty completion is an error, not an empty answer', async () => {
  const restore = stubFetch(async () => new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }))
  try {
    await assert.rejects(() => chatCompletion(model, { messages: [] }), /пустой ответ/)
  } finally { restore() }
})

test('a model with no base URL or no identifier refuses to call out', async () => {
  await assert.rejects(() => chatCompletion({ model: 'm' }, { messages: [] }), /адрес/)
  await assert.rejects(() => chatCompletion({ baseUrl: 'https://x/v1' }, { messages: [] }), /идентификатор/)
})

test('listProviderModels reads the ids the endpoint advertises', async () => {
  const restore = stubFetch(async () => new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }))
  try {
    assert.deepEqual(await listProviderModels(model), ['a', 'b'])
  } finally { restore() }
})
