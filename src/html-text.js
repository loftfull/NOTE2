// HTML → читаемый текст. Одна реализация на клиент и на сервер.
//
// Раньше их было две: эта (для страниц по ссылке) и stripHtml в src/ingest.js
// (для локальных .html и глав EPUB). Вторая была слабее — снимала теги
// подстановкой пробела, из-за чего <b>текст</b>: давало «текст :», не
// выбрасывала <head> и не раскодировала числовые сущности. Расхождение нашлось
// на настоящих файлах, и слабая версия удалена, а не подправлена.
//
// Цель — текст, пригодный для поиска и для модели, с сохранёнными границами
// абзацев, а не точный рендер. Разбиение на чанки идёт по пустым строкам,
// поэтому блочные элементы обязаны превращаться в перевод строки: наивное
// снятие тегов даёт одну длинную строку, и каждый чанк тогда склеивает
// несвязанные абзацы.
//
// DOM-парсер не используется намеренно: сюда приходит текст с произвольного
// хоста, а проход регулярными выражениями по строке ничего выполнить не может.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™',
  deg: '°', plusmn: '±', times: '×', divide: '÷', middot: '·', bull: '•',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶',
  shy: '', zwnj: '', zwj: '', ensp: ' ', emsp: ' ', thinsp: ' '
}

/** Decodes the named and numeric entities that appear in real documents. */
export function decodeEntities(input = '') {
  return String(input).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      // Surrogate halves are not characters; emitting them corrupts the string.
      if (code >= 0xd800 && code <= 0xdfff) return ''
      try { return String.fromCodePoint(code) } catch { return match }
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/** The document title, entity-decoded and trimmed, or ''. */
export function htmlTitle(html = '') {
  const explicit = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html))
  if (explicit) {
    const title = decodeEntities(explicit[1]).replace(/\s+/g, ' ').trim()
    if (title) return title.slice(0, 300)
  }
  // og:title is the usual fallback on pages that render the title client-side.
  const og = /<meta[^>]+(?:property|name)\s*=\s*["']og:title["'][^>]*>/i.exec(String(html))
  if (og) {
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(og[0])
    if (content) return decodeEntities(content[1]).replace(/\s+/g, ' ').trim().slice(0, 300)
  }
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(String(html))
  if (h1) return decodeEntities(h1[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 300)
  return ''
}

// Elements whose content is code or presentation, never prose.
const DROPPED = ['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed', 'head']
// Elements that end a line of prose.
const BLOCKS = [
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'pre',
  'figcaption', 'dt', 'dd', 'td', 'th', 'ul', 'ol', 'table', 'form', 'fieldset'
]

/** Readable text with paragraph boundaries preserved as blank lines. */
export function htmlToText(html = '') {
  let text = String(html)

  // Comments first: a comment can contain anything, including tags.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ' ')

  for (const tag of DROPPED) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), ' ')
    // An unclosed dropped tag would otherwise leak its body into the output.
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i'), ' ')
  }

  text = text.replace(/<br\b[^>]*>/gi, '\n')
  text = text.replace(/<hr\b[^>]*>/gi, '\n\n')
  for (const tag of BLOCKS) {
    text = text.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '\n\n')
  }

  // Остались только строчные элементы: блочные и <br>/<hr> уже стали
  // переводами строки выше. Браузер их не разделяет ничем, поэтому и здесь
  // они снимаются без подстановки пробела: иначе <b>текст</b>: даёт
  // «текст :», а мульти<i>языч</i>ность рвётся на три слова.
  text = text.replace(/<[^>]*>/g, '')
  text = decodeEntities(text)

  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

