// Движение проверяется на живой странице: настоящее нажатие мышью, снятый
// computed transform во время нажатия, положение фиксированных элементов
// до и после (ловушка containing block), и поведение при
// prefers-reduced-motion. Каждая цель жмётся на свежей загрузке: нажатие
// на настоящую кнопку уводит с экрана, и следующая цель исчезает.
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

const fresh = async reducedMotion => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForTimeout(1100)
  return { page, errors }
}

const fixedBoxes = page => page.evaluate(() => {
  const r = {}
  for (const sel of ['.fab', '.bottomNav']) {
    const el = document.querySelector(sel)
    if (el) { const b = el.getBoundingClientRect(); r[sel] = `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}` }
  }
  return r
})

const TARGETS = [
  ['кнопка', '.btn'],
  ['плавающая кнопка', 'button.fab'],
  ['быстрое действие', '.quickActionsFlat button'],
  ['пункт навигации', 'nav.bottomNav button:not(.active)'],
  ['карточка-строка', '.continueItem'],
]

for (const mode of ['no-preference', 'reduce']) {
  console.log(`\n═══ prefers-reduced-motion: ${mode} ═══`)
  let errorsAll = []
  for (const [name, sel] of TARGETS) {
    const { page, errors } = await fresh(mode)
    const el = page.locator(sel).first()
    if (!(await el.count())) { console.log(`  ${name}: не найден`); await page.close(); continue }
    const box = await el.boundingBox().catch(() => null)
    if (!box) { console.log(`  ${name}: не виден`); await page.close(); continue }
    const pressed = await el.evaluate(n => n.className?.toString() || '')
    const before = await fixedBoxes(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(90)
    const during = await el.evaluate(n => getComputedStyle(n).transform).catch(() => '—')
    const after = await fixedBoxes(page)
    await page.mouse.up()
    await page.waitForTimeout(80)
    // Сам нажатый элемент сминается — его смещение ожидаемо; ловим только
    // чужие фиксированные элементы, уехавшие из-за containing block.
    const moved = Object.keys(before).filter(k =>
      before[k] !== after[k] && !pressed.includes(k.replace(/^[.#]/, '')))
    console.log(`  ${name.padEnd(18)} нажато: ${during}${moved.length ? `  ✗ сместилось: ${moved.join(', ')}` : ''}`)
    errorsAll.push(...errors)
    await page.close()
  }

  const { page, errors } = await fresh(mode)
  await page.click('nav.bottomNav button[aria-label="Заметки"]')
  await page.waitForTimeout(40)
  console.log('  переход экрана   :', await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.page'))
    return `${st.animationName} ${st.animationDuration} transform=${st.transform} opacity=${Number(st.opacity).toFixed(2)}`
  }))
  await page.waitForTimeout(700)
  console.log('  после перехода   :', await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector('.page'))
    return `transform=${st.transform} opacity=${Number(st.opacity).toFixed(2)}`
  }))
  console.log('  переполнение     :', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'px')
  errorsAll.push(...errors)
  console.log('  ошибки страницы  :', errorsAll.length ? [...new Set(errorsAll)] : 'нет')
  await page.close()
}

await browser.close()
server.close()
