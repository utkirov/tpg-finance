import { SESSION_COOKIE, userFromToken } from '../utils/auth'

/** С временным паролем открыты только вход, выход, смена пароля и «кто я». */
const OPEN_WITH_TEMP_PASSWORD = new Set(['/api/state', '/api/auth/password', '/api/auth/logout', '/api/auth/login'])

/** Сессия из httpOnly-куки попадает в контекст до любого маршрута. */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  const user = userFromToken(getCookie(event, SESSION_COOKIE))
  event.context.user = user

  // Пароль «как логин» знает любой, кто видел README: пока его не сменили,
  // сервер не отдаёт и не принимает ничего, кроме смены пароля.
  const path = event.path.split('?')[0]!
  // /api/_… — служебные маршруты модулей (значки): данных в них нет.
  if (user?.mustChange && !path.startsWith('/api/_') && !OPEN_WITH_TEMP_PASSWORD.has(path)) {
    denied('Сначала смените временный пароль', 403)
  }
})
