import { authenticatedFetch } from './api-session.js'
export async function embedTexts(endpoint, inputs) {
  const values = (Array.isArray(inputs) ? inputs : [inputs]).map(x => String(x || '').trim()).filter(Boolean)
  if (!endpoint || !values.length) return []
  const response = await authenticatedFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: values })
  })
  if (!response.ok) throw new Error(`Embedding endpoint returned ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data.vectors) || data.vectors.length !== values.length) throw new Error('Embedding endpoint returned invalid vectors')
  return data.vectors
}

export async function embedInBatches(endpoint, inputs, batchSize = 32) {
  const out = []
  for (let i = 0; i < inputs.length; i += batchSize) {
    out.push(...await embedTexts(endpoint, inputs.slice(i, i + batchSize)))
  }
  return out
}
