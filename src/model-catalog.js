// Каталог моделей провайдера.
//
// Зачем отдельный модуль: listProviderModels() возвращал только
// идентификаторы, выбрасывая всё остальное — цену, длину контекста, название.
// Выбрать «лучшую бесплатную» из голого списка строк нельзя, и приходилось
// вбивать идентификатор руками, зная его заранее.
//
// Главное решение: **список берётся у провайдера, а не зашит в приложение.**
// Состав моделей на OpenRouter и подобных меняется еженедельно — что-то
// становится платным, что-то исчезает, выходят новые версии. Любой список,
// вшитый в сборку, устареет к следующему месяцу и будет врать с уверенным
// видом. Поэтому каталог загружается по кнопке, кэшируется и показывает дату
// загрузки.
//
// Второе решение: **бесплатность не угадывается.** Она либо подтверждена
// ценой в ответе провайдера, либо неизвестна — третьего не дано. Пометить
// модель бесплатной по названию значит однажды выставить пользователю счёт.

/** Цена «ноль» приходит строкой, числом и с разным числом нулей. */
function zeroPrice(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number === 0 : null
}

/**
 * Разбирает одну запись каталога, ничего не додумывая.
 *
 * Схема у провайдеров разная, а у одного и того же меняется со временем.
 * Поэтому: берём то, что есть, и не выдумываем то, чего нет. Отсутствующая
 * цена — это `free: null` («неизвестно»), а не `false` и тем более не `true`.
 */
export function normalizeCatalogEntry(raw) {
  const id = String(raw?.id || raw?.name || '').trim()
  if (!id) return null

  const pricing = raw?.pricing && typeof raw.pricing === 'object' ? raw.pricing : null
  const prompt = pricing ? zeroPrice(pricing.prompt) : null
  const completion = pricing ? zeroPrice(pricing.completion) : null

  // Бесплатно — только когда обе цены заявлены и обе нулевые.
  const free = prompt === null || completion === null ? null : (prompt && completion)

  const context = Number(raw?.context_length ?? raw?.contextLength ?? raw?.top_provider?.context_length)
  const modalities = raw?.architecture?.input_modalities

  return {
    id,
    name: String(raw?.name || id).trim(),
    contextLength: Number.isFinite(context) && context > 0 ? context : null,
    free,
    // Суффикс ':free' — соглашение OpenRouter, а не гарантия. Используется
    // только для порядка показа, когда цены в ответе нет, и никогда — как
    // основание назвать модель бесплатной.
    freeHint: /:free$/i.test(id),
    vision: Array.isArray(modalities) ? modalities.includes('image') : null,
    pricePrompt: pricing?.prompt ?? null,
    priceCompletion: pricing?.completion ?? null
  }
}

/** Разбирает ответ целиком. Понимает и богатый, и простой OpenAI-формат. */
export function parseCatalog(payload) {
  const items = Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.models) ? payload.models
      : Array.isArray(payload) ? payload : []
  const seen = new Set()
  const out = []
  for (const raw of items) {
    const entry = normalizeCatalogEntry(raw)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry)
  }
  return out
}

/** Три состояния цены, в порядке предпочтения при показе. */
export function priceRank(entry) {
  if (entry.free === true) return 0
  if (entry.free === null && entry.freeHint) return 1
  if (entry.free === null) return 2
  return 3
}

/**
 * Порядок показа: подтверждённо бесплатные, затем вероятно бесплатные, затем
 * с неизвестной ценой, затем платные. Внутри группы — длинный контекст
 * раньше, потом по имени.
 */
export function rankCatalog(entries = [], { query = '', onlyFree = false } = {}) {
  const needle = String(query).trim().toLowerCase()
  const filtered = entries.filter(entry => {
    if (onlyFree && priceRank(entry) > 1) return false
    if (!needle) return true
    return entry.id.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle)
  })
  return filtered.sort((a, b) =>
    priceRank(a) - priceRank(b) ||
    (b.contextLength || 0) - (a.contextLength || 0) ||
    a.name.localeCompare(b.name, 'ru')
  )
}

/** Подпись цены для интерфейса — без обещаний, которых нет в данных. */
export function priceLabel(entry) {
  if (entry.free === true) return 'бесплатно'
  if (entry.free === null && entry.freeHint) return 'вероятно бесплатно'
  if (entry.free === null) return 'цена неизвестна'
  const prompt = Number(entry.pricePrompt)
  if (!Number.isFinite(prompt) || prompt <= 0) return 'платно'
  // Цена приходит за один токен; за миллион читается человеком.
  const perMillion = prompt * 1_000_000
  const rounded = perMillion >= 1 ? perMillion.toFixed(2) : perMillion.toFixed(3)
  return `$${rounded} / 1M токенов`
}

/** Длина контекста человеческим языком. */
export function contextLabel(entry) {
  const value = entry.contextLength
  if (!value) return ''
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M контекст`
  if (value >= 1000) return `${Math.round(value / 1000)}K контекст`
  return `${value} контекст`
}
