import { tokenizeStems } from './ai.js'

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0
}

export function lexicalChunkScore(query, chunk, source) {
  const terms = tokenizeStems(query)
  if (!terms.length) return 0
  const body = tokenizeStems(chunk.text || '')
  const bodySet = new Set(body)
  const titleSet = new Set(tokenizeStems(source?.name || source?.title || ''))
  let hits = 0
  let titleHits = 0
  for (const term of new Set(terms)) {
    if (bodySet.has(term)) hits += 1
    if (titleSet.has(term)) titleHits += 1
  }
  const coverage = hits / new Set(terms).size
  const phrase = (chunk.text || '').toLowerCase().includes(query.trim().toLowerCase()) ? 0.25 : 0
  return Math.min(1, coverage * 0.72 + Math.min(0.18, titleHits * 0.08) + phrase)
}

export function rankChunks({ query, chunks, sources, queryVector = null, limit = 6 }) {
  const sourceMap = sources instanceof Map ? sources : new Map((sources || []).map(s => [s.id, s]))
  return (chunks || []).map(chunk => {
    const source = sourceMap.get(chunk.sourceId)
    const lexical = lexicalChunkScore(query, chunk, source)
    const vector = queryVector && chunk.vector ? Math.max(0, cosineSimilarity(queryVector, chunk.vector)) : null
    const score = vector === null ? lexical : Math.min(1, vector * 0.78 + lexical * 0.22)
    return { chunk, source, lexical, vector, score }
  }).filter(x => x.score > 0.01).sort((a, b) => b.score - a.score).slice(0, limit)
}

export function buildEvidence(matches) {
  return matches.map((match, index) => ({
    ref: `S${index + 1}`,
    sourceId: match.source?.id,
    sourceName: match.source?.name || 'Untitled source',
    kind: match.source?.kind || 'text',
    url: match.source?.url || null,
    chunkIndex: match.chunk.index,
    sectionLabel: match.chunk.sectionLabel || null,
    locator: match.chunk.locator || null,
    score: match.score,
    text: match.chunk.text
  }))
}

export function groundedPrompt(question, evidence) {
  const blocks = evidence.map(item => `[${item.ref}] ${item.sourceName}\n${item.text}`).join('\n\n')
  return `QUESTION\n${question.trim()}\n\nEVIDENCE\n${blocks}\n\nINSTRUCTIONS\nAnswer only from EVIDENCE. Cite every material claim with one or more source references such as [S1]. If the evidence is insufficient, say what is missing. Do not create sources or citations.`
}

export function localGroundedAnswer(question, evidence) {
  if (!evidence.length) return 'No relevant evidence was found in the indexed sources.'
  const intro = `I found ${evidence.length} relevant evidence fragment${evidence.length === 1 ? '' : 's'} for: “${question.trim()}”.`
  const items = evidence.slice(0, 4).map(item => `[${item.ref}] ${item.text.replace(/\s+/g, ' ').slice(0, 360)}${item.text.length > 360 ? '…' : ''}`)
  return `${intro}\n\n${items.join('\n\n')}\n\nConnect the AI gateway to synthesize these fragments into a cited answer.`
}
