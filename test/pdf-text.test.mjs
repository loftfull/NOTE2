import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinTextItems } from '../src/pdf-text.js'

const item = (str, hasEOL = false) => ({ str, hasEOL })

test('элементы одной строки склеиваются через пробел', () => {
  assert.equal(joinTextItems([item('Рецепт'), item('хлеба'), item('на закваске', true)]), 'Рецепт хлеба на закваске')
})

test('hasEOL завершает строку', () => {
  assert.equal(
    joinTextItems([item('Первая', true), item('Вторая', true)]),
    'Первая\nВторая'
  )
})

test('перед знаком препинания пробел не ставится', () => {
  // pdfjs часто отдаёт запятую отдельным элементом. Наивная склейка даёт
  // «Мука , вода» — текст выглядит сломанным и хуже ищется.
  for (const mark of [',', '.', ';', ':', '!', '?', '%', ')', ']', '}']) {
    assert.equal(joinTextItems([item('Мука'), item(mark, true)]), `Мука${mark}`, mark)
  }
})

test('после открывающей скобки и слэша пробел не ставится', () => {
  assert.equal(joinTextItems([item('('), item('уточнение'), item(')', true)]), '(уточнение)')
  assert.equal(joinTextItems([item('км/'), item('ч', true)]), 'км/ч')
})

test('пустые и пробельные элементы не создают лишних пробелов', () => {
  assert.equal(joinTextItems([item('Текст'), item('   '), item('дальше', true)]), 'Текст дальше')
  assert.equal(joinTextItems([item(''), item(null), item('Слово', true)]), 'Слово')
})

test('пустой элемент с hasEOL закрывает строку', () => {
  assert.equal(joinTextItems([item('Строка'), item('  ', true), item('Вторая', true)]), 'Строка\nВторая')
})

test('внутренние переводы строк в элементе схлопываются', () => {
  assert.equal(joinTextItems([item('много\n\n  пробелов', true)]), 'много пробелов')
})

test('три и больше пустых строк подряд сводятся к одной пустой', () => {
  const items = [item('А', true), item('', true), item('', true), item('', true), item('Б', true)]
  assert.equal(joinTextItems(items), 'А\nБ')
})

test('последняя строка без hasEOL не теряется', () => {
  // Последний элемент страницы часто приходит без флага конца строки.
  assert.equal(joinTextItems([item('Первая', true), item('Хвост')]), 'Первая\nХвост')
})

test('пустой ввод даёт пустую строку, а не падение', () => {
  assert.equal(joinTextItems([]), '')
  assert.equal(joinTextItems(), '')
  assert.equal(joinTextItems([null, undefined, {}]), '')
})

test('элементы без строкового str пропускаются', () => {
  assert.equal(joinTextItems([item('Да'), { str: 42 }, item('нет', true)]), 'Да нет')
})
