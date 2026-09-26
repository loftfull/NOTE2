// tools/publish-preview/prepare.mjs готовит копию dist/ для публикации
// онлайн-просмотра. Ошибка здесь не ломает приложение, но ломает публикацию
// или, хуже, молча меняет поведение бандла — поэтому проверяется и то, что
// экранирование выполнено, и то, что больше ничего не изменилось.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)
const SCRIPT = new URL('../tools/publish-preview/prepare.mjs', import.meta.url).pathname

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pubprep-'))

const fixture = () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'assets'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>')
  fs.writeFileSync(path.join(dir, 'assets/app.js'), 'export const bad = `\uFFFD`; export const ok = "тест"\n')
  fs.writeFileSync(path.join(dir, 'assets/app.js.map'), '{"version":3}')
  fs.writeFileSync(path.join(dir, 'assets/style.css'), 'body { color: red }')
  return dir
}

test('заменяет литерал U+FFFD на escape и не трогает остальной текст', async () => {
  const src = fixture(); const out = path.join(tmp(), 'out')
  await run('node', [SCRIPT, src, out])
  const js = fs.readFileSync(path.join(out, 'assets/app.js'), 'utf8')
  assert.ok(!js.includes('\uFFFD'), 'литерал должен исчезнуть')
  assert.ok(js.includes('\\uFFFD'), 'на его месте должен быть escape')
  assert.ok(js.includes('"тест"'), 'другие не-ASCII символы остаются как есть')
})

test('escape даёт тот же символ во время выполнения', async () => {
  const src = fixture(); const out = path.join(tmp(), 'out')
  await run('node', [SCRIPT, src, out])
  const mod = path.join(out, 'assets', 'app.mjs')
  fs.copyFileSync(path.join(out, 'assets/app.js'), mod)
  const { bad } = await import(`file://${mod}`)
  assert.equal(bad, '\uFFFD')
})

test('не публикует карты кода', async () => {
  const src = fixture(); const out = path.join(tmp(), 'out')
  await run('node', [SCRIPT, src, out])
  assert.ok(fs.existsSync(path.join(out, 'assets/style.css')))
  assert.equal(fs.existsSync(path.join(out, 'assets/app.js.map')), false)
})

test('отказывается работать, если сборки нет', async () => {
  const src = tmp(); const out = path.join(tmp(), 'out')
  await assert.rejects(run('node', [SCRIPT, src, out]), err => {
    assert.equal(err.code, 2)
    assert.match(err.stderr, /сначала npm run build/)
    return true
  })
})

test('очищает каталог назначения от прошлой публикации', async () => {
  const src = fixture(); const out = path.join(tmp(), 'out')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'stale.js'), 'старьё')
  await run('node', [SCRIPT, src, out])
  assert.equal(fs.existsSync(path.join(out, 'stale.js')), false)
})
