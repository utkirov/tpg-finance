import { projectState } from '../utils/redact'

/**
 * Всё состояние одним запросом, уже урезанное под роль.
 * Остатки и доли не хранятся — считаются из строк при каждом обращении.
 *
 * С временным паролем отдаём только «кто я»: данные откроются после смены.
 */
export default defineEventHandler((event) => {
  const user = currentUser(event)
  if (!user) return { me: null }
  if (user.mustChange) {
    const settings = readSettings()
    return {
      me: { id: user.id, name: user.name, login: user.login, role: user.role, personId: user.personId },
      mustChange: true,
      settings: { ...settings, people: [], categories: [], shares: [], bonusScale: [] },
      sharesByVersion: {}, clients: [], teams: [], budgets: [], allocations: [],
      objects: [], stages: [], ops: [], attachments: [], users: [], totals: {},
      archived: { people: [], categories: [] },
    }
  }
  return { ...projectState(user), mustChange: false }
})
