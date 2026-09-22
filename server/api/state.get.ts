import { emptyAppState } from '#shared/calc'
import { projectState, stateKey } from '../utils/redact'

/**
 * Всё состояние одним запросом, уже урезанное под роль.
 * Остатки и доли не хранятся — считаются из строк при каждом обращении.
 *
 * Пока пароль временный, данных нет вовсе: только кто вошёл и требование
 * сменить пароль. Иначе пароль «как логин» открывал бы всю кассу.
 *
 * Ответ помечен версией данных: если ничего не менялось, браузер
 * получает 304 и берёт состояние из своего кэша — без мегабайт по сети.
 */
export default defineEventHandler((event) => {
  const user = currentUser(event)
  setHeader(event, 'Cache-Control', 'private, no-cache')
  if (!user) return { me: null }

  const me = { id: user.id, name: user.name, login: user.login, role: user.role, personId: user.personId }
  if (user.mustChange) return { ...emptyAppState(), me, mustChange: true }

  const etag = `W/"${stateKey(user)}"`
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Vary', 'Cookie, Accept-Encoding')
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  return { ...projectState(user), mustChange: false }
})
