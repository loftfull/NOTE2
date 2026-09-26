#!/usr/bin/env node
// Готовит копию dist/ для публикации онлайн-просмотра.
//
// Зачем отдельный шаг. Служба публикации отказывается принимать текстовый
// файл, в котором есть литерал U+FFFD (replacement character):
//   file "assets/index-….js" has the replacement character U+FFFD at line 3,
//   column 6940 — replace it with the intended text
// В бандл он попадает не из нашего кода, а из marked: её декодер числовых
// сущностей возвращает U+FFFD для значений вне диапазона Unicode
// (node_modules/marked/lib/marked.esm.js, ветка r > 1114111 || surrogate).
// Запись \uFFFD даёт во время выполнения тот же символ, но сам файл в этом
// месте остаётся ASCII. Проверено: &#1114112; после замены по-прежнему
// отрисовывается как U+FFFD.
//
// Карты кода (.map) не публикуются — это ~3 МБ, которые в просмотре не нужны.
//
// Использование:  node tools/publish-preview/prepare.mjs <dist> <куда>

import fs from 'node:fs'
import path from 'node:path'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('использование: node tools/publish-preview/prepare.mjs <dist> <куда>')
  process.exit(2)
}
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error(`в ${src} нет index.html — сначала npm run build`)
  process.exit(2)
}

fs.rmSync(out, { recursive: true, force: true })

const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.webmanifest', '.json', '.txt', '.map'])
let copied = 0
let skipped = 0
let escaped = 0

const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(from); continue }
    if (from.endsWith('.map')) { skipped++; continue }
    const rel = path.relative(src, from)
    const to = path.join(out, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    if (TEXT.has(path.extname(from))) {
      const text = fs.readFileSync(from, 'utf8')
      const hits = text.split('\uFFFD').length - 1
      if (hits) {
        fs.writeFileSync(to, text.replaceAll('\uFFFD', '\\uFFFD'), 'utf8')
        console.log(`${rel}: экранировано вхождений U+FFFD — ${hits}`)
        escaped += hits
      } else {
        fs.writeFileSync(to, text, 'utf8')
      }
    } else {
      fs.copyFileSync(from, to)
    }
    copied++
  }
}
walk(src)

// Гарантия, а не надежда: если что-то осталось, публикация всё равно упадёт,
// так что лучше упасть здесь и с понятным сообщением.
const left = []
const verify = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) { verify(p); continue }
    if (!TEXT.has(path.extname(p))) continue
    if (fs.readFileSync(p, 'utf8').includes('\uFFFD')) left.push(path.relative(out, p))
  }
}
verify(out)

console.log(`скопировано файлов: ${copied}, пропущено карт кода: ${skipped}, замен: ${escaped}`)
if (left.length) {
  console.error('U+FFFD остался в:', left.join(', '))
  process.exit(1)
}
console.log(`готово: ${out}`)
