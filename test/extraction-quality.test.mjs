// Оценка качества извлечения показывается на экране импорта («Извлечение
// …· NN%»), поэтому её выводы должны соответствовать тому, что реально
// извлеклось.
//
// Дефект, который закрепляют первые два теста: страницы без текста считались
// по вхождению строки «[No readable text]», которую в этом проекте не
// выставляет никто — grep по src/ и server/ не даёт ни одного места. Ветка
// была мёртвой, и PDF с десятью пустыми страницами из одиннадцати получал
// оценку как у полностью читаемого.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessExtractionQuality } from '../src/extraction-quality.js'

const page = (n, text) => ({ label: `Стр. ${n}`, locator: { page: n }, text })

test('страницы без текста понижают оценку', () => {
  const sections = [page(1, 'Содержательный текст первой страницы, которого достаточно для оценки.'),
                    page(2, ''), page(3, ''), page(4, '')]
  const text = sections.map(s => s.text).filter(Boolean).join('\n\n')
  const full = assessExtractionQuality(text, [sections[0]])
  const partial = assessExtractionQuality(text, sections)
  assert.ok(partial.score < full.score,
    `оценка не упала: ${partial.score} против ${full.score}`)
  assert.equal(partial.metrics.unreadablePages, 3)
})

test('о пустых страницах сказано по-русски и с правильным числом', () => {
  const sections = [page(1, 'Текст, которого достаточно для осмысленной оценки качества.'), page(2, '')]
  const out = assessExtractionQuality(sections[0].text, sections)
  assert.ok(out.warnings.some(w => /1 страница без читаемого текста/.test(w)),
    `предупреждения: ${JSON.stringify(out.warnings)}`)
})

test('формы числительного согласованы', () => {
  const make = n => assessExtractionQuality('Текст, которого достаточно для оценки качества извлечения.',
    [page(0, 'Текст, которого достаточно для оценки качества извлечения.'),
     ...Array.from({ length: n }, (_, i) => page(i + 1, ''))])
  assert.match(make(1).warnings.join(' '), /1 страница без читаемого текста/)
  assert.match(make(2).warnings.join(' '), /2 страницы без читаемого текста/)
  assert.match(make(5).warnings.join(' '), /5 страниц без читаемого текста/)
})

test('полностью пустое извлечение помечено как empty', () => {
  const out = assessExtractionQuality('   ', [])
  assert.equal(out.grade, 'empty')
  assert.equal(out.score, 0)
  assert.match(out.warnings.join(' '), /Текст не извлечён/)
})

test('читаемый текст получает высокую оценку без предупреждений', () => {
  const text = ['Первый абзац отчёта о расходах за квартал.',
                'Второй абзац с выводами и сроками исполнения.'].join('\n\n')
  const out = assessExtractionQuality(text, [page(1, text)])
  assert.equal(out.grade, 'strong')
  assert.deepEqual(out.warnings, [])
})
