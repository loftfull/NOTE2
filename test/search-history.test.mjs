import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HISTORY_LIMIT, clearSearchHistory, forgetSearch, loadSearchHistory, rememberSearch } from '../src/search-history.js'

/** A localStorage stand-in, optionally one that throws like a private window. */
function fakeStorage({ throwing = false } = {}) {
  const map = new Map()
  return {
    getItem: key => { if (throwing) throw new Error('blocked'); return map.has(key) ? map.get(key) : null },
    setItem: (key, value) => { if (throwing) throw new Error('blocked'); map.set(key, value) },
    removeItem: key => map.delete(key)
  }
}

test('a remembered query comes back first', () => {
  const storage = fakeStorage()
  rememberSearch('рецепт хлеба', storage)
  rememberSearch('идея приложения', storage)
  assert.deepEqual(loadSearchHistory(storage), ['идея приложения', 'рецепт хлеба'])
})

test('repeating a query moves it up instead of duplicating it', () => {
  const storage = fakeStorage()
  rememberSearch('первый', storage)
  rememberSearch('второй', storage)
  rememberSearch('первый', storage)
  assert.deepEqual(loadSearchHistory(storage), ['первый', 'второй'])
})

test('case and surrounding space do not make a second entry', () => {
  const storage = fakeStorage()
  rememberSearch('Хлеб', storage)
  rememberSearch('  хлеб  ', storage)
  assert.deepEqual(loadSearchHistory(storage), ['хлеб'], 'one entry, with the latest spelling')
})

test('the list is capped', () => {
  const storage = fakeStorage()
  for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) rememberSearch(`запрос ${i}`, storage)
  const history = loadSearchHistory(storage)
  assert.equal(history.length, HISTORY_LIMIT)
  assert.equal(history[0], `запрос ${HISTORY_LIMIT + 4}`, 'newest first')
})

test('a one-character query is not remembered', () => {
  const storage = fakeStorage()
  rememberSearch('a', storage)
  rememberSearch('', storage)
  rememberSearch('   ', storage)
  assert.deepEqual(loadSearchHistory(storage), [])
})

test('forget removes one entry, clear removes all', () => {
  const storage = fakeStorage()
  rememberSearch('один', storage); rememberSearch('два', storage)
  assert.deepEqual(forgetSearch('один', storage), ['два'])
  assert.deepEqual(clearSearchHistory(storage), [])
  assert.deepEqual(loadSearchHistory(storage), [])
})

test('storage that throws is survivable, not fatal', () => {
  // A private window, or blocked site data. Search must still work, and the
  // caller still gets a list to render — it just will not survive a reload.
  const storage = fakeStorage({ throwing: true })
  assert.deepEqual(loadSearchHistory(storage), [])
  assert.doesNotThrow(() => rememberSearch('запрос', storage))
  assert.deepEqual(rememberSearch('запрос', storage), ['запрос'], 'returns what to show, not what was saved')
  assert.deepEqual(loadSearchHistory(storage), [], 'and nothing was in fact saved')
})

test('corrupt stored data reads as empty rather than throwing', () => {
  const storage = fakeStorage()
  storage.setItem('noteai:v3:search-history', 'not json')
  assert.deepEqual(loadSearchHistory(storage), [])
  storage.setItem('noteai:v3:search-history', '{"not":"an array"}')
  assert.deepEqual(loadSearchHistory(storage), [])
  storage.setItem('noteai:v3:search-history', '[1, null, "годный", {}]')
  assert.deepEqual(loadSearchHistory(storage), ['годный'], 'non-strings are dropped')
})

test('no storage at all is handled', () => {
  assert.deepEqual(loadSearchHistory(null), [])
  assert.deepEqual(rememberSearch('запрос', null), ['запрос'], 'session-only history still renders')
})
