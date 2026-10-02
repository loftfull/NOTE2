import { chunkSections, chunkText } from './ingest.js'
import { embedInBatches } from './embeddings.js'
import { saveSourceWithChunks, updateChunkVectors } from './source-db.js'

export async function indexSourceRecord(source, settings = {}) {
  const chunks = source.sections?.length ? chunkSections(source.sections) : chunkText(source.text || '')
  const saved = await saveSourceWithChunks(source, chunks)
  if (!chunks.length || !settings.embedEndpoint) return { source: saved, chunks, indexMode: 'lexical' }
  try {
    const vectors = await embedInBatches(settings.embedEndpoint, chunks.map(chunk => chunk.text))
    const map = {}
    vectors.forEach((vector, index) => { if (vector) map[`${source.id}:${chunks[index].index}`] = vector })
    await updateChunkVectors(map)
    return { source: saved, chunks, indexMode: vectors.length ? 'vector' : 'lexical' }
  } catch {
    return { source: saved, chunks, indexMode: 'lexical' }
  }
}
