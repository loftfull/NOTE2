function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0 }

export function assessExtractionQuality(text = '', sections = []) {
  const normalized = String(text).replace(/\r/g, '').trim()
  if (!normalized) return { score: 0, grade: 'empty', warnings: ['No extracted text was returned.'], metrics: { characters: 0, alphanumericRatio: 0, repeatedLineRatio: 0 } }

  const chars = [...normalized]
  const alphanumeric = chars.filter(ch => /[\p{L}\p{N}]/u.test(ch)).length
  const printable = chars.filter(ch => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(ch)).length
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)
  const counts = new Map()
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1)
  const repeatedLines = [...counts.values()].filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0)
  const alphanumericRatio = ratio(alphanumeric, chars.length)
  const printableRatio = ratio(printable, chars.length)
  const repeatedLineRatio = ratio(repeatedLines, lines.length)
  const pageSections = (sections || []).filter(section => Number.isFinite(Number(section?.locator?.page)))
  const unreadablePages = pageSections.filter(section => /\[No readable text\]/i.test(section.text || '')).length

  let score = 1
  const warnings = []
  if (chars.length < 24) { score -= 0.35; warnings.push('Very little text was extracted.') }
  if (alphanumericRatio < 0.45) { score -= 0.3; warnings.push('Low alphanumeric density may indicate noisy OCR.') }
  if (printableRatio < 0.98) { score -= 0.2; warnings.push('Control characters were detected in the extraction.') }
  if (repeatedLineRatio > 0.3) { score -= 0.2; warnings.push('Many repeated lines may indicate OCR duplication.') }
  if (pageSections.length && unreadablePages) {
    score -= Math.min(0.35, unreadablePages / pageSections.length * 0.35)
    warnings.push(`${unreadablePages} page${unreadablePages === 1 ? '' : 's'} reported no readable text.`)
  }
  score = Math.max(0, Math.min(1, score))
  const grade = score >= 0.85 ? 'strong' : score >= 0.65 ? 'usable' : score >= 0.4 ? 'review' : 'weak'
  return {
    score,
    grade,
    warnings,
    metrics: { characters: chars.length, alphanumericRatio, printableRatio, repeatedLineRatio, pageCount: pageSections.length, unreadablePages }
  }
}
