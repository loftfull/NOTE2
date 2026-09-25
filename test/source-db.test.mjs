// Хранилище источников: миграции схемы и транзакционность.
//
// Почему это важнее обычного: source-db.js — реконструкция по местам вызова,
// а не оригинал (см. INDEPENDENT_AUDIT_2026-09-14.md). Ошибка в миграции не
// показывает себя сообщением — она молча теряет библиотеку пользователя при
// обновлении приложения. До этих тестов слой данных не был покрыт ничем.
//
// indexedDB даёт fake-indexeddb. Модуль кэширует соединение в переменной
// уровня файла, поэтому каждый тест импортирует его заново со строкой
// запроса: так Node отдаёт свежий экземпляр, и продакшн-код не пришлось
// дополнять хуком «сбросить состояние для тестов».

import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const DB_NAME = 'noteai-sources'
let counter = 0

/** Чистая база и свежий экземпляр модуля. */
async function freshDb() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
    request.onblocked = resolve
  })
  return import(`../src/source-db.js?fresh=${counter += 1}`)
}

/** Создаёт базу в старой версии со старой схемой и данными в ней. */
function seedLegacy(version, fill) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'id' })
        const chunks = db.createObjectStore('chunks', { keyPath: ['sourceId', 'index'] })
        chunks.createIndex('bySource', 'sourceId', { unique: false })
      }
      if (version >= 2 && !db.objectStoreNames.contains('offlineAssets')) {
        const assets = db.createObjectStore('offlineAssets', { keyPath: ['sourceId', 'index'] })
        assets.createIndex('bySource', 'sourceId', { unique: false })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['sources', 'chunks'], 'readwrite')
      fill(tx)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

const source = (id, extra = {}) => ({ id, name: `Источник ${id}`, createdAt: Date.now(), status: 'ready', ...extra })
const chunk = (sourceId, index, text) => ({ sourceId, index, text })

// --- миграции ---------------------------------------------------------------

test('чистая установка создаёт все четыре хранилища', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('s1'), [chunk('s1', 0, 'текст')])
  assert.equal((await db.listSources()).length, 1)
  assert.equal((await db.listChunks()).length, 1)
  // jobs и offlineAssets существуют, если обращение к ним не бросает.
  await db.saveJob({ id: 'j1', state: 'queued' })
  assert.equal((await db.getJob('j1')).state, 'queued')
  await db.putOfflineAsset({ sourceId: 's1', index: 0, blob: new Blob(['x']), contentType: 'text/plain', bytes: 1 })
  assert.ok(await db.getOfflineAsset('s1', 0))
})

test('обновление с версии 1 сохраняет источники и фрагменты', async () => {
  // Самый опасный путь: пользователь ставил приложение давно, в базе его
  // библиотека, и обновление обязано её донести.
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = resolve
  })
  await seedLegacy(1, tx => {
    tx.objectStore('sources').put(source('старый', { name: 'Статья 2019 года' }))
    tx.objectStore('chunks').put(chunk('старый', 0, 'фрагмент из прошлой версии'))
  })

  const db = await import(`../src/source-db.js?fresh=${counter += 1}`)
  const sources = await db.listSources()
  assert.equal(sources.length, 1, 'источник пережил обновление')
  assert.equal(sources[0].name, 'Статья 2019 года')

  const chunks = await db.listChunks()
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].text, 'фрагмент из прошлой версии')

  // И новые хранилища теперь есть.
  await db.saveJob({ id: 'j', state: 'queued' })
  assert.ok(await db.getJob('j'))
  await db.putOfflineAsset({ sourceId: 'старый', index: 0, blob: new Blob(['a']), bytes: 1 })
  assert.ok(await db.getOfflineAsset('старый', 0))
})

test('обновление с версии 2 сохраняет данные и добавляет только jobs', async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = resolve
  })
  await seedLegacy(2, tx => {
    tx.objectStore('sources').put(source('s2', { name: 'Видео' }))
    tx.objectStore('chunks').put(chunk('s2', 0, 'расшифровка'))
  })
  const db = await import(`../src/source-db.js?fresh=${counter += 1}`)
  assert.equal((await db.listSources())[0].name, 'Видео')
  assert.equal((await db.listChunks())[0].text, 'расшифровка')
  await db.saveJob({ id: 'j2', state: 'done' })
  assert.equal((await db.listJobs()).length, 1)
})

// --- транзакционность -------------------------------------------------------

test('источник и его фрагменты сохраняются вместе', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('вместе'), [
    chunk('вместе', 0, 'первый'), chunk('вместе', 1, 'второй')
  ])
  assert.equal((await db.listSources()).length, 1)
  assert.equal((await db.listChunks(['вместе'])).length, 2)
})

