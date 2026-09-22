import { SESSION_COOKIE, userFromToken } from '../utils/auth'

/** Сессия из httpOnly-куки попадает в контекст до любого маршрута. */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  event.context.user = userFromToken(getCookie(event, SESSION_COOKIE))
})
