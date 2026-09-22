import { projectState } from '../utils/redact'

/**
 * Всё состояние одним запросом, уже урезанное под роль.
 * Остатки и доли не хранятся — считаются из строк при каждом обращении.
 */
export default defineEventHandler((event) => {
  const user = currentUser(event)
  if (!user) return { me: null }
  return { ...projectState(user), mustChange: user.mustChange }
})
