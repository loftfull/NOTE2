// Regression tests for Russian plural forms.
//
// The UI hard-coded the genitive plural everywhere, so a single note read
// "1 заметок" and two read "2 заметок". Russian selects between three forms by
// the last digit, except in the teens, where the genitive always wins.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notesLabel, pluralRu } from '../src/plural.js'

test('picks the nominative singular for 1 and anything ending in 1', () => {
  for (const n of [1, 21, 101, 1031]) {
    assert.equal(pluralRu(n, 'заметка', 'заметки', 'заметок'), 'заметка', `n=${n}`)
  }
})

test('picks the few form for 2-4 and anything ending in 2-4', () => {
  for (const n of [2, 3, 4, 22, 33, 44, 104]) {
    assert.equal(pluralRu(n, 'заметка', 'заметки', 'заметок'), 'заметки', `n=${n}`)
  }
})

test('picks the many form for 0, 5-9 and anything ending in them', () => {
  for (const n of [0, 5, 9, 10, 25, 100]) {
    assert.equal(pluralRu(n, 'заметка', 'заметки', 'заметок'), 'заметок', `n=${n}`)
  }
})

test('the teens always take the many form, whatever the last digit', () => {
  // 11, 12 and 14 end in 1, 2 and 4 but are not singular or few in Russian.
  for (const n of [11, 12, 13, 14, 15, 19, 111, 112, 114]) {
    assert.equal(pluralRu(n, 'заметка', 'заметки', 'заметок'), 'заметок', `n=${n}`)
  }
})

test('notesLabel renders the count with the right form', () => {
  assert.equal(notesLabel(0), '0 заметок')
  assert.equal(notesLabel(1), '1 заметка')
  assert.equal(notesLabel(2), '2 заметки')
  assert.equal(notesLabel(5), '5 заметок')
  assert.equal(notesLabel(11), '11 заметок')
  assert.equal(notesLabel(21), '21 заметка')
})

test('non-numeric and negative counts do not throw', () => {
  assert.equal(pluralRu(undefined, 'a', 'b', 'c'), 'c')
  assert.equal(pluralRu(NaN, 'a', 'b', 'c'), 'c')
  assert.equal(pluralRu(-1, 'a', 'b', 'c'), 'a')
})
