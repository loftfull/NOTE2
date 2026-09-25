// Какие фильтры показывать над библиотекой источников.
//
// Раньше список был захардкожен: «Все, Instagram, YouTube, Веб, Документ,
// Медиа» — шесть категорий независимо от того, что лежит в библиотеке. На
// пустой библиотеке это шесть обещаний, за каждым ноль, причём Instagram
// вообще требует внешнего сборщика. Фильтр по заведомо пустой категории
// ничего не фильтрует и лишь занимает строку.
//
// Правило: показываем только то, что в библиотеке есть, и только когда есть
// между чем выбирать.

/** Порядок важен: категории идут от самых «внешних» к локальным файлам. */
export const PROVIDER_ORDER = ['instagram', 'youtube', 'web', 'document', 'media']

/**
 * Список фильтров для набора источников.
 * Пустой массив означает «фильтровать нечего, ряд не показывать».
 *
 * @param {Array} sources
 * @param {(source:any)=>string} providerOf как определить провайдера источника
 */
export function visibleSourceFilters(sources = [], providerOf = source => source?.provider) {
  const present = new Set()
  for (const source of Array.isArray(sources) ? sources : []) {
    const provider = providerOf(source)
    if (provider) present.add(provider)
  }
  const used = PROVIDER_ORDER.filter(provider => present.has(provider))
  // Одна категория — выбора нет: «Все» и она же дают один и тот же список.
  return used.length > 1 ? ['all', ...used] : []
}

/**
 * Фильтр перестал существовать (последний источник такого типа удалён) —
 * выбор надо вернуть на «Все», иначе список молча покажет пустоту.
 */
export function correctedFilter(current, available) {
  if (!available.length) return 'all'
  return available.includes(current) ? current : 'all'
}
