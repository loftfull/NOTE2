import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attemptKey, clientIp, createThrottle } from '../server/throttle.mjs'

/** Управляемые часы: тест не должен ничего ждать. */
function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: ms => { t += ms } }
}

test('до порога попытки проходят', () => {
  const t = createThrottle({ maxFailures: 3 })
  assert.equal(t.retryAfter('k'), 0)
  t.fail('k'); assert.equal(t.retryAfter('k'), 0)
  t.fail('k'); assert.equal(t.retryAfter('k'), 0)
})

test('на пороге включается блокировка', () => {
  const c = clock()
  const t = createThrottle({ maxFailures: 3, blockMs: 60_000, now: c.now })
  t.fail('k'); t.fail('k')
  const wait = t.fail('k')
  assert.equal(wait, 60, 'третья неудача даёт 60 секунд ожидания')
  assert.equal(t.retryAfter('k'), 60)
})

test('блокировка истекает сама', () => {
  const c = clock()
  const t = createThrottle({ maxFailures: 2, blockMs: 60_000, now: c.now })
  t.fail('k'); t.fail('k')
  assert.equal(t.retryAfter('k'), 60)
  c.advance(59_000)
  assert.equal(t.retryAfter('k'), 1)
  c.advance(2_000)
  assert.equal(t.retryAfter('k'), 0, 'после окончания снова можно пробовать')
})

test('старые неудачи выпадают из окна', () => {
  // Две ошибки утром и две вечером не должны складываться в блокировку.
  const c = clock()
  const t = createThrottle({ maxFailures: 3, windowMs: 10_000, now: c.now })
  t.fail('k'); t.fail('k')
  c.advance(11_000)
  assert.equal(t.fail('k'), 0, 'счётчик начался заново')
  assert.equal(t.retryAfter('k'), 0)
})

test('успешный вход снимает накопленное', () => {
  const t = createThrottle({ maxFailures: 3 })
  t.fail('k'); t.fail('k')
  t.succeed('k')
  assert.equal(t.fail('k'), 0, 'счёт пошёл с нуля')
  assert.equal(t.retryAfter('k'), 0)
})

test('ключи независимы', () => {
  const t = createThrottle({ maxFailures: 2, blockMs: 60_000 })
  t.fail('a'); t.fail('a')
  assert.ok(t.retryAfter('a') > 0)
  assert.equal(t.retryAfter('b'), 0, 'блокировка одного не задевает другого')
})

test('ключ — пара «адрес клиента + почта»', () => {
  // Только по IP — один NAT наказывает всех за ним. Только по почте — любой
  // блокирует чужой вход, перебирая пароли к известному адресу.
  assert.notEqual(attemptKey('1.2.3.4', 'a@b.c'), attemptKey('1.2.3.5', 'a@b.c'))
  assert.notEqual(attemptKey('1.2.3.4', 'a@b.c'), attemptKey('1.2.3.4', 'x@b.c'))
  assert.equal(attemptKey('1.2.3.4', 'A@B.C'), attemptKey('1.2.3.4', 'a@b.c'), 'регистр почты не создаёт второй ключ')
  assert.match(attemptKey(null, null), /неизвестно/)
})

test('X-Forwarded-For игнорируется, пока ему не велено доверять', () => {
  // Заголовок подделывается кем угодно: доверие по умолчанию отдаёт обход
  // ограничения одной строкой в запросе.
  const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '1.1.1.1' } }
  assert.equal(clientIp(req), '1.1.1.1')
  assert.equal(clientIp(req, true), '9.9.9.9')
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '1.1.1.1' } }, true), '1.1.1.1')
})

test('первый адрес из цепочки X-Forwarded-For', () => {
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 172.16.0.1' }, socket: { remoteAddress: '1.1.1.1' } }
  assert.equal(clientIp(req, true), '9.9.9.9')
})

test('карта попыток не растёт вечно', () => {
  const c = clock()
  const t = createThrottle({ maxFailures: 5, windowMs: 1000, blockMs: 1000, now: c.now })
  for (let i = 0; i < 50; i += 1) t.fail(`key-${i}`)
  assert.equal(t.size, 50)
  c.advance(2000)
  assert.equal(t.sweep(), 0, 'истёкшие записи удалены')
})