test('повторное сохранение заменяет фрагменты, а не добавляет их', async () => {
  // Переиндексация источника с меньшим числом фрагментов оставила бы хвост
  // от прошлого разбора, и поиск выдавал бы удалённый текст.
  const db = await freshDb()
  await db.saveSourceWithChunks(source('s'), [chunk('s', 0, 'а'), chunk('s', 1, 'б'), chunk('s', 2, 'в')])
  await db.saveSourceWithChunks(source('s'), [chunk('s', 0, 'новый')])
  const chunks = await db.listChunks(['s'])
  assert.equal(chunks.length, 1, 'старые фрагменты удалены')
  assert.equal(chunks[0].text, 'новый')
})

test('удаление источника убирает его фрагменты и офлайн-файлы', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('a'), [chunk('a', 0, 'текст a')])
  await db.saveSourceWithChunks(source('b'), [chunk('b', 0, 'текст b')])
  await db.putOfflineAsset({ sourceId: 'a', index: 0, blob: new Blob(['x']), bytes: 1 })

  await db.deleteSource('a')
  assert.deepEqual((await db.listSources()).map(s => s.id), ['b'], 'удалён только он')
  assert.equal((await db.listChunks(['a'])).length, 0, 'фрагменты не остались сиротами')
  assert.equal((await db.listChunks(['b'])).length, 1, 'чужие фрагменты не тронуты')
  // getOfflineAsset нормализует отсутствие к null, а не к undefined —
  // вызывающие проверяют результат на истинность, и два разных «ничего»
  // означали бы две ветки там, где нужна одна.
  assert.equal(await db.getOfflineAsset('a', 0), null)
  assert.equal(await db.getOfflineAsset('', 0), null, 'пустой id тоже null, без обращения к базе')
})

test('listChunks с перечнем id возвращает только их фрагменты', async () => {
  const db = await freshDb()
  for (const id of ['x', 'y', 'z']) await db.saveSourceWithChunks(source(id), [chunk(id, 0, `текст ${id}`)])
  const picked = await db.listChunks(['x', 'z'])
  assert.deepEqual(picked.map(c => c.sourceId).sort(), ['x', 'z'])
  assert.deepEqual(await db.listChunks([]), [], 'пустой перечень — пустой ответ, а не вся база')
  await assert.rejects(async () => db.listChunks('x'), TypeError, 'строка вместо массива — ошибка, а не молчаливый обход')
})

test('replaceSourcesWithChunks заменяет библиотеку целиком', async () => {
  // Этим пользуется загрузка из аккаунта: старое состояние должно исчезнуть,
  // иначе после синхронизации остаются заметки, удалённые на другом устройстве.
  const db = await freshDb()
  await db.saveSourceWithChunks(source('старое'), [chunk('старое', 0, 'было')])
  await db.replaceSourcesWithChunks([source('новое')], [chunk('новое', 0, 'стало')])
  assert.deepEqual((await db.listSources()).map(s => s.id), ['новое'])
  const chunks = await db.listChunks()
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].text, 'стало')
})

test('список источников отсортирован, новые сверху', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('старый', { createdAt: 1000 }), [])
  await db.saveSourceWithChunks(source('новый', { createdAt: 9000 }), [])
  await db.saveSourceWithChunks(source('средний', { createdAt: 5000 }), [])
  assert.deepEqual((await db.listSources()).map(s => s.id), ['новый', 'средний', 'старый'])
})

test('обновление метаданных не трогает фрагменты', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('s', { status: 'saved' }), [chunk('s', 0, 'текст')])
  await db.updateSourceMetadata('s', current => ({ ...current, status: 'ready', pageCount: 3 }))
  const [stored] = await db.listSources()
  assert.equal(stored.status, 'ready')
  assert.equal(stored.pageCount, 3)
  assert.equal((await db.listChunks(['s'])).length, 1, 'фрагменты на месте')
})

test('очистка хранилища оставляет базу рабочей', async () => {
  const db = await freshDb()
  await db.saveSourceWithChunks(source('s'), [chunk('s', 0, 'текст')])
  await db.saveJob({ id: 'j', state: 'queued' })
  await db.clearSourceDb()
  assert.deepEqual(await db.listSources(), [])
  assert.deepEqual(await db.listChunks(), [])
  // И в неё снова можно писать.
  await db.saveSourceWithChunks(source('после'), [chunk('после', 0, 'снова')])
  assert.equal((await db.listSources()).length, 1)
})

test('задания переживают запись, чтение и удаление', async () => {
  const db = await freshDb()
  await db.saveJob({ id: 'j1', state: 'queued', progress: 0 })
  await db.saveJob({ id: 'j2', state: 'done', progress: 1 })
  assert.equal((await db.listJobs()).length, 2)
  await db.saveJob({ id: 'j1', state: 'processing', progress: 0.5 })
  assert.equal((await db.getJob('j1')).state, 'processing', 'запись по тому же id обновляет')
  await db.deleteJob('j2')
  assert.equal((await db.listJobs()).length, 1)
})
