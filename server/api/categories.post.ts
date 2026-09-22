/**
 * Новая категория расхода прямо из формы операции: нужной не нашлось —
 * завели не выходя из записи. Область берётся из того, что уже выбрано:
 * команда у прямого расхода, группа у расхода не по объекту.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{ name: string; teamId?: string | null; group?: string | null }>(event)

  const name = text(body.name, 'название', { required: true, max: 120 })
  const teamId = body.teamId ? text(body.teamId, 'команда', { max: 64 }) : null
  const group = body.group ? text(body.group, 'группа', { max: 60 }) : null
  must(!(teamId && group), 'Категория относится либо к команде, либо к группе расходов не по объекту')

  return tx(() => {
    const db = useDb()
    if (teamId) must(readTeams().some(t => t.id === teamId), 'Команда не найдена в справочнике')

    // Такая категория уже может лежать в архиве — возвращаем её, а не плодим вторую.
    const same = db.prepare(
      `SELECT id FROM categories
       WHERE lower(name) = lower(?) AND COALESCE(team_id, '') = ? AND COALESCE(group_name, '') = ?`,
    ).get(name, teamId ?? '', group ?? '') as { id: string } | undefined

    if (same) {
      db.prepare('UPDATE categories SET archived = 0 WHERE id = ?').run(same.id)
      return { id: same.id }
    }

    const id = uid()
    db.prepare(
      'INSERT INTO categories (id, name, team_id, group_name, system, archived) VALUES (?, ?, ?, ?, 0, 0)',
    ).run(id, name, teamId, group)

    audit('settings', 'main', 'category', { name, teamId, group }, user.id)
    return { id }
  })
})
