import test from 'node:test'
import assert from 'node:assert/strict'
import { extractKeywords, semanticScore, summarizeLocal } from '../src/ai.js'

test('extractKeywords ranks repeated meaningful terms', () => {
  const words = extractKeywords('React notes react search notes notebook', 3).map(x => x.word)
  assert.deepEqual(words.slice(0,2), ['react','notes'])
})

test('summarizeLocal returns supplied content rather than canned text', () => {
  const source = 'Local first storage keeps notes on device. Search finds relevant notes. Media requires a backend connector.'
  const summary = summarizeLocal(source, 1)
  assert.ok(source.includes(summary))
})

test('semanticScore rewards overlapping concepts', () => {
  const note = { title:'Architecture notebook', content:'React local first workspace', tags:['design'] }
  assert.ok(semanticScore('react notebook', note) > semanticScore('medical sleep', note))
})
