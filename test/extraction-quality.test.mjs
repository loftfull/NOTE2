import test from 'node:test'
import assert from 'node:assert/strict'
import { assessExtractionQuality } from '../src/extraction-quality.js'

test('quality heuristic accepts normal extracted prose', () => {
  const quality = assessExtractionQuality('Project summary\nThis document contains readable sentences, numbers 123, and normal punctuation.')
  assert.ok(quality.score >= 0.85)
  assert.equal(quality.grade, 'strong')
  assert.equal(quality.warnings.length, 0)
})

test('quality heuristic flags unreadable pages and noisy extraction', () => {
  const sections = [
    { locator:{page:1}, text:'[No readable text]' },
    { locator:{page:2}, text:'%%%% %%%% %%%%\n%%%% %%%%' }
  ]
  const quality = assessExtractionQuality(sections.map(x=>x.text).join('\n'), sections)
  assert.ok(quality.score < 0.65)
  assert.ok(quality.warnings.some(w=>/no readable text/i.test(w)))
})
