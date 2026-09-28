import type { H3Event } from 'h3'
import type { Role } from '#shared/roles'
import { abilities } from '#shared/roles'
import { newToken, verifyPassword } from './password'

export const SESSION_COOKIE = 'finance_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  login: string
  name: string
  role: Role
  personId: string | null
  mustChange: boolean
}

type Row = Record<string, any>

const toUser = (r: Row): SessionUser => ({
  id: r.id,
  login: r.login,
  name: r.name,
  role: r.role,
  personId: r.person_id,
  mustChange: !!r.must_change,
})

export function findUserByLogin(login: string): (SessionUser & { passHash: string; passSalt: string }) | null {
  const r = useDb().prepare('SELECT * FROM users WHERE login = ? AND active = 1').get(login.trim().toLowerCase()) as Row | undefined
  return r ? { ...toUser(r), passHash: r.pass_hash, passSalt: r.pass_salt } : null
}

export function checkPassword(login: string, password: string): SessionUser | null {
  const user = findUserByLogin(login)
  if (!user) return null
  return verifyPassword(password, user.passHash, user.passSalt) ? user : null
}

export function createSession(userId: string): string {
  const token = newToken()
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5)
  useDb()
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now.toISOString(), expires.toISOString())
  return token
}

export function destroySession(token: string) {
  useDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function userFromToken(token: string | undefined): SessionUser | null {
  if (!token) return null
  const db = useDb()
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1')
    .get(token, new Date().toISOString()) as Row | undefined
  return row ? toUser(row) : null
}

/** Раз в сутки чистим протухшие сессии — таблица не растёт вечно. */
export function pruneSessions() {
  useDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())
}

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
    // Только по HTTPS: по обычному HTTP браузер такую куку выбросит,
    // и вход по сетевому адресу не удержится. Ставим по протоколу запроса.
    secure: getRequestProtocol(event) === 'https',
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function currentUser(event: H3Event): SessionUser | null {
  return (event.context.user as SessionUser | null) ?? null
}

/** Любой защищённый маршрут начинается отсюда. */
export function requireUser(event: H3Event): SessionUser {
  const user = currentUser(event)
  if (!user) denied('Нужен вход', 401)
  return user
}

export function requireAbility(event: H3Event, ability: 'write' | 'manage' | 'closeStages'): SessionUser {
  const user = requireUser(event)
  if (!abilities(user.role)[ability]) denied('Недостаточно прав')
  return user
}

/** Доступ к объекту: владелец и бухгалтер видят все, остальные — только назначенные. */
export function canReachObject(user: SessionUser, objectId: string): boolean {
  if (abilities(user.role).allObjects) return true
  return objectIdsFor(user.id).includes(objectId)
}

export function requireObject(event: H3Event, objectId: string): SessionUser {
  const user = requireUser(event)
  if (!canReachObject(user, objectId)) denied('Объект недоступен')
  return user
}

/* ---------- защита от подбора пароля ---------- */

/**
 * Два счётчика неудач:
 *  - по логину: пять подряд — минута паузы (перебор пароля одной учётки);
 *  - по адресу: двадцать за десять минут — пауза на десять минут
 *    (перебор многих логинов с одного адреса, где счётчик по логину не срабатывает).
 * Счётчики в памяти: перезапуск их сбрасывает, но на один процесс этого
 * достаточно, а лишней таблицы в базе не заводим. Карта чистится от старых
 * записей, чтобы перебор с разных адресов не раздувал память.
 */
interface Tries { count: number; until: number }
const BY_LOGIN = new Map<string, Tries>()
const BY_IP = new Map<string, Tries>()
const LOGIN_MAX = 5
const LOGIN_LOCK_MS = 60_000
const IP_MAX = 20
const IP_LOCK_MS = 10 * 60_000
const MAP_LIMIT = 10_000

function locked(map: Map<string, Tries>, key: string, max: number): boolean {
  const row = map.get(key)
  if (!row) return false
  if (Date.now() > row.until) { map.delete(key); return false }
  return row.count >= max
}

function note(map: Map<string, Tries>, key: string, lockMs: number) {
  if (map.size > MAP_LIMIT) {
    const now = Date.now()
    for (const [k, v] of map) if (now > v.until) map.delete(k)
  }
  const row = map.get(key)
  const fresh = !row || Date.now() > row.until
  map.set(key, { count: fresh ? 1 : row.count + 1, until: Date.now() + lockMs })
}

export function clientAddress(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: process.env.FINANCE_TRUST_PROXY === '1' }) ?? 'unknown'
}

export function tooManyTries(login: string, ip: string): boolean {
  return locked(BY_LOGIN, login.toLowerCase(), LOGIN_MAX) || locked(BY_IP, ip, IP_MAX)
}

export function noteFailedTry(login: string, ip: string) {
  note(BY_LOGIN, login.toLowerCase(), LOGIN_LOCK_MS)
  note(BY_IP, ip, IP_LOCK_MS)
}

export function forgetTries(login: string) {
  BY_LOGIN.delete(login.toLowerCase())
}
