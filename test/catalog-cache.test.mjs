import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STALE_AFTER_MS, forgetCatalog, freshnessLabel, isStale, loadCatalog, saveCatalog } from '../src/catalog-cache.js'

function fakeStorage({ throwing = false } = {}) {
  const map = new Map()
  return {
    getItem: k => { if (throwing) throw new Error('blocked'); return map.has(k) ? map.get(k) : null },
    setItem: (k, v) => { if (throwing) throw new Error('blocked'); map.set(k, v) },
    removeItem: k => { if (throwing) throw new Error('blocked'); map.delete(k) },
    get size() { return map.size }
  }
}

const entries = [{ id: 'a/b', name: 'Модель', free: true }]

test('каталог переживает перезагрузку', () => {
  const s = fakeStorage()
  saveCatalog('https://openrouter.ai/api/v1', entries, s, 1000)
  const loaded = loadCatalog('https://openrouter.ai/api/v1', s)
  assert.deepEqual(loaded.entries, entries)
  assert.equal(loaded.fetchedAt, 1000)
})

test('каталоги разных провайдеров не смешиваются', () => {
  // У OpenRouter и Ollama разные модели; общий ключ показал бы чужие.
  const s = fakeStorage()
  saveCatalog('https://openrouter.ai/api/v1', [{ id: 'внешняя' }], s)
  saveCatalog('http://localhost:11434/v1', [{ id: 'локальная' }], s)
  assert.deepEqual(loadCatalog('https://openrouter.ai/api/v1', s).entries.map(e => e.id), ['внешняя'])
  assert.deepEqual(loadCatalog('http://localhost:11434/v1', s).entries.map(e => e.id), ['локальная'])
})

test('хвостовой слэш и регистр не создают второй ключ', () => {
  const s = fakeStorage()
  saveCatalog('https://OpenRouter.ai/api/v1/', entries, s)
  assert.ok(loadCatalog('https://openrouter.ai/api/v1', s), 'тот же провайдер — тот же каталог')
  assert.equal(s.size, 1)
})

test('пустое и испорченное читается как «нет каталога»', () => {
  const s = fakeStorage()
  assert.equal(loadCatalog('https://x/v1', s), null)
  s.setItem('noteai:v3:catalog:https://x/v1', 'не json')
  assert.equal(loadCatalog('https://x/v1', s), null)
  s.setItem('noteai:v3:catalog:https://x/v1', '{"entries":"не массив"}')
  assert.equal(loadCatalog('https://x/v1', s), null)
})

test('недоступное хранилище не ломает выбор модели', () => {
  // Приватное окно: каталог просто не переживёт перезагрузку.
  const s = fakeStorage({ throwing: true })
  assert.equal(loadCatalog('https://x/v1', s), null)
  assert.doesNotThrow(() => saveCatalog('https://x/v1', entries, s))
  assert.doesNotThrow(() => forgetCatalog('https://x/v1', s))
  assert.deepEqual(saveCatalog('https://x/v1', entries, s).entries, entries, 'вернули то, что показать')
})

test('без хранилища вовсе тоже работает', () => {
  assert.equal(loadCatalog('https://x/v1', null), null)
  assert.deepEqual(saveCatalog('https://x/v1', entries, null).entries, entries)
})

test('устаревание считается от даты загрузки', () => {
  const now = 10 * STALE_AFTER_MS
  assert.equal(isStale(null, now), true, 'не загружали — считаем устаревшим')
  assert.equal(isStale({ fetchedAt: now }, now), false)
  assert.equal(isStale({ fetchedAt: now - STALE_AFTER_MS + 1000 }, now), false)
  assert.equal(isStale({ fetchedAt: now - STALE_AFTER_MS - 1000 }, now), true)
})

test('возраст списка написан по-русски', () => {
  const day = 86_400_000
  const now = 1_000 * day
  assert.equal(freshnessLabel(null, now), 'список не загружен')
  assert.equal(freshnessLabel({ fetchedAt: now }, now), 'список загружен сегодня')
  assert.equal(freshnessLabel({ fetchedAt: now - day }, now), 'список загружен вчера')
  assert.equal(freshnessLabel({ fetchedAt: now - 3 * day }, now), 'список загружен 3 дня назад')
  assert.equal(freshnessLabel({ fetchedAt: now - 10 * day }, now), 'список загружен 10 дней назад')
  assert.equal(freshnessLabel({ fetchedAt: now - 30 * day }, now), 'список загружен месяц назад')
  assert.equal(freshnessLabel({ fetchedAt: now - 90 * day }, now), 'список загружен 3 мес. назад')
})

test('забытый каталог действительно забыт', () => {
  const s = fakeStorage()
  saveCatalog('https://x/v1', entries, s)
  forgetCatalog('https://x/v1', s)
  assert.equal(loadCatalog('https://x/v1', s), null)
})
