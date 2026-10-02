#!/usr/bin/env node
// Снимок состояния проекта в машиночитаемом виде.
//
// Нужен для передачи работы другой модели или другому человеку: цифры в
// документе стареют, а этот скрипт можно перезапустить и получить текущие.
// Ничего не выдумывает — всё собирается из репозитория и из прогона тестов.
//
// Использование:
//   node tools/handoff/collect.mjs            # вывести JSON
//   node tools/handoff/collect.mjs --save     # записать в docs/handoff-state.json
//   node tools/handoff/collect.mjs --no-tests # без прогона тестов (быстро)

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const withTests = !process.argv.includes('--no-tests')

const run = (cmd, args) => {
  try { return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}

const countLines = file => {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length }
  catch { return 0 }
}

const walk = (dir, filter) => {
  const out = []
  const visit = d => {
    let entries
    try { entries = fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const rel = path.join(d, e.name)
      if (e.isDirectory()) { if (!/node_modules|\.git|dist|files$/.test(e.name)) visit(rel) }
      else if (filter(rel)) out.push(rel)
    }
  }
  visit(dir)
  return out.sort()
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// ── Тесты ───────────────────────────────────────────────────────────────
let tests = { ran: false }
if (withTests) {
  const output = (() => {
    try { return execFileSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch (e) { return String(e.stdout || '') }
  })()
  const read = name => Number((new RegExp(`^# ${name} (\\d+)`, 'm').exec(output) || [])[1] || 0)
  tests = { ran: true, total: read('tests'), pass: read('pass'), fail: read('fail') }
  tests.files = walk('test', f => f.endsWith('.test.mjs')).length
}

// ── Сборка ──────────────────────────────────────────────────────────────
const buildOk = (() => {
  try { execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' }); return true }
  catch { return false }
})()

const sourceFiles = file => /\.(js|jsx|mjs|css)$/.test(file)

const inventory = dir => {
  const files = walk(dir, sourceFiles)
  return {
    files: files.length,
    lines: files.reduce((n, f) => n + countLines(f), 0),
    largest: files
      .map(f => ({ file: f, lines: countLines(f) }))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 12),
  }
}

const state = {
  snapshotAt: new Date().toISOString(),
  project: { name: pkg.name, version: pkg.version, type: pkg.type },
  git: {
    branch: run('git', ['branch', '--show-current']),
    head: run('git', ['rev-parse', '--short', 'HEAD']),
    headSubject: run('git', ['log', '-1', '--format=%s']),
    clean: run('git', ['status', '--porcelain']) === '',
    commitsOnBranch: Number(run('git', ['rev-list', '--count', 'HEAD']) || 0),
  },
  runtime: { node: process.version },
  dependencies: pkg.dependencies,
  devDependencies: pkg.devDependencies,
  scripts: pkg.scripts,
  tests,
  build: { ok: buildOk },
  code: { client: inventory('src'), server: inventory('server'), tools: inventory('tools') },
  storage: {
    localStorage: ['noteai:v3:workspace', 'noteai:v3:settings'],
    indexedDb: {
      name: 'noteai-sources',
      version: 3,
      stores: ['sources', 'chunks', 'offlineAssets', 'jobs'],
      note: 'схему менять только с миграцией — правило владельца',
    },
  },
  fixtures: {
    // Каталог files намеренно исключён из walk (там двоичные файлы),
    // поэтому читается напрямую.
    own: (() => {
      try { return fs.readdirSync(path.join(ROOT, 'test/fixtures/files')).length }
      catch { return 0 }
    })(),
    ownBytes: (() => {
      try {
        const dir = path.join(ROOT, 'test/fixtures/files')
        return fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0)
      } catch { return 0 }
    })(),
    corpus: 'не в репозитории; node tools/corpus/fetch.mjs — 902 файла из наборов Pillow, mutagen, python-docx, moviepy',
  },
  docs: walk('docs', f => f.endsWith('.md')),
  knownGaps: [
    'APK не собирается в контейнере: Gradle-плагин тянется с dl.google.com, прокси отвечает 403',
    'AVIF: размер кадра не читается (нужен обход боксов ISO BMFF)',
    'WMA/ASF и голый ADTS-поток AAC: длительность не читается',
    'AI не проверен на живой модели: адреса провайдеров закрыты сетью',
  ],
}

const json = JSON.stringify(state, null, 2)
if (process.argv.includes('--save')) {
  fs.writeFileSync(path.join(ROOT, 'docs/handoff-state.json'), json + '\n')
  console.log('записано: docs/handoff-state.json')
  console.log(`тесты ${tests.pass}/${tests.total}, сборка ${buildOk ? 'проходит' : 'НЕ проходит'}`)
} else {
  console.log(json)
}
