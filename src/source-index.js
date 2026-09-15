// Turns a parsed source into retrievable chunks and stores it in the vault.
// Reconstructed from its call sites in App.jsx after the original was lost
// with the v4.10 upload.
//
// The one contract App.jsx depends on is the returned `indexMode`: it counts a
// source as vector-indexed only when embeddings genuinely came back, so this
// module must never report 'vector' on a failed embed. Lexical retrieval still
// works in that case — rankChunks() falls back to lexicalChunkScore — so the
// degradation is real search, not a heuristic dressed up as one.

import { chunkSections, chunkText } from './ingest.js'
import { embedInBatches } from './embeddings.js'
import { instagramSearchSections } from './instagram-analysis.js'
import { saveSourceWithChunks } from './source-db.js'

export function sourceChunks(source = {}) {
  // Instagram sources carry their text across caption, per-media OCR and
  // transcripts; their own splitter keeps each fragment's locator attached so
  // evidence can point at a specific carousel item rather than the post.
  if (source.kind === 'instagram') return chunkSections(instagramSearchSections(source))
  if (Array.isArray(source.sections) && source.sections.length) return chunkSections(source.sections)
  return chunkText(source.text || '')
}

export async function indexSourceRecord(source, settings = {}) {
  if (!source?.id) throw new Error('A source id is required')

  const chunks = sourceChunks(source)
  if (!chunks.length) {
    // Still store it: a source that failed extraction must stay visible in the
    // library with its status, otherwise the file silently vanishes after import.
    const stored = await saveSourceWithChunks({ ...source, chunkCount: 0, indexMode: 'none' }, [])
    return { ...stored, indexMode: 'none', chunkCount: 0 }
  }

  let indexMode = 'lexical'
  let indexError = null
  let prepared = chunks

  if (settings?.embedEndpoint) {
    try {
      const vectors = await embedInBatches(settings.embedEndpoint, chunks.map(chunk => chunk.text))
      if (vectors.length === chunks.length && vectors.every(v => Array.isArray(v) && v.length)) {
        prepared = chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }))
        indexMode = 'vector'
      } else {
        indexError = 'The embedding endpoint returned an unexpected number of vectors.'
      }
    } catch (error) {
      // Record why, rather than swallowing it. The source is still searchable
      // lexically, and the UI can show that vectors are missing for this one.
      indexError = error?.message || 'Embedding failed'
    }
  }

  const record = {
    ...source,
    chunkCount: prepared.length,
    indexMode,
    indexError,
    indexedAt: Date.now()
  }
  const stored = await saveSourceWithChunks(record, prepared)
  return { ...stored, indexMode, chunkCount: prepared.length, indexError }
}
