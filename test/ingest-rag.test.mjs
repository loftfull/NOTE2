import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, normalizeText, stripHtml } from '../src/ingest.js'
import { buildEvidence, cosineSimilarity, groundedPrompt, rankChunks } from '../src/rag.js'

test('normalizes and strips HTML without script/style content', () => {
  const text = stripHtml('<h1>Hello</h1><script>bad()</script><p>World &amp; team</p>')
  assert.match(text, /Hello/)
  assert.match(text, /World & team/)
  assert.doesNotMatch(text, /bad/)
})

test('chunking produces overlapping bounded chunks', () => {
  const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} contains enough words to make chunking deterministic and useful.`).join('\n\n')
  const chunks = chunkText(text, { targetChars: 220, overlapChars: 30, maxChars: 300 })
  assert.ok(chunks.length > 2)
  assert.ok(chunks.every(c => c.text.length <= 340))
  assert.deepEqual(chunks.map(c => c.index), chunks.map((_, i) => i))
})

test('cosine similarity ranks aligned vectors higher', () => {
  assert.ok(cosineSimilarity([1,0],[1,0]) > cosineSimilarity([1,0],[0,1]))
})

test('RAG ranking preserves source provenance and citations', () => {
  const sources = [{ id:'a', name:'Architecture.md', kind:'text' }, { id:'b', name:'Recipe.md', kind:'text' }]
  const chunks = [
    { id:'a:0', sourceId:'a', index:0, text:'The API gateway applies rate limiting and request routing.' },
    { id:'b:0', sourceId:'b', index:0, text:'Bake the bread at two hundred degrees.' }
  ]
  const ranked = rankChunks({ query:'API gateway rate limiting', chunks, sources, limit:2 })
  assert.equal(ranked[0].source.id, 'a')
  const evidence = buildEvidence(ranked)
  assert.equal(evidence[0].ref, 'S1')
  assert.match(groundedPrompt('How is traffic controlled?', evidence), /\[S1\]/)
})
