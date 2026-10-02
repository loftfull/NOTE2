#!/usr/bin/env node
// Разметка → страницы PNG, когда интерфейс принимает только изображения.
//
// Это вынужденный формат, и у него есть цена: текст перестаёт быть текстом.
// Модель читает его зрением, а зрение ошибается — особенно на коде, где
// важен каждый знак. Поэтому страницы делаются крупными и с запасом:
//
//   • ширина 1400 px при кегле 23 px — после обычного уменьшения до
//     ~1100 px по длинной стороне буквы остаются различимыми;
//   • страницы перекрываются на 60 px, чтобы строка, разрезанная границей,
//     целиком попала на следующую;
//   • PNG, а не JPEG: текст на сжатии с потерями расползается.
//
// Использование: node tools/handoff/images.mjs <файл.md> <каталог> [префикс]

import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'
import { chromium } from 'playwright'

const SOURCE = process.argv[2]
const OUT = process.argv[3] || 'handoff-images'
const PREFIX = process.argv[4] || path.basename(SOURCE, path.extname(SOURCE))

const PAGE_WIDTH = 1400
const PAGE_HEIGHT = 1980
const OVERLAP = 60          // запас, чтобы разрезанная строка не пропала

const EXECUTABLE = process.env.NOTE2_CHROMIUM
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)

fs.mkdirSync(OUT, { recursive: true })
const body = marked.parse(fs.readFileSync(SOURCE, 'utf8'))

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body { margin: 0; background: #fff }
  #page { width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; overflow: hidden;
          position: relative; background: #fff }
  #inner { position: absolute; left: 0; top: 0; width: ${PAGE_WIDTH}px;
           padding: 56px 64px 56px; }
  #stamp { position: absolute; right: 18px; bottom: 12px; font: 15px/1 Georgia, serif;
           color: #9a9289 }
  #content { font: 23px/1.55 Georgia, "Times New Roman", serif; color: #16140f }
  h1 { font-size: 38px; margin: 0 0 .5em; line-height: 1.2 }
  h2 { font-size: 29px; margin: 1.1em 0 .45em; padding-bottom: .15em;
       border-bottom: 2px solid #ddd8ce; line-height: 1.25 }
  h3 { font-size: 25px; margin: .9em 0 .35em }
  p, li { margin: .45em 0 }
  ul, ol { padding-left: 1.3em }
  code, pre { font-family: "DejaVu Sans Mono", Menlo, monospace }
  code { font-size: 20px; background: #f1efe9; padding: .08em .3em; border-radius: 4px }
  pre { font-size: 19px; line-height: 1.45; background: #f6f4ef; padding: 16px 20px;
        border-radius: 8px; white-space: pre-wrap; word-break: break-word; margin: .7em 0 }
  pre code { background: none; padding: 0; font-size: inherit }
  table { border-collapse: collapse; width: 100%; font-size: 20px; margin: .7em 0 }
  th, td { border: 1px solid #c9c4b8; padding: 7px 10px; text-align: left; vertical-align: top }
  th { background: #f3f1ea }
  blockquote { margin: .7em 0; padding-left: 16px; border-left: 4px solid #c9c4b8; color: #4a453d }
  hr { border: 0; border-top: 2px solid #e3ded4; margin: 1.1em 0 }
  strong { font-weight: 700 }
</style></head><body>
<div id="page"><div id="inner"><div id="content">${body}</div></div><div id="stamp"></div></div>
</body></html>`

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
const page = await browser.newPage({
  viewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
  deviceScaleFactor: Number(process.env.NOTE2_PAGE_SCALE || 1),
})
await page.setContent(html, { waitUntil: 'load' })

const total = await page.evaluate(() => document.getElementById('content').scrollHeight + 112)
const step = PAGE_HEIGHT - OVERLAP
const count = Math.max(1, Math.ceil((total - OVERLAP) / step))

const made = []
for (let i = 0; i < count; i += 1) {
  await page.evaluate(([offset, label]) => {
    document.getElementById('inner').style.top = `${-offset}px`
    document.getElementById('stamp').textContent = label
  }, [i * step, `${PREFIX} · ${i + 1} из ${count}`])
  const file = path.join(OUT, `${PREFIX}-${String(i + 1).padStart(2, '0')}.png`)
  await page.locator('#page').screenshot({ path: file })
  made.push(file)
}
await browser.close()

const bytes = made.reduce((n, f) => n + fs.statSync(f).size, 0)
console.log(`${PREFIX}: ${count} страниц, ${(bytes / 1024 / 1024).toFixed(2)} МБ`)
console.log(`  размер страницы ${PAGE_WIDTH}×${PAGE_HEIGHT} при двойной плотности`)
console.log(`  перекрытие ${OVERLAP} px: строка, попавшая на границу, есть на следующей странице`)
