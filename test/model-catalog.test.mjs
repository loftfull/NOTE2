import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextLabel, normalizeCatalogEntry, parseCatalog, priceLabel, priceRank, rankCatalog } from '../src/model-catalog.js'

// --- бесплатность не угадывается -------------------------------------------

test('бесплатно — только когда обе цены заявлены нулевыми', () => {
  const free = normalizeCatalogEntry({ id: 'a/b', pricing: { prompt: '0', completion: '0' } })
  assert.equal(free.free, true)
})

test('одна нулевая цена ещё не бесплатно', () => {
  // Вход бесплатный, выход платный — так бывает, и назвать это бесплатным
  // значит однажды выставить пользователю счёт.
  const half = normalizeCatalogEntry({ id: 'a/b', pricing: { prompt: '0', completion: '0.0000012' } })
  assert.equal(half.free, false)
})

test('без цены — «неизвестно», а не «бесплатно» и не «платно»', () => {
  assert.equal(normalizeCatalogEntry({ id: 'a/b' }).free, null)
  assert.equal(normalizeCatalogEntry({ id: 'a/b', pricing: {} }).free, null)
  assert.equal(normalizeCatalogEntry({ id: 'a/b', pricing: { prompt: '' } }).free, null)
})

test('суффикс :free — подсказка для порядка, а не основание', () => {
  // Соглашение OpenRouter, а не гарантия провайдера.
  const hinted = normalizeCatalogEntry({ id: 'deepseek/deepseek-r1:free' })
  assert.equal(hinted.freeHint, true)
  assert.equal(hinted.free, null, 'без цены в ответе бесплатной её никто не называет')

  // И если цена всё же пришла — решает она, а не название.
  const lying = normalizeCatalogEntry({ id: 'x/y:free', pricing: { prompt: '0.000002', completion: '0.000004' } })
  assert.equal(lying.free, false, 'цена главнее названия')
})

test('нечисловая цена читается как неизвестная', () => {
  assert.equal(normalizeCatalogEntry({ id: 'a/b', pricing: { prompt: 'бесплатно', completion: '0' } }).free, null)
})

// --- разбор ответа ----------------------------------------------------------

test('понимает и богатый ответ, и простой список идентификаторов', () => {
  const rich = parseCatalog({ data: [{ id: 'a/b', name: 'Модель', context_length: 128000, pricing: { prompt: '0', completion: '0' } }] })
  assert.equal(rich.length, 1)
  assert.equal(rich[0].name, 'Модель')
  assert.equal(rich[0].contextLength, 128000)

  // Обычный OpenAI-совместимый /models отдаёт только id.
  const plain = parseCatalog({ data: [{ id: 'llama3' }, { id: 'qwen' }] })
  assert.deepEqual(plain.map(e => e.id), ['llama3', 'qwen'])
  assert.equal(plain[0].free, null, 'у простого списка цена неизвестна')
})

test('пустое, мусорное и дублирующее не ломают разбор', () => {
  assert.deepEqual(parseCatalog(null), [])
  assert.deepEqual(parseCatalog({}), [])
  assert.deepEqual(parseCatalog({ data: 'не массив' }), [])
  assert.deepEqual(parseCatalog({ data: [null, {}, { id: '' }, { id: '  ' }] }), [])
  assert.equal(parseCatalog({ data: [{ id: 'a' }, { id: 'a' }] }).length, 1, 'дубликаты схлопываются')
})

test('контекст берётся из любого из известных полей', () => {
  assert.equal(normalizeCatalogEntry({ id: 'a', context_length: 8192 }).contextLength, 8192)
  assert.equal(normalizeCatalogEntry({ id: 'a', contextLength: 4096 }).contextLength, 4096)
  assert.equal(normalizeCatalogEntry({ id: 'a', top_provider: { context_length: 200000 } }).contextLength, 200000)
  assert.equal(normalizeCatalogEntry({ id: 'a', context_length: 0 }).contextLength, null)
  assert.equal(normalizeCatalogEntry({ id: 'a', context_length: 'много' }).contextLength, null)
})

