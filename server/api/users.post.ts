import type { Role } from '#shared/roles'
import { destroyUserSessions } from '../utils/auth'
import { hashPassword } from '../utils/password'

/** Пользователи и права: создание, смена роли, сброс пароля, отключение. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{
    id?: string
    login?: string
    name?: string
    role?: Role
    personId?: string | null
    password?: string
    active?: boolean
  }>(event)

  return tx(() => {
    const db = useDb()
    const id = body.id ? text(body.id, 'пользователь') : null
    const role = body.role ? oneOf(body.role, ['owner', 'member', 'foreman', 'accountant'] as const, 'роль') : null
    const personId = body.personId ? text(body.personId, 'человек') : null
    if (personId) must(readPeople().some(p => p.id === personId), 'Человек не найден в справочнике')

    if (id) {
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, any> | undefined
      if (!existing) notFound('Пользователь')
      must(id !== user.id || body.active !== false, 'Нельзя отключить самого себя')

      const nextRole = role ?? existing!.role
      const active = body.active === false ? 0 : 1
      // Без владельца приложением некому управлять: последнего не понизить и не отключить.
      if (existing!.role === 'owner' && (nextRole !== 'owner' || !active)) {
        const owners = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND id <> ?").get(id) as { n: number }
        must(owners.n > 0, 'Нельзя оставить приложение без владельца')
      }

      // Не прислали карточку человека — оставляем прежнюю. Иначе отключение
      // или смена имени молча отвязывали участника от его доли.
      const nextPerson = 'personId' in body ? personId : existing!.person_id
      db.prepare('UPDATE users SET name = ?, role = ?, person_id = ?, active = ? WHERE id = ?').run(
        text(body.name, 'имя', { max: 120 }) || existing!.name,
        nextRole,
        nextPerson,
        active,
        id,
      )
      if (body.password) {
        must(String(body.password).length >= 8, 'Пароль — не короче 8 символов')
        const { hash, salt } = hashPassword(String(body.password))
        db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, must_change = 1 WHERE id = ?').run(hash, salt, id)
      }
      // Сброс пароля, смена роли или отключение — старые сессии больше не действуют.
      if (body.password || !active || nextRole !== existing!.role) destroyUserSessions(id)
      audit('user', id, 'update', { role: role ?? existing!.role, active: body.active !== false }, user.id)
      return { id }
    }

    const login = text(body.login, 'логин', { required: true, max: 64 }).toLowerCase()
    must(/^[a-z0-9_.-]+$/.test(login), 'Логин: латиница, цифры, точка, дефис, подчёркивание')
    must(!db.prepare('SELECT 1 FROM users WHERE login = ?').get(login), 'Такой логин уже занят')
    const password = String(body.password ?? '')
    must(password.length >= 8, 'Пароль — не короче 8 символов')
    must(role, 'Укажите роль')

    const fresh = uid()
    const { hash, salt } = hashPassword(password)
    db.prepare(
      `INSERT INTO users (id, login, name, role, pass_hash, pass_salt, must_change, phone, person_id, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, '', ?, 1, ?)`,
    ).run(fresh, login, text(body.name, 'имя', { required: true, max: 120 }), role, hash, salt, personId, new Date().toISOString())
    audit('user', fresh, 'create', { login, role }, user.id)
    return { id: fresh }
  })
})
