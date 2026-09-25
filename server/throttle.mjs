// Ограничение попыток входа.
//
// До этого подбор пароля был ничем не ограничен: сервер честно считал scrypt
// на каждый запрос и отвечал «неверный адрес или пароль» сколько угодно раз.
// scrypt делает перебор дорогим, но не невозможным, а словарь из тысячи
// частых паролей проходится за минуты.
//
// Окно скользящее и в памяти: шлюз однонодовый, а перезапуск, сбрасывающий
// счётчики, — приемлемая цена против зависимости на хранилище ради данных,
// живущих минуты.
//
// Считаются только неудачи. Успешный вход обнуляет счётчик, иначе человек,
// который ошибся дважды и вошёл с третьего раза, оставался бы наказанным.

export const MAX_FAILURES = 8
export const WINDOW_MS = 15 * 60 * 1000
export const BLOCK_MS = 15 * 60 * 1000

export function createThrottle({ maxFailures = MAX_FAILURES, windowMs = WINDOW_MS, blockMs = BLOCK_MS, now = () => Date.now() } = {}) {
  const attempts = new Map()

  function prune(entry, at) {
    entry.failures = entry.failures.filter(time => at - time < windowMs)
    return entry
  }

  return {
    /** Сколько секунд ждать, или 0, если можно пробовать. */
    retryAfter(key) {
      const at = now()
      const entry = attempts.get(key)
      if (!entry) return 0
      if (entry.blockedUntil && entry.blockedUntil > at) return Math.ceil((entry.blockedUntil - at) / 1000)
      prune(entry, at)
      return 0
    },

    /** Записать неудачу. Возвращает секунды блокировки, если порог достигнут. */
    fail(key) {
      const at = now()
      const entry = prune(attempts.get(key) || { failures: [], blockedUntil: 0 }, at)
      entry.failures.push(at)
      if (entry.failures.length >= maxFailures) {
        entry.blockedUntil = at + blockMs
        entry.failures = []
      }
      attempts.set(key, entry)
      return entry.blockedUntil > at ? Math.ceil((entry.blockedUntil - at) / 1000) : 0
    },

    /** Успех снимает накопленные неудачи. */
    succeed(key) {
      attempts.delete(key)
    },

    /** Выбросить всё, что уже ничего не держит: карта не должна расти вечно. */
    sweep() {
      const at = now()
      for (const [key, entry] of attempts) {
        prune(entry, at)
        if (!entry.failures.length && (!entry.blockedUntil || entry.blockedUntil <= at)) attempts.delete(key)
      }
      return attempts.size
    },

    get size() { return attempts.size }
  }
}

/**
 * Ключ попытки: адрес клиента и адрес почты вместе.
 *
 * Только по IP — и один NAT наказывает всех за ним. Только по почте — и
 * кто угодно блокирует чужой вход, просто перебирая пароли к известному
 * адресу. Пара ограничивает подбор, не давая такой блокировки.
 */
export function attemptKey(ip, email) {
  return `${String(ip || 'неизвестно')}|${String(email || '').toLowerCase()}`
}

/** Адрес клиента. X-Forwarded-For учитывается только когда так велели. */
export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    // Заголовок подделывается кем угодно: доверять ему без явного разрешения
    // значит отдать обход ограничения одной строкой в запросе.
    if (forwarded) return forwarded
  }
  return req.socket?.remoteAddress || ''
}
