// Кэш загруженного каталога моделей.
//
// Каталог загружается по кнопке и живёт долго: состав моделей меняется за
// недели, а не за минуты. Без кэша список пропадал бы при каждой
// перезагрузке, и выбрать модель офлайн было бы нельзя.
//
// Вместе с каталогом хранится время загрузки — и оно показывается. Список
// моделей устаревает молча: модель дешевеет, дорожает или исчезает, а
// приложение об этом не узнает. Дата даёт понять, когда список смотрели в
// последний раз, вместо того чтобы выдавать старое за текущее.
//
// Ключ — адрес провайдера: у OpenRouter и Ollama разные каталоги, и путать
// их нельзя.

const PREFIX = 'noteai:v3:catalog:'
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function keyFor(baseUrl) {
  return `${PREFIX}${String(baseUrl || '').trim().toLowerCase().replace(/\/+$/, '')}`
}

/** Каталог и когда он загружен, либо null. */
export function loadCatalog(baseUrl, storage = safeStorage()) {
  if (!storage || !baseUrl) return null
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(baseUrl)) || 'null')
    if (!parsed || !Array.isArray(parsed.entries)) return null
    return { entries: parsed.entries, fetchedAt: Number(parsed.fetchedAt) || 0 }
  } catch {
    return null
  }
}

export function saveCatalog(baseUrl, entries, storage = safeStorage(), now = Date.now()) {
  const record = { entries: Array.isArray(entries) ? entries : [], fetchedAt: now }
  if (!storage || !baseUrl) return record
  try {
    storage.setItem(keyFor(baseUrl), JSON.stringify(record))
  } catch {
    // Переполненное хранилище не повод ломать выбор модели: каталог просто
    // не переживёт перезагрузку.
  }
  return record
}

export function forgetCatalog(baseUrl, storage = safeStorage()) {
  if (!storage || !baseUrl) return
  try { storage.removeItem(keyFor(baseUrl)) } catch { /* см. выше */ }
}

/** Пора ли предложить обновление. */
export function isStale(record, now = Date.now(), staleAfterMs = STALE_AFTER_MS) {
  if (!record?.fetchedAt) return true
  return now - record.fetchedAt > staleAfterMs
}

/** «загружен сегодня» / «загружен 3 дня назад» — по-русски и без секунд. */
export function freshnessLabel(record, now = Date.now()) {
  if (!record?.fetchedAt) return 'список не загружен'
  const days = Math.floor((now - record.fetchedAt) / 86_400_000)
  if (days <= 0) return 'список загружен сегодня'
  if (days === 1) return 'список загружен вчера'
  if (days < 5) return `список загружен ${days} дня назад`
  if (days < 30) return `список загружен ${days} дней назад`
  const months = Math.floor(days / 30)
  return months === 1 ? 'список загружен месяц назад' : `список загружен ${months} мес. назад`
}
