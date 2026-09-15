const decoder = new TextDecoder('utf-8', { fatal: false })

function u16(view, offset) { return view.getUint16(offset, true) }
function u32(view, offset) { return view.getUint32(offset, true) }

export function listZipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const min = Math.max(0, bytes.length - 65_557)
  let eocd = -1
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ZIP central directory was not found')
  const total = u16(view, eocd + 10)
  const centralOffset = u32(view, eocd + 16)
  const entries = []
  let offset = centralOffset
  for (let i = 0; i < total; i += 1) {
    if (offset + 46 > bytes.length || u32(view, offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry')
    const method = u16(view, offset + 10)
    const compressedSize = u32(view, offset + 20)
    const size = u32(view, offset + 24)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const localOffset = u32(view, offset + 42)
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    entries.push({ name, method, compressedSize, size, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

// Hard ceiling on what a single entry may inflate to. A deflate stream can
// expand by roughly 1000x, so a few-megabyte DOCX can otherwise claim gigabytes
// and take the tab (and the user's unsaved editor state) down with it.
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024

// Reads the decompressed stream in chunks and stops the moment the cap is
// passed, instead of materialising the whole thing with arrayBuffer() and
// discovering the size afterwards — by which point the memory is already gone.
async function inflateRaw(bytes, { limit = MAX_ENTRY_BYTES, name = 'entry' } = {}) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress Office/EPUB files locally')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const parts = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new Error(`Entry ${name} expands beyond the ${Math.round(limit / 1024 / 1024)} MB decompression limit and was rejected.`)
      }
      parts.push(value)
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.byteLength }
  return out
}

export async function extractZipEntry(input, entry) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const o = entry.localOffset
  if (o + 30 > bytes.length || u32(view, o) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${entry.name}`)
  const nameLength = u16(view, o + 26)
  const extraLength = u16(view, o + 28)
  const start = o + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > bytes.length) throw new Error(`Truncated ZIP entry: ${entry.name}`)
  const compressed = bytes.slice(start, end)
  if (entry.method === 0) return compressed
  if (entry.method === 8) {
    // The central directory's declared size is untrusted input, so it caps the
    // read only when it is smaller than the absolute ceiling — a lying header
    // cannot raise the limit.
    const declared = Number(entry.size)
    const limit = Number.isFinite(declared) && declared > 0 ? Math.min(declared, MAX_ENTRY_BYTES) : MAX_ENTRY_BYTES
    return inflateRaw(compressed, { limit, name: entry.name })
  }
  throw new Error(`Unsupported ZIP compression method ${entry.method}`)
}

function decodeXml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
}

function cleanText(value = '') {
  return decodeXml(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripMarkup(xml = '', { paragraphTags = [] } = {}) {
  let value = String(xml)
  for (const tag of paragraphTags) {
    const escaped = tag.replace(':', '\\:')
    value = value.replace(new RegExp(`<\\/${escaped}>`, 'gi'), '\n')
  }
  value = value
    .replace(/<(w:tab|text:tab|a:tab)\b[^>]*\/?\s*>/gi, '\t')
    .replace(/<(w:br|text:line-break|a:br)\b[^>]*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return cleanText(value)
}

function textNodes(xml = '') {
  return [...String(xml).matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)].map(m => decodeXml(m[1])).join('')
}

async function entryText(bytes, entry) {
  return decoder.decode(await extractZipEntry(bytes, entry))
}

function byNumericSuffix(a, b) {
  const na = Number((a.name.match(/(\d+)(?=\.[^.]+$)/) || [])[1] || 0)
  const nb = Number((b.name.match(/(\d+)(?=\.[^.]+$)/) || [])[1] || 0)
  return na - nb || a.name.localeCompare(b.name)
}

async function extractDocx(bytes, entries) {
  const parts = entries.filter(e => /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/i.test(e.name))
  parts.sort((a, b) => a.name === 'word/document.xml' ? -1 : b.name === 'word/document.xml' ? 1 : a.name.localeCompare(b.name))
  const sections = []
  for (const entry of parts) {
    const xml = await entryText(bytes, entry)
    const text = stripMarkup(xml, { paragraphTags: ['w:p','w:tr'] })
    if (text) sections.push({ label: entry.name === 'word/document.xml' ? 'Документ' : entry.name, text })
  }
  return sections
}

async function extractPptx(bytes, entries) {
  const slides = entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name)).sort(byNumericSuffix)
  const sections = []
  for (let i = 0; i < slides.length; i += 1) {
    const xml = await entryText(bytes, slides[i])
    const text = stripMarkup(xml, { paragraphTags: ['a:p'] })
    if (text) sections.push({ label: `Slide ${i + 1}`, text })
  }
  return sections
}

async function extractXlsx(bytes, entries) {
  const sharedEntry = entries.find(e => e.name === 'xl/sharedStrings.xml')
  let shared = []
  if (sharedEntry) {
    const xml = await entryText(bytes, sharedEntry)
    shared = [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(m => cleanText(textNodes(m[1])))
  }
  const sheets = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name)).sort(byNumericSuffix)
  const sections = []
  for (let i = 0; i < sheets.length; i += 1) {
    const xml = await entryText(bytes, sheets[i])
    const lines = []
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const cells = []
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attrs = cell[1]
        const body = cell[2]
        const type = (attrs.match(/\bt="([^"]+)"/i) || [])[1] || ''
        const raw = (body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i) || [])[1]
        let value = ''
        if (type === 's' && raw != null) value = shared[Number(raw)] ?? raw
        else if (type === 'inlineStr') value = textNodes(body)
        else value = raw != null ? decodeXml(raw) : textNodes(body)
        cells.push(cleanText(value))
      }
      if (cells.some(Boolean)) lines.push(cells.join('\t'))
    }
    if (lines.length) sections.push({ label: `Sheet ${i + 1}`, text: lines.join('\n') })
  }
  return sections
}

async function extractOpenDocument(bytes, entries) {
  const content = entries.find(e => e.name === 'content.xml')
  if (!content) return []
  const xml = await entryText(bytes, content)
  const text = stripMarkup(xml, { paragraphTags: ['text:p','text:h','table:table-row'] })
  return text ? [{ label: 'Документ', text }] : []
}

function htmlToText(html = '') {
  return cleanText(String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
}

async function extractEpub(bytes, entries) {
  const docs = entries.filter(e => /\.(xhtml|html|htm)$/i.test(e.name) && !/(nav|toc)\.(xhtml|html|htm)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))
  const sections = []
  for (const entry of docs) {
    const text = htmlToText(await entryText(bytes, entry))
    if (text) sections.push({ label: entry.name, text })
  }
  return sections
}

export async function extractArchiveText(arrayBuffer, kind) {
  const bytes = new Uint8Array(arrayBuffer)
  const entries = listZipEntries(bytes)
  let sections
  if (kind === 'docx') sections = await extractDocx(bytes, entries)
  else if (kind === 'pptx') sections = await extractPptx(bytes, entries)
  else if (kind === 'xlsx') sections = await extractXlsx(bytes, entries)
  else if (kind === 'odt' || kind === 'odp' || kind === 'ods') sections = await extractOpenDocument(bytes, entries)
  else if (kind === 'epub') sections = await extractEpub(bytes, entries)
  else throw new Error(`Unsupported archive document kind: ${kind}`)
  const text = sections.map(section => `${section.label}\n${section.text}`).join('\n\n').trim()
  return { text, sections, entries: entries.length }
}