test('поддержка изображений — из модальностей, иначе неизвестно', () => {
  assert.equal(normalizeCatalogEntry({ id: 'a', architecture: { input_modalities: ['text', 'image'] } }).vision, true)
  assert.equal(normalizeCatalogEntry({ id: 'a', architecture: { input_modalities: ['text'] } }).vision, false)
  assert.equal(normalizeCatalogEntry({ id: 'a' }).vision, null)
})

// --- порядок показа ---------------------------------------------------------

const entry = (id, over = {}) => ({ ...normalizeCatalogEntry({ id }), ...over })

test('сначала подтверждённо бесплатные, потом вероятные, потом неизвестные, потом платные', () => {
  const list = [
    entry('платная', { free: false, pricePrompt: '0.000003' }),
    entry('неизвестная'),
    entry('вероятная:free'),
    entry('бесплатная', { free: true })
  ]
  assert.deepEqual(rankCatalog(list).map(e => e.id), ['бесплатная', 'вероятная:free', 'неизвестная', 'платная'])
})

test('внутри группы длинный контекст раньше', () => {
  const list = [
    entry('малый', { free: true, contextLength: 8000 }),
    entry('большой', { free: true, contextLength: 200000 })
  ]
  assert.deepEqual(rankCatalog(list).map(e => e.id), ['большой', 'малый'])
})

test('поиск идёт и по идентификатору, и по названию', () => {
  const list = [
    { ...entry('meta-llama/llama-3.3-70b'), name: 'Llama 3.3 70B' },
    { ...entry('deepseek/deepseek-r1'), name: 'DeepSeek R1' }
  ]
  assert.deepEqual(rankCatalog(list, { query: 'llama' }).map(e => e.id), ['meta-llama/llama-3.3-70b'])
  assert.deepEqual(rankCatalog(list, { query: 'DeepSeek' }).map(e => e.id), ['deepseek/deepseek-r1'])
  assert.deepEqual(rankCatalog(list, { query: 'такого нет' }), [])
})

test('фильтр «только бесплатные» пропускает подтверждённые и вероятные', () => {
  const list = [entry('a', { free: true }), entry('b:free'), entry('c'), entry('d', { free: false })]
  assert.deepEqual(rankCatalog(list, { onlyFree: true }).map(e => e.id), ['a', 'b:free'])
})

// --- подписи ----------------------------------------------------------------

test('подпись цены не обещает того, чего нет в данных', () => {
  assert.equal(priceLabel(entry('a', { free: true })), 'бесплатно')
  assert.equal(priceLabel(entry('b:free')), 'вероятно бесплатно')
  assert.equal(priceLabel(entry('c')), 'цена неизвестна')
  assert.equal(priceLabel(entry('d', { free: false, pricePrompt: '0.000003' })), '$3.00 / 1M токенов')
  assert.equal(priceLabel(entry('e', { free: false, pricePrompt: '0.0000001' })), '$0.100 / 1M токенов')
  assert.equal(priceLabel(entry('f', { free: false, pricePrompt: null })), 'платно')
})

test('подпись контекста читается человеком', () => {
  assert.equal(contextLabel(entry('a', { contextLength: 128000 })), '128K контекст')
  assert.equal(contextLabel(entry('a', { contextLength: 1000000 })), '1M контекст')
  assert.equal(contextLabel(entry('a', { contextLength: 1500000 })), '1.5M контекст')
  assert.equal(contextLabel(entry('a', { contextLength: 512 })), '512 контекст')
  assert.equal(contextLabel(entry('a', { contextLength: null })), '')
})

test('priceRank задаёт ровно четыре ступени', () => {
  assert.equal(priceRank(entry('a', { free: true })), 0)
  assert.equal(priceRank(entry('b:free')), 1)
  assert.equal(priceRank(entry('c')), 2)
  assert.equal(priceRank(entry('d', { free: false })), 3)
})
