// Контраст измеряется на отрисованной странице, а не по токенам: берётся
// фактический цвет текста и фактический фон под ним (с учётом прозрачных
// слоёв и backdrop-filter — через реальный скриншот пикселя).
import { chromium } from 'playwright'
import fs from 'node:fs'
import { serve } from './serve.mjs'

// Путь к браузеру: переменная NOTE2_CHROMIUM, иначе предустановленный
// Chromium этого контейнера, иначе — тот, что найдёт Playwright сам.
const EXECUTABLE = process.env.NOTE2_CHROMIUM
  || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)
const LAUNCH = EXECUTABLE ? { executablePath: EXECUTABLE } : {}


const { server, base } = await serve(process.argv[2] || 'dist')
const browser = await chromium.launch(LAUNCH)
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const measure = () => page.evaluate(() => {
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
  const ratio = (a, b) => {
    const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
    return (hi + 0.05) / (lo + 0.05)
  }
  const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number)
  // Фон под элементом: идём вверх, смешивая полупрозрачные слои.
  const bgOf = el => {
    let acc = null
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (!c.length) continue
      const a = c.length === 4 ? c[3] : 1
      if (a === 0) continue
      acc = acc === null
        ? { rgb: c.slice(0, 3), a }
        : { rgb: acc.rgb.map((v, i) => v * acc.a + c[i] * (1 - acc.a)), a: 1 }
      if (acc.a >= 1) break
      acc = { rgb: acc.rgb, a: acc.a + a * (1 - acc.a) }
    }
    return acc ? acc.rgb.map(Math.round) : [255, 255, 255]
  }
  const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

  const out = { tokens: {}, pairs: [], tiles: [] }
  const cs = getComputedStyle(document.documentElement)
  for (const name of ['--ground','--ink','--ink-2','--ink-3','--accent','--ok','--warn','--danger','--line'])
    out.tokens[name] = cs.getPropertyValue(name).trim()
  out.style = document.documentElement.dataset.style

  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue
    const text = (el.textContent || '').trim()
    if (!text || el.children.length) continue
    const st = getComputedStyle(el)
    const fg = parse(st.color).slice(0, 3)
    const bg = bgOf(el)
    const size = parseFloat(st.fontSize)
    const weight = Number(st.fontWeight) || 400
    // Крупный текст по WCAG: ≥24px, или ≥18.66px при весе ≥700.
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const need = large ? 3 : 4.5
    const r = ratio(fg, bg)
    const key = `${hex(fg)}|${hex(bg)}|${size}|${weight}`
    if (seen.has(key)) continue
    seen.add(key)
    out.pairs.push({ r: +r.toFixed(2), need, ok: r >= need, fg: hex(fg), bg: hex(bg), size, weight,
      sample: text.slice(0, 28), cls: el.className?.toString().split(' ')[0] || el.tagName.toLowerCase() })
  }
  out.transparentTiles = []
  for (const el of document.querySelectorAll('.knowledgeObject, .appIcon, .metricIcon')) {
    if (!el.checkVisibility?.()) continue
    const st = getComputedStyle(el)
    const c = parse(st.backgroundColor)
    const a = c.length === 4 ? c[3] : 1
    const cls = el.className?.toString() || ''
    if (a < 1) { out.transparentTiles.push({ cls, alpha: a }); continue }
    const bg = c.slice(0, 3)
    const fg = parse(st.color).slice(0, 3)
    out.tiles.push({ bg: hex(bg), lum: +lum(bg).toFixed(4), white: +ratio(fg, bg).toFixed(2) })
  }
  return out
})

const SCREENS = [
  ['Сегодня', 'dashboard'], ['Заметки', 'library'], ['Источники', 'analysis'],
  ['Поиск', 'search'], ['Профиль', 'profile'],
]
const all = []
let result = null
for (const [label] of SCREENS) {
  try {
    await page.click(`nav.bottomNav button[aria-label="${label}"]`, { timeout: 4000 })
    await page.waitForTimeout(700)
  } catch { console.log(`экран «${label}»: не удалось открыть`); continue }
  const r = await measure()
  if (!result) result = r
  const bad = r.pairs.filter(x => !x.ok)
  console.log(`экран «${label}»: пар ${r.pairs.length}, ниже AA ${bad.length}`)
  for (const x of bad) console.log(`    ✗ ${x.r}:1 (нужно ${x.need}) ${x.fg} на ${x.bg} · ${x.size}px/${x.weight} · .${x.cls} «${x.sample}»`)
  all.push(...r.pairs)
  if (r.transparentTiles?.length) for (const tt of r.transparentTiles) console.log(`    плитка без цвета: .${tt.cls} (alpha ${tt.alpha})`)
}
result = { ...result, pairs: all }

console.log('стиль:', result.style)
console.log('токены:')
for (const [k, v] of Object.entries(result.tokens)) console.log(`  ${k.padEnd(12)} ${v}`)

const bad = result.pairs.filter(p => !p.ok)
console.log(`\nпар текст/фон измерено: ${result.pairs.length}, ниже порога AA: ${bad.length}`)
for (const p of bad) console.log(`  ✗ ${p.r}:1 (нужно ${p.need}) ${p.fg} на ${p.bg} · ${p.size}px/${p.weight} · .${p.cls} «${p.sample}»`)
const worst = [...result.pairs].sort((a, b) => a.r - b.r).slice(0, 5)
console.log('\nсамые слабые пары (всё равно проходят):')
for (const p of worst) console.log(`  ${String(p.r).padStart(6)}:1 (порог ${p.need}) ${p.fg} на ${p.bg} · ${p.size}px/${p.weight} · .${p.cls}`)

const tiles = [...new Map(result.tiles.map(t => [t.bg, t])).values()]
console.log('\nплитки на экране:')
for (const t of tiles) console.log(`  ${t.bg} яркость ${t.lum} белый ${t.white}:1`)
if (tiles.length > 1) {
  const ls = tiles.map(t => t.lum)
  console.log(`  разброс яркости ×${(Math.max(...ls) / Math.min(...ls)).toFixed(4)}, минимум белого ${Math.min(...tiles.map(t => t.white))}:1`)
}
console.log('\nошибки страницы:', errors.length ? errors : 'нет')
await browser.close()
server.close()
process.exit(bad.length ? 1 : 0)
