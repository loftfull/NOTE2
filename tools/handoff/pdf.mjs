#!/usr/bin/env node
// PDF из брифа — для интерфейсов, которые принимают документ, но не текст.
//
// Разметка переводится в HTML тем же marked, что и в приложении, и
// печатается предустановленным Chromium. Санитайзер здесь не нужен:
// на вход идёт собственный файл проекта, а не чужой ввод.
//
// Нужен playwright: npm i --no-save playwright
// Использование: node tools/handoff/pdf.mjs <файл.md> [файл.pdf]

import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'
import { chromium } from 'playwright'

const SOURCE = process.argv[2] || 'docs/HANDOFF_2026-10-02.md'
const TARGET = process.argv[3] || SOURCE.replace(/\.md$/, '.pdf')

const EXECUTABLE = process.env.NOTE2_CHROMIUM
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)

const body = marked.parse(fs.readFileSync(SOURCE, 'utf8'))

// Печать на бумагу: светлый фон, засечки для текста, моноширинный для кода,
// таблицы, которые не уезжают за поле.
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${path.basename(SOURCE)}</title>
<style>
  :root { color-scheme: light }
  body { font: 11pt/1.55 Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 0 }
  h1 { font-size: 20pt; margin: 0 0 .6em; page-break-after: avoid }
  h2 { font-size: 14pt; margin: 1.6em 0 .5em; padding-bottom: .2em;
       border-bottom: 1px solid #ddd; page-break-after: avoid }
  h3 { font-size: 12pt; margin: 1.2em 0 .4em; page-break-after: avoid }
  p, li { orphans: 2; widows: 2 }
  code, pre { font-family: "DejaVu Sans Mono", Menlo, monospace; font-size: 9pt }
  pre { background: #f6f5f2; padding: 10px 12px; border-radius: 4px;
        white-space: pre-wrap; word-break: break-word; page-break-inside: avoid }
  code { background: #f1efea; padding: .1em .3em; border-radius: 3px }
  pre code { background: none; padding: 0 }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt;
          margin: .8em 0; page-break-inside: avoid }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top }
  th { background: #f3f1ec }
  blockquote { margin: .8em 0; padding-left: 12px; border-left: 3px solid #c9c4b8; color: #444 }
  hr { border: 0; border-top: 1px solid #ddd; margin: 1.5em 0 }
  a { color: #1a1a1a; text-decoration: underline }
</style></head><body>${body}</body></html>`

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({
  path: TARGET,
  format: 'A4',
  margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '16mm' },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font:8pt Georgia,serif;color:#888;'
    + 'padding:0 16mm;text-align:right"><span class="pageNumber"></span>'
    + ' / <span class="totalPages"></span></div>',
})
await browser.close()
const size = fs.statSync(TARGET).size
console.log(`готово: ${TARGET} (${(size / 1024).toFixed(0)} КБ)`)
