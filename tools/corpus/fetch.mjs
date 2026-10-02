#!/usr/bin/env node
// Скачивает корпус настоящих медиафайлов из тестовых наборов чужих
// проектов на PyPI и распаковывает только сами медиафайлы.
//
// Почему именно PyPI: общий интернет из контейнера закрыт, см. README.
// Ничего не устанавливается и не исполняется — берутся только файлы.
//
// Использование: node tools/corpus/fetch.mjs [куда]

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const OUT = process.argv[2] || 'tools/corpus/files'

// Версии закреплены: корпус должен быть одним и тем же между прогонами.
const PACKAGES = [
  ['pillow', '12.3.0'],
  ['mutagen', '1.48.1'],
  ['python-docx', '1.2.0'],
  ['moviepy', '2.2.1'],
]

const MEDIA = [
  'mp3', 'mp4', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav', 'wma', 'webm', 'mkv', 'mov',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'ico', 'avif', 'svg',
  'pdf', 'docx',
]

const sdistUrl = async (name, version) => {
  const res = await fetch(`https://pypi.org/pypi/${name}/${version}/json`)
  if (!res.ok) throw new Error(`PyPI ответил ${res.status} на ${name} ${version}`)
  const data = await res.json()
  const sdist = data.urls.find(u => u.packagetype === 'sdist')
  if (!sdist) throw new Error(`у ${name} ${version} нет sdist`)
  return sdist.url
}

fs.mkdirSync(OUT, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'note2-corpus-'))

for (const [name, version] of PACKAGES) {
  const url = await sdistUrl(name, version)
  const archive = path.join(tmp, path.basename(new URL(url).pathname))
  process.stdout.write(`${name} ${version}: качаю… `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} на ${url}`)
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  const dir = path.join(OUT, name.replace(/-/g, '_'))
  fs.mkdirSync(dir, { recursive: true })
  // tar сам отбирает нужные расширения: распаковывать десятки мегабайт
  // исходного кода, чтобы потом их удалить, незачем.
  try {
    execFileSync('tar', ['xzf', archive, '-C', dir, '--wildcards',
      ...MEDIA.map(e => `*.${e}`)], { stdio: 'pipe' })
  } catch { /* tar ругается, если какой-то маски нет в архиве — это нормально */ }
  const count = countFiles(dir)
  console.log(`${count} файлов`)
}

fs.rmSync(tmp, { recursive: true, force: true })

function countFiles(dir) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1
  }
  return n
}

console.log(`\nготово: ${OUT} (${countFiles(OUT)} файлов)`)
console.log('дальше: node tools/corpus/probe.mjs && node tools/corpus/probe.mjs --no-type')
