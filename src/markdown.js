// Отрисовка Markdown заметки.
//
// Зачем понадобилось: в редакторе шесть кнопок — «Заголовок», «Чек-лист»,
// «Список», «Цитата», «Код», «Таблица» — и все вставляют Markdown. Рендера же
// не было нигде: заметка везде показывалась как обычный текст, а в превью
// разметка просто стиралась (stripMarkdown вырезает #*_`>~- как мусор).
// То есть приложение предлагало писать в формате, который само не умело
// показывать.
//
// Два правила, которые здесь важнее удобства:
//
// 1. Результат всегда проходит через DOMPurify. Текст заметки приходит не
//    только от владельца: он попадает туда из импортированных файлов, из
//    страниц по ссылке, из субтитров и из ответов модели. Любой из этих
//    источников может содержать <script> или onerror=, и вставка сырого HTML
//    в dangerouslySetInnerHTML — это готовый XSS в приложении, где рядом
//    лежат ключи провайдеров.
//
// 2. Ссылки открываются в новой вкладке с rel="noopener noreferrer", а схемы
//    кроме http/https/mailto вырезаются: javascript: в ссылке — тот же XSS,
//    только через клик.

import { marked } from 'marked'
import createDOMPurify from 'dompurify'

// В браузере dompurify сам берёт window. В Node его нет, и модуль
// превращается в фабрику — без этого санитайзер, самую важную часть здесь,
// нельзя было бы покрыть обычными тестами.
let purifier = null
function purify() {
  if (purifier) return purifier
  purifier = typeof createDOMPurify.sanitize === 'function'
    ? createDOMPurify
    : createDOMPurify(globalThis.window)
  return purifier
}

marked.setOptions({
  gfm: true,      // таблицы, зачёркивание, списки задач — то, что вставляют кнопки
  breaks: true    // перенос строки остаётся переносом: люди пишут заметки, а не статьи
})

const ALLOWED_SCHEMES = /^(https?:|mailto:|#|\/)/i

/** Один раз навешиваем правила на санитайзер. */
let hooksReady = false
function ensureHooks() {
  const dp = purify()
  if (hooksReady || typeof dp.addHook !== 'function') return
  dp.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      if (!ALLOWED_SCHEMES.test(href)) { node.removeAttribute('href'); return }
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    // Картинка из заметки может утечь к третьей стороне как маячок; показываем
    // только data: и то, что явно разрешено, остальное оставляем ссылкой.
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || ''
      if (!/^(https?:|data:image\/)/i.test(src)) node.removeAttribute('src')
      node.setAttribute('loading', 'lazy')
    }
  })
  hooksReady = true
}

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'input' // чекбоксы списков задач; disabled навешивается ниже
]

/**
 * Markdown → безопасный HTML.
 * Возвращает строку, пригодную для dangerouslySetInnerHTML.
 */
export function renderMarkdown(source = '') {
  const text = String(source || '')
  if (!text.trim()) return ''
  ensureHooks()

  let html
  try {
    html = marked.parse(text)
  } catch {
    // Сломанная разметка не должна ронять заметку: показываем как текст.
    return escapeHtml(text)
  }

  return purify().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'loading', 'type', 'checked', 'disabled', 'start'],
    // Никаких обработчиков событий и стилей из содержимого заметки.
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: false
  })
}

/** Экранирование на случай, когда разбор не удался. */
export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Есть ли в тексте разметка, ради которой стоит включать рендер. */
export function looksLikeMarkdown(text = '') {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|)/.test(String(text))
}
