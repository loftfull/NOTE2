#!/usr/bin/env node
// Готовит handoff в форматах, которые принимает обычный чат-интерфейс.
//
// Архив .tar.gz годится человеку и не годится чату: почти нигде нельзя
// приложить архив. Поэтому здесь — текстовые сборки разного размера, чтобы
// можно было выбрать под ограничение конкретного интерфейса.
//
// Размер в токенах измеряется настоящим токенизатором (gpt-tokenizer,
// словарь o200k_base), если он установлен; у других моделей число
// отличается, обычно в пределах пятой части. Без токенизатора выводится
// только размер в символах — выдуманных оценок здесь нет.
//
// Использование: node tools/handoff/pack.mjs [куда]

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT = process.argv[2] || 'handoff-pack'
const ROOT = process.cwd()

let encode = null
try { ({ encode } = await import('gpt-tokenizer/encoding/o200k_base')) } catch { /* необязателен */ }

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8')
const exists = file => fs.existsSync(path.join(ROOT, file))

// Модули, без которых не понять решения: разбор файлов, контракт отказа
// AI, хранение, защита исходящих запросов.
const CORE = [
  'src/ingest.js', 'src/html-text.js', 'src/archive-text.js', 'src/media-meta.js',
  'src/audio-meta.js', 'src/pdf-text.js', 'src/markdown.js', 'src/extraction-quality.js',
  'src/ai.js', 'src/providers.js', 'src/model-catalog.js',
  'src/source-db.js', 'src/storage.js', 'src/stem-ru.js', 'src/plural.js',
  'server.mjs', 'server/config.mjs', 'server/ssrf.mjs', 'server/http.mjs',
  'server/store.mjs', 'server/throttle.mjs', 'server/upstream.mjs',
]

const ALL = [
  ...walk('src'), ...walk('server'), 'server.mjs',
].filter((f, i, a) => a.indexOf(f) === i && exists(f))

function walk(dir) {
  const out = []
  const visit = d => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name)
      if (e.isDirectory()) visit(rel)
      else if (/\.(js|jsx|mjs|css)$/.test(e.name)) out.push(rel)
    }
  }
  visit(dir)
  return out.sort()
}

const fence = file => {
  const ext = path.extname(file).slice(1)
  return ext === 'jsx' ? 'jsx' : ext === 'css' ? 'css' : 'js'
}

const bundleCode = (files, title, intro) => {
  const parts = [`# ${title}\n\n${intro}\n`]
  parts.push('## Состав\n')
  for (const f of files) parts.push(`- \`${f}\` — ${read(f).split('\n').length} строк`)
  parts.push('')
  for (const f of files) {
    parts.push(`\n---\n\n## \`${f}\`\n`)
    parts.push('```' + fence(f))
    parts.push(read(f).replace(/\s+$/, ''))
    parts.push('```')
  }
  return parts.join('\n') + '\n'
}

fs.mkdirSync(OUT, { recursive: true })
const written = []
const write = (name, content) => {
  fs.writeFileSync(path.join(OUT, name), content, 'utf8')
  written.push({ name, content })
}

const brief = read('docs/HANDOFF_2026-10-02.md')
const prompt = read('docs/HANDOFF_PROMPT.md')
const state = read('docs/handoff-state.json')

write('01-БРИФ.md', brief)
write('02-ЗАДАНИЕ-ДЛЯ-МОДЕЛИ.md', prompt)
write('03-СНИМОК-СОСТОЯНИЯ.json', state)

write('04-КОД-ЯДРО.md', bundleCode(CORE.filter(exists), 'NOTE2 — ключевые модули',
  'Модули, без которых не понять принятые решения: разбор файлов, контракт\n'
  + 'отказа AI, хранение, защита исходящих запросов. Полный код — в соседнем\n'
  + 'файле; интерфейс (App.jsx) и стили сюда не вошли из-за объёма.'))

write('05-КОД-ПОЛНОЕ.md', bundleCode(ALL, 'NOTE2 — весь клиент и сервер',
  'Всё содержимое src/ и server/, включая интерфейс и стили.'))

// Один файл, если интерфейс позволяет приложить только одно вложение.
write('06-ВСЁ-ОДНИМ-ФАЙЛОМ.md', [
  '# NOTE2 — передача работы одним файлом\n',
  'Внутри по порядку: задание для модели, описание проекта, снимок',
  'состояния и ключевые модули кода.\n',
  '\n---\n', prompt,
  '\n---\n', brief,
  '\n---\n\n# Снимок состояния\n\n```json\n' + state.trim() + '\n```\n',
  '\n---\n', bundleCode(CORE.filter(exists), 'Ключевые модули',
    'Разбор файлов, контракт отказа AI, хранение, защита исходящих запросов.'),
].join('\n'))

// Копии в .txt: часть интерфейсов принимает только text/plain.
for (const { name, content } of [...written]) {
  if (name.endsWith('.md')) write(name.replace(/\.md$/, '.txt'), content)
}

const measure = content => {
  const chars = content.length
  const tokens = encode ? encode(content).length : null
  return { chars, tokens }
}

console.log(`готово: ${path.resolve(OUT)}\n`)
console.log(encode
  ? 'файл                               символов    токенов*'
  : 'файл                               символов')
for (const { name, content } of written) {
  const { chars, tokens } = measure(content)
  const size = `${(chars / 1024).toFixed(0)} КБ`.padStart(9)
  console.log(`  ${name.padEnd(32)} ${size}` + (tokens === null ? '' : `  ${String(tokens).padStart(9)}`))
}
if (encode) {
  console.log('\n* измерено токенизатором o200k_base (gpt-tokenizer).')
  console.log('  У других моделей число отличается, обычно в пределах пятой части.')
} else {
  console.log('\nТокены не измерены: npm i --no-save gpt-tokenizer и запустите снова.')
}
