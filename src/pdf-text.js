function joinTextItems(items = []) {
  const lines = []
  let line = ''
  for (const item of items) {
    if (!item || typeof item.str !== 'string' || !item.str) continue
    const value = item.str.replace(/\s+/g, ' ').trim()
    if (!value) { if (item.hasEOL && line.trim()) { lines.push(line.trim()); line = '' } ; continue }
    const noSpaceBefore = /^[,.;:!?%)\]}]/.test(value)
    const noSpaceAfter = /[(\[{\/]$/.test(line)
    if (line && !noSpaceBefore && !noSpaceAfter) line += ' '
    line += value
    if (item.hasEOL) { lines.push(line.trim()); line = '' }
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractPdfText(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), stopAtErrors: false })
  const document = await loadingTask.promise
  const sections = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent({ includeMarkedContent: false })
      const text = joinTextItems(content.items)
      sections.push({ label: `Page ${pageNumber}`, locator: { page: pageNumber }, text })
      page.cleanup?.()
    }
  } finally {
    await document.destroy?.()
  }
  const text = sections.filter(s => s.text).map(s => `${s.label}\n${s.text}`).join('\n\n').trim()
  return { text, sections, pageCount: sections.length }
}
