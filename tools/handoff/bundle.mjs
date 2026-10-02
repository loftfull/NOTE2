#!/usr/bin/env node
// Архив для передачи работы: ровно то, что лежит в репозитории.
//
// Собирается через git archive, а не копированием списка каталогов. Так
// надёжнее: первая попытка собрать архив вручную потеряла scripts/ и
// корневые модули sync-core.mjs, instagram-core.mjs и прочие, и в
// распакованном виде падало семь файлов тестов из тридцати двух. git
// archive берёт индекс целиком и забыть ничего не может.
//
// Использование: node tools/handoff/bundle.mjs [куда] [ревизия]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT_DIR = process.argv[2] || '.'
const REV = process.argv[3] || 'HEAD'

const short = execFileSync('git', ['rev-parse', '--short', REV], { encoding: 'utf8' }).trim()
const today = new Date().toISOString().slice(0, 10)
const name = `NOTE2-handoff-${today}`
const archive = path.resolve(OUT_DIR, `${name}.tar.gz`)

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'note2-handoff-'))
try {
  execFileSync('bash', ['-c',
    `git archive --format=tar --prefix=${name}/ ${REV} | tar x -C ${JSON.stringify(staging)}`],
    { stdio: 'inherit' })

  const readme = path.join(staging, name, 'ЧИТАТЬ-ПЕРВЫМ.md')
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(readme, `# Передача работы над NOTE2

Снимок репозитория: ветка \`${branch}\`, коммит \`${short}\`, ${today}.
Собран \`git archive\` — ровно то, что лежит в репозитории, без
\`node_modules\` и без сборки. Актуальный исходник:
\`github.com/loftfull/NOTE2\`.

## Порядок чтения

1. **\`docs/HANDOFF_2026-10-02.md\`** — самодостаточное описание проекта:
   правила владельца, состояние с измеренными цифрами, устройство кода,
   ограничения окружения, команды проверки, закрытые дефекты, что дальше.
2. **\`docs/HANDOFF_PROMPT.md\`** — готовое задание для другой модели.
3. **\`docs/handoff-state.json\`** — то же машиночитаемо; пересобирается
   \`node tools/handoff/collect.mjs --save\`.

## Проверка, что архив рабочий

\`\`\`bash
npm install
npm test          # ожидается 431 тест, 0 падений
npm run build
npm start         # http://localhost:8787, затем GET /api/health
\`\`\`

## Чего в архиве нет

\`node_modules\` и \`dist\` — ставятся и собираются командами выше.
Корпус чужих медиафайлов (902 файла, ~40 МБ) качается
\`node tools/corpus/fetch.mjs\`: он принадлежит чужим проектам со своими
лицензиями.

## Главное в одном абзаце

Приложение работает полностью на устройстве; шлюз нужен только для того,
чего браузер не умеет сам. Ни один внешний сервис не имеет адреса по
умолчанию: ненастроенный маршрут отказывает, а не угадывает. Если модель
недоступна, приложение обязано показать отказ, а не подсунуть локальную
эвристику — правило владельца, закреплённое контрактом
\`{ text, origin, error }\`. Тёмной темы нет и не должно быть.
`, 'utf8')

  execFileSync('tar', ['czf', archive, '-C', staging, name], { stdio: 'inherit' })
  const size = fs.statSync(archive).size
  const files = execFileSync('bash', ['-c', `tar tzf ${JSON.stringify(archive)} | wc -l`], { encoding: 'utf8' }).trim()
  console.log(`готово: ${archive}`)
  console.log(`${files} записей, ${(size / 1024 / 1024).toFixed(2)} МБ`)
  console.log('проверить: распаковать, npm install && npm test && npm run build')
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
