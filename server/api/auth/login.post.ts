/** Вход по логину и паролю. Вход по телефону и коду требует SMS-шлюза — см. отчёт. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ login: string; password: string }>(event)
  const login = text(body?.login, 'логин', { required: true, max: 64 })
  const password = String(body?.password ?? '')
  must(password.length > 0, 'Введите пароль')

  must(!tooManyTries(login), 'Слишком много попыток входа. Подождите минуту.')

  const user = checkPassword(login, password)
  if (!user) {
    noteFailedTry(login)
    // Одинаковый ответ на неверный логин и неверный пароль.
    denied('Неверный логин или пароль', 401)
  }
  forgetTries(login)

  const token = createSession(user.id)
  setSessionCookie(event, token)
  audit('user', user.id, 'login', '', user.id)
  return { me: { id: user.id, name: user.name, login: user.login, role: user.role, personId: user.personId }, mustChange: user.mustChange }
})
