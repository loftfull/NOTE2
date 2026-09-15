// Russian plural forms. The UI previously hard-coded the genitive plural, so
// it read "1 заметок" and "2 заметок" — both wrong. Russian picks between
// three forms by the last digit, with the teens as a special case.
export function pluralRu(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100
  const d = n % 10
  if (n > 10 && n < 20) return many
  if (d > 1 && d < 5) return few
  if (d === 1) return one
  return many
}

export function notesLabel(count) {
  return `${count} ${pluralRu(count, 'заметка', 'заметки', 'заметок')}`
}

export function resultsLabel(count) {
  return `${count} ${pluralRu(count, 'результат', 'результата', 'результатов')}`
}

export function sourcesLabel(count) {
  return `${count} ${pluralRu(count, 'источник', 'источника', 'источников')}`
}
