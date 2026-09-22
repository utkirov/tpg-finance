import { SESSION_COOKIE, clearSessionCookie, destroySession } from '../../utils/auth'

export default defineEventHandler((event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) destroySession(token)
  clearSessionCookie(event)
  return { ok: true }
})
