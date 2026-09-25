import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDER_ORDER, correctedFilter, visibleSourceFilters } from '../src/source-filters.js'

const src = provider => ({ provider })

test('пустая библиотека — ни одного фильтра', () => {
  // Шесть фильтров над нулём источников обещают то, чего нет.
  assert.deepEqual(visibleSourceFilters([]), [])
  assert.deepEqual(visibleSourceFilters(null), [])
})

test('одна категория — выбора нет, ряд не показываем', () => {
  // «Все» и «Документ» дали бы один и тот же список.
  assert.deepEqual(visibleSourceFilters([src('document'), src('document')]), [])
})

test('две и больше категорий — показываем «Все» и их', () => {
  assert.deepEqual(
    visibleSourceFilters([src('document'), src('youtube')]),
    ['all', 'youtube', 'document']
  )
})

test('порядок фильтров постоянный, а не по порядку добавления', () => {
  // Иначе ряд перестраивается при каждом импорте и по нему нельзя целиться.
  const a = visibleSourceFilters([src('media'), src('instagram'), src('web')])
  const b = visibleSourceFilters([src('web'), src('media'), src('instagram')])
  assert.deepEqual(a, b)
  assert.deepEqual(a, ['all', 'instagram', 'web', 'media'])
})

test('неизвестный провайдер не попадает в фильтры', () => {
  // Порядок задаёт белый список: новый тип источника должен быть добавлен в
  // него осознанно, а не появиться в интерфейсе сам.
  assert.deepEqual(visibleSourceFilters([src('document'), src('квантовый')]), [])
  assert.deepEqual(visibleSourceFilters([src('document'), src('web'), src('квантовый')]), ['all', 'web', 'document'])
})

test('источники без провайдера игнорируются', () => {
  assert.deepEqual(visibleSourceFilters([src(''), src(null), src(undefined)]), [])
})

test('провайдер берётся переданной функцией', () => {
  const sources = [{ kind: 'youtube' }, { kind: 'web' }]
  assert.deepEqual(visibleSourceFilters(sources, s => s.kind), ['all', 'youtube', 'web'])
})

test('исчезнувший фильтр сбрасывается на «Все»', () => {
  // Удалили последнее видео — выбранный «YouTube» показал бы пустой список
  // без объяснения.
  assert.equal(correctedFilter('youtube', ['all', 'web', 'document']), 'all')
  assert.equal(correctedFilter('web', ['all', 'web', 'document']), 'web')
  assert.equal(correctedFilter('web', []), 'all')
})

test('порядок провайдеров — белый список без повторов', () => {
  assert.equal(new Set(PROVIDER_ORDER).size, PROVIDER_ORDER.length)
})
