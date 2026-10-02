import { authenticatedFetch } from './api-session.js'
const STOP = new Set('the a an and or but of to in on for with from as is are was were be been being this that these those it its by at into about your you we our they their i me my have has had can could should would will may might not no do does did if then than also very more most some any all'.split(' '))

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-zа-яё0-9][a-zа-яё0-9-]{1,}/gi) || []).filter(w => !STOP.has(w))
}

export function extractKeywords(text, limit = 8) {
  const counts = new Map()
  for (const word of tokenize(text)) counts.set(word, (counts.get(word) || 0) + 1)
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }))
}

export function summarizeLocal(text, maxSentences = 4) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length <= maxSentences) return sentences.join(' ')
  const keywords = new Set(extractKeywords(text, 12).map(x => x.word))
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: tokenize(sentence).reduce((sum, word) => sum + (keywords.has(word) ? 1 : 0), 0)
  }))
  return scored.sort((a,b) => b.score - a.score || a.index - b.index).slice(0, maxSentences).sort((a,b) => a.index - b.index).map(x => x.sentence).join(' ')
}

export function semanticScore(query, note) {
  const q = new Set(tokenize(query))
  const n = new Set(tokenize(`${note.title} ${note.content} ${(note.tags || []).join(' ')}`))
  if (!q.size) return 0
  let overlap = 0
  for (const term of q) if (n.has(term)) overlap += 1
  const titleBoost = tokenize(note.title).some(t => q.has(t)) ? 0.2 : 0
  return Math.min(1, overlap / q.size + titleBoost)
}

function localFallback({ action, input }) {
  const text = input || ''
  if (action === 'summarize') return summarizeLocal(text)
  if (action === 'keywords') return extractKeywords(text, 12).map(x => `#${x.word}`).join('  ')
  if (action === 'improve') return text.split('\n').map(line => line.trim()).filter(Boolean).join('\n\n')
  if (action === 'title') return summarizeLocal(text, 1).replace(/[.!?]+$/, '').slice(0, 72) || 'Untitled note'
  if (action === 'instagram-brief') {
    const summary = summarizeLocal(text, 5)
    const tags = extractKeywords(text, 6).map(x => `#${x.word}`).join(' ')
    return `Краткая выжимка (локально)

${summary || 'Недостаточно извлечённого текста для выжимки.'}${tags ? `

Темы: ${tags}` : ''}`
  }
  if (action === 'instagram-detailed') {
    const summary = summarizeLocal(text, 9)
    const keywords = extractKeywords(text, 12).map(x => x.word)
    return `Подробный разбор (локально)

${summary || 'Недостаточно извлечённого текста.'}

Ключевые темы: ${keywords.join(', ') || 'не определены'}

Для более точной структуры, сущностей и проверки подключите AI gateway; локальный режим не добавляет фактов сверх извлечённого текста.`
  }
  if (action === 'instagram-organize') {
    const keywords = extractKeywords(text, 14).map(x => x.word)
    const summary = summarizeLocal(text, 5)
    return `Систематизация (локально)

Основное: ${summary || 'нет достаточного текста'}

Темы/теги: ${keywords.map(x=>`#${x}`).join(' ') || '—'}

Источник сохранён отдельно; OCR и транскрипты остаются привязаны к конкретным медиа.`
  }
  if (action === 'source-brief') {
    const blocks = [...text.matchAll(/\[(S\d+)\]\s*([^\n]*)\n([\s\S]*?)(?=\n\n\[S\d+\]|$)/g)].map(match => ({ ref: match[1], label: match[2].trim(), text: match[3].trim() })).filter(item => item.text)
    if (!blocks.length) return summarizeLocal(text, 4)
    const picked = blocks.slice(0, 5).map(item => {
      const sentence = summarizeLocal(item.text, 1).trim()
      return sentence ? `• ${sentence} [${item.ref}]` : ''
    }).filter(Boolean)
    return picked.length ? picked.join('\n') : `Недостаточно извлечённого текста для выжимки. [${blocks[0].ref}]`
  }
  if (action === 'grounded-analysis') {
    const evidence = text.match(/\[S\d+\][\s\S]*/)?.[0]
    return evidence ? `Local evidence mode\n\n${evidence.slice(0, 2200)}\n\nConnect the AI gateway for a synthesized answer that preserves these citations.` : 'No grounded evidence was supplied.'
  }
  return `Local mode is active. I can summarize, extract keywords and organize text without sending data to a server. Connect the server AI endpoint in Settings for model-backed answers.\n\nInput preview: ${text.slice(0, 500)}`
}

export async function runAiTask({ endpoint, model, action, input, system, history }) {
  if (!endpoint) return localFallback({ action, input })
  try {
    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, action, input, system, history })
    })
    if (!response.ok) throw new Error(`AI endpoint returned ${response.status}`)
    const data = await response.json()
    const text = data.output || data.text || data.message
    if (!text) throw new Error('AI endpoint returned no output')
    return text
  } catch {
    return localFallback({ action, input })
  }
}
