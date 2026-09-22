/**
 * Новый человек прямо из формы: нужного в списке нет — завели, не выходя.
 * Команда берётся из того, что уже выбрано; доли и телефон правятся
 * в справочниках, здесь только имя и место работы.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{ name: string; role?: string; teamId?: string | null }>(event)

  const name = text(body.name, 'имя', { required: true, max: 120 })
  const role = text(body.role, 'роль', { max: 60 })
  const teamId = body.teamId ? text(body.teamId, 'команда', { max: 64 }) : null

  return tx(() => {
    const db = useDb()
    if (teamId) must(readTeams().some(t => t.id === teamId), 'Команда не найдена в справочнике')

    // Тёзка в той же команде уже может лежать в архиве — возвращаем его.
    const same = db.prepare(
      "SELECT id FROM people WHERE lower(name) = lower(?) AND COALESCE(team_id, '') = ?",
    ).get(name, teamId ?? '') as { id: string } | undefined

    if (same) {
      db.prepare('UPDATE people SET archived = 0 WHERE id = ?').run(same.id)
      return { id: same.id }
    }

    const id = uid()
    db.prepare(
      "INSERT INTO people (id, name, role, phone, team_id, is_sharer, archived) VALUES (?, ?, ?, '', ?, 0, 0)",
    ).run(id, name, role, teamId)

    audit('settings', 'main', 'person', { name, role, teamId }, user.id)
    return { id }
  })
})
