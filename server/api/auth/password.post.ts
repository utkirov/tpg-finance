import { SESSION_COOKIE } from '../../utils/auth'
import { hashPassword } from '../../utils/password'

/** Смена пароля. Пароли по умолчанию помечены must_change и требуют замены. */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await readBody<{ current: string; next: string }>(event)

  must(checkPassword(user.login, String(body?.current ?? '')), 'Текущий пароль указан неверно')
  const next = String(body?.next ?? '')
  must(next.length >= 8, 'Новый пароль — не короче 8 символов')
  must(next !== user.login, 'Пароль не должен совпадать с логином')
  must(next !== String(body?.current ?? ''), 'Новый пароль должен отличаться от текущего')

  return tx(() => {
    const { hash, salt } = hashPassword(next)
    useDb().prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, must_change = 0 WHERE id = ?').run(hash, salt, user.id)
    // Остальные входы с этим паролем закрываются: смена пароля — обычно реакция на утечку.
    dropSessions(user.id, getCookie(event, SESSION_COOKIE) ?? '')
    audit('user', user.id, 'password', '', user.id)
    return { ok: true }
  })
})
