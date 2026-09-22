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
 * Пять неудач подряд по одному логину — минута паузы.
 * Счётчик в памяти: перезапуск его сбрасывает, но перебор он ломает,
 * а лишней таблицы в базе не заводит.
 */
const TRIES = new Map<string, { count: number; until: number }>()
const MAX_TRIES = 5
const LOCK_MS = 60_000

export function tooManyTries(login: string): boolean {
  const row = TRIES.get(login.toLowerCase())
  if (!row) return false
  if (Date.now() > row.until) { TRIES.delete(login.toLowerCase()); return false }
  return row.count >= MAX_TRIES
}

export function noteFailedTry(login: string) {
  const key = login.toLowerCase()
  const row = TRIES.get(key)
  const fresh = !row || Date.now() > row.until
  TRIES.set(key, { count: fresh ? 1 : row.count + 1, until: Date.now() + LOCK_MS })
}

export function forgetTries(login: string) {
  TRIES.delete(login.toLowerCase())
}
