// Прогон настоящего корпуса медиафайлов через то, чем приложение
// определяет и разбирает файл: inferKind и parseLocalFile.
//
// Корпус — файлы из чужих проектов, не сделанные здесь: тестовые наборы
// Pillow, mutagen, python-docx и moviepy. Это единственные настоящие
// медиафайлы, которые удалось получить: общий интернет из этого контейнера
// закрыт (прокси отвечает 403 на CONNECT к любому хосту вне реестров
// пакетов), а registry.npmjs.org и files.pythonhosted.org открыты.
import fs from 'node:fs'
import path from 'node:path'
import { inferKind, parseLocalFile } from '../../src/ingest.js'

const ROOT = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) || 'tools/corpus/files'
const WITH_TYPE = !process.argv.includes('--no-type')

// То, что браузер подставляет в File.type по расширению. Намеренно неполная:
// для части форматов браузер и ОС отдают пустую строку, и это проверяется
// отдельным прогоном с --no-type.
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.ico': 'image/vnd.microsoft.icon',
  '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.wma': '',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const files = []
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else files.push(p)
  }
}
walk(ROOT)
files.sort()

const rows = []
for (const p of files) {
  const ext = path.extname(p).toLowerCase()
  const bytes = fs.readFileSync(p)
  const type = WITH_TYPE ? (MIME[ext] ?? '') : ''
  const file = new File([bytes], path.basename(p), { type })
  const kind = inferKind(file)
  let status = '—', error = '', words = 0
  if (ext !== '.pdf') {              // pdfjs нужен сборщик, см. tools/e2e
    try {
      const s = await parseLocalFile(file)
      status = s.status; error = s.error || ''; words = s.wordCount || 0
    } catch (e) { status = 'ИСКЛЮЧЕНИЕ'; error = String(e && e.message || e) }
  }
  rows.push({ name: path.basename(p), ext, type, size: bytes.length, kind, status, error, words })
}

const by = (list, key) => {
  const m = new Map()
  for (const r of list) {
    const k = key(r)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  }
  return m
}

console.log(`файлов: ${rows.length}   File.type: ${WITH_TYPE ? 'как в браузере' : 'пустой (как часто бывает в Android)'}\n`)
console.log('расширение → вид → статус:')
for (const [ext, list] of [...by(rows, r => r.ext)].sort()) {
  const kinds = [...new Set(list.map(r => r.kind))].join('/')
  const statuses = [...by(list, r => r.status)]
    .map(([s, l]) => `${s}×${l.length}`).join(' ')
  console.log(`  ${ext.padEnd(7)} ${String(list.length).padStart(4)} шт  вид=${kinds.padEnd(8)} ${statuses}`)
}

const broken = rows.filter(r => r.status === 'ИСКЛЮЧЕНИЕ')
console.log(`\nисключений: ${broken.length}`)
for (const r of broken.slice(0, 20)) console.log(`  ${r.name} (${r.ext}, ${r.size} Б): ${r.error}`)

const empty = rows.filter(r => r.status === 'empty')
console.log(`\nпустой результат (status=empty): ${empty.length}`)
for (const r of empty.slice(0, 15)) console.log(`  ${r.name} (${r.ext}, вид ${r.kind})`)

const binary = rows.filter(r => r.kind === 'binary')
console.log(`\nопознаны как «неизвестный двоичный»: ${binary.length}`)
for (const [ext, list] of [...by(binary, r => r.ext)].sort()) console.log(`  ${ext} ×${list.length}`)

const asText = rows.filter(r => r.kind === 'text' && !['.txt','.md','.csv'].includes(r.ext))
console.log(`\nопознаны как текст, хотя расширение не текстовое: ${asText.length}`)
for (const [ext, list] of [...by(asText, r => r.ext)].sort()) console.log(`  ${ext} ×${list.length}  пример: ${list[0].name}`)
