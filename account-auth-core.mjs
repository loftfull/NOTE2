import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)
export const AUTH_FORMAT = 'noteai-auth-v1'
export const SESSION_PREFIX = 'nai1'
export const DEFAULT_SESSION_TTL_DAYS = 30

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function validEmail(value = '') {
  const email = normalizeEmail(value)
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePassword(password = '') {
  const text = String(password || '')
  if (text.length < 12) throw new Error('Password must be at least 12 characters')
  if (text.length > 256) throw new Error('Password is too long')
  return text
}

export function accountIdForEmail(email) {
  const normalized = normalizeEmail(email)
  if (!validEmail(normalized)) throw new Error('Invalid email address')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

export async function createPasswordRecord(password) {
  const value = validatePassword(password)
  const salt = randomBytes(16)
  const hash = await scrypt(value, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return { algorithm: 'scrypt', salt: salt.toString('base64url'), hash: Buffer.from(hash).toString('base64url'), N: 16384, r: 8, p: 1 }
}

export async function verifyPassword(password, record = {}) {
  try {
    const value = validatePassword(password)
    if (record.algorithm !== 'scrypt' || !record.salt || !record.hash) return false
    const salt = Buffer.from(record.salt, 'base64url')
    const expected = Buffer.from(record.hash, 'base64url')
    const actual = Buffer.from(await scrypt(value, salt, expected.length, {
      N: Number(record.N || 16384), r: Number(record.r || 8), p: Number(record.p || 1), maxmem: 64 * 1024 * 1024
    }))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function createSessionCredential() {
  const sessionId = randomBytes(12).toString('base64url')
  const secret = randomBytes(32).toString('base64url')
  return { sessionId, token: `${SESSION_PREFIX}.${sessionId}.${secret}`, secretHash: createHash('sha256').update(secret).digest('hex') }
}

export function parseSessionToken(token = '') {
  const parts = String(token || '').split('.')
  if (parts.length !== 3 || parts[0] !== SESSION_PREFIX || !/^[A-Za-z0-9_-]{8,40}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{32,80}$/.test(parts[2])) return null
  return { sessionId: parts[1], secret: parts[2] }
}

export function verifySessionSecret(secret, expectedHash = '') {
  if (!secret || !/^[a-f0-9]{64}$/.test(String(expectedHash || ''))) return false
  const actual = Buffer.from(createHash('sha256').update(secret).digest('hex'))
  const expected = Buffer.from(String(expectedHash))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function sessionExpiry(ttlDays = DEFAULT_SESSION_TTL_DAYS, now = Date.now()) {
  const days = Math.min(365, Math.max(1, Number(ttlDays || DEFAULT_SESSION_TTL_DAYS)))
  return new Date(now + days * 86400_000).toISOString()
}

export function publicAccount(account = {}) {
  return { id: account.id, email: account.email, displayName: account.displayName || '', createdAt: account.createdAt }
}

export function publicSession(session = {}) {
  return { id: session.id, deviceName: session.deviceName || 'Unknown device', createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, current: Boolean(session.current) }
}
