// Недавние запросы.
//
// Экран поиска был полем и двумя переключателями — он ничего не обещал и
// ничему не учил. Список последних запросов стоит дёшево и отвечает на
// вопрос «что я вообще здесь искал», а повторный поиск — самый частый.
//
// Живёт в localStorage: это удобство одного устройства, а не данные. Любое
// обращение к хранилищу обёрнуто — в приватном окне оно бросает, и поиск не
// должен от этого падать.

const KEY = 'noteai:v3:search-history'
export const HISTORY_LIMIT = 8
const MAX_QUERY_LENGTH = 120

export function loadSearchHistory(storage = safeStorage()) {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => typeof item === 'string' && item.trim()).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

/**
 * Добавляет запрос в начало списка и возвращает новый список.
 *
 * Возвращает то, что нужно показать, а не то, что удалось сохранить: если
 * хранилище недоступно (приватное окно, заблокированные данные сайта),
 * история работает в пределах сеанса и исчезает при перезагрузке. Это лучше,
 * чем список, который на глазах у пользователя не пополняется.
 */
export function rememberSearch(query, storage = safeStorage()) {
  const value = String(query || '').trim().slice(0, MAX_QUERY_LENGTH)
  // Слишком короткие запросы засоряют список и ничего не значат.
  if (value.length < 2) return loadSearchHistory(storage)

  const previous = loadSearchHistory(storage)
  // Сравнение без регистра: «Хлеб» и «хлеб» — один и тот же запрос, и две
  // строки подряд в списке выглядели бы как ошибка.
  const next = [value, ...previous.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, HISTORY_LIMIT)
  write(storage, next)
  return next
}

export function forgetSearch(query, storage = safeStorage()) {
  const value = String(query || '').trim().toLowerCase()
  const next = loadSearchHistory(storage).filter(item => item.toLowerCase() !== value)
  write(storage, next)
  return next
}

export function clearSearchHistory(storage = safeStorage()) {
  write(storage, [])
  return []
}

function write(storage, list) {
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Переполненное или заблокированное хранилище — не повод ломать поиск.
  }
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
