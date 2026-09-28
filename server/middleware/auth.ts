import { SESSION_COOKIE, userFromToken } from '../utils/auth'

/**
 * Пока временный пароль не сменён, открыты только вход, выход, смена пароля
 * и урезанное состояние (кто я и что пароль временный).
 * Баннера в интерфейсе мало: учётки из первого запуска — это owner/owner
 * и компания, и через API с ними иначе доступно всё.
 */
const OPEN_WHILE_TEMPORARY = new Set(['/api/state', '/api/auth/login', '/api/auth/logout', '/api/auth/password'])

/** Сессия из httpOnly-куки попадает в контекст до любого маршрута. */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  const user = userFromToken(getCookie(event, SESSION_COOKIE))
  event.context.user = user
  if (user?.mustChange && !OPEN_WHILE_TEMPORARY.has(event.path.split('?')[0]!)) {
    denied('Сначала смените временный пароль в профиле')
  }
})
