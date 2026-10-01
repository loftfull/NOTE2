// Добавление файлов на реальных примерах — через тот путь, которым идёт
// пользователь: «Добавить» → «Документ» в листе быстрого добавления.
// Файлы сделаны настоящими генераторами (docx 9.7.2, exceljs 4.4.0,
// pptxgenjs 4.0.1, pdfkit 0.20.2) и по спецификациям ODF/EPUB/PNG.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { serve } from './serve.mjs'

// Путь к браузеру: переменная NOTE2_CHROMIUM, иначе предустановленный
// Chromium этого контейнера, иначе — тот, что найдёт Playwright сам.
const EXECUTABLE = process.env.NOTE2_CHROMIUM
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)
const LAUNCH = EXECUTABLE ? { executablePath: EXECUTABLE } : {}


const [ROOT = 'dist', FIXTURES = 'test/fixtures/files'] = process.argv.slice(2)
const { server, base } = await serve(ROOT)

const browser = await chromium.launch(LAUNCH)
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })

await page.goto(base, { waitUntil: 'load' })
await page.waitForTimeout(1000)
await page.click('button.fab[aria-label="Добавить"]')
await page.waitForTimeout(600)

const all = fs.readdirSync(FIXTURES).sort()
const images = all.filter(f => /\.png$/i.test(f)).map(f => path.join(FIXTURES, f))
const docs = all.filter(f => !/\.png$/i.test(f)).map(f => path.join(FIXTURES, f))
console.log('документов на вход:', docs.length, '| изображений:', images.length)

const inputs = page.locator('.captureSheet input[type=file]')
await inputs.first().waitFor({ state: 'attached', timeout: 5000 })
console.log('accept у выбранного input:', await inputs.nth(3).getAttribute('accept'))

await inputs.nth(3).setInputFiles(docs)
await page.waitForFunction(() => !document.body.innerText.includes('Обрабатываю…'), null, { timeout: 90000 })
await page.waitForTimeout(1200)
const notice1 = (await page.locator('.notice').first().textContent().catch(() => '')).trim()
console.log('сообщение после документов:', notice1 || '(нет)')

// Изображение — своим путём («Фото / скан»), чтобы проверить и его.
await page.click('button.fab[aria-label="Добавить"]')
await page.waitForTimeout(700)
const inputs2 = page.locator('.captureSheet input[type=file]')
await inputs2.first().waitFor({ state: 'attached', timeout: 5000 })
await inputs2.nth(0).setInputFiles(images)
await page.waitForFunction(() => !document.body.innerText.includes('Обрабатываю…'), null, { timeout: 60000 })
await page.waitForTimeout(1200)
const notice2 = (await page.locator('.notice').first().textContent().catch(() => '')).trim()
console.log('сообщение после изображения:', notice2 || '(нет)')

const rows = await page.evaluate(async () => {
  const dbs = await (indexedDB.databases ? indexedDB.databases() : Promise.resolve([]))
  const out = []
  for (const { name } of dbs) {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open(name); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
    })
    for (const store of [...db.objectStoreNames]) {
      if (!/source/i.test(store) || /chunk|vector|embed/i.test(store)) continue
      const items = await new Promise((res, rej) => {
        const q = db.transaction(store).objectStore(store).getAll()
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
      })
      for (const it of items) if (it && it.name) out.push({
        store, name: it.name, kind: it.kind, status: it.status,
        words: it.wordCount ?? null, chars: it.charCount ?? null,
        sections: it.sectionCount ?? (it.sections?.length ?? null),
        pages: it.pageCount ?? null, error: it.error || '',
        head: (it.text || '').replace(/\s+/g, ' ').slice(0, 100),
      })
    }
    db.close()
  }
  return out
})

console.log('\nчто записано в «Источники»:')
const seen = new Map()
for (const r of rows) if (!seen.has(r.name)) seen.set(r.name, r)
for (const name of [...seen.keys()].sort()) {
  const r = seen.get(name)
  console.log(`  ${name.padEnd(22)} kind=${String(r.kind).padEnd(6)} status=${String(r.status).padEnd(15)} слов=${String(r.words).padEnd(5)} секций=${String(r.sections ?? '-').padEnd(4)} стр=${r.pages ?? '-'}`)
  if (r.head) console.log(`      «${r.head}»`)
  if (r.error) console.log(`      ошибка: ${r.error}`)
}
console.log('\nуникальных источников:', seen.size, 'из', all.length, 'файлов')
console.log('ошибки страницы:', errors.length ? errors : 'нет')
if (process.env.NOTE2_E2E_JSON) fs.writeFileSync(process.env.NOTE2_E2E_JSON, JSON.stringify([...seen.values()], null, 2))
await browser.close()
server.close()
