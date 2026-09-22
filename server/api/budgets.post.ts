/**
 * План расходов по командам: о какой сумме договорились на объект.
 * Ноль убирает строку плана.
 *
 * Тем же запросом план делится на людей команды: `people` — список
 * {personId, amount}. Расписать можно не больше, чем весь план команды.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{
    objectId: string
    teamId: string
    amount?: number
    note?: string
    people?: Array<{ personId: string; amount: number }>
  }>(event)

  const objectId = text(body.objectId, 'объект', { required: true })
  const teamId = text(body.teamId, 'команда', { required: true })
  const note = text(body.note, 'комментарий', { max: 300 })

  // Список людей приходит только когда его правят: иначе план команды не трогает разбивку.
  const people = body.people?.map(x => ({
    personId: text(x.personId, 'человек', { required: true, max: 64 }),
    amount: cents(x.amount, 'сумма человека', { positive: false }),
  }))
  const changesTeam = body.amount !== undefined
  const amount = changesTeam ? cents(body.amount, 'план', { positive: false }) : 0
  must(amount >= 0, 'План не может быть отрицательным')
  must(!people || people.every(x => x.amount >= 0), 'Сумма не может быть отрицательной')
  must(
    !people || new Set(people.map(x => x.personId)).size === people.length,
    'Человек в списке повторяется',
  )

  return tx(() => {
    const db = useDb()
    getObject(objectId) ?? notFound('Объект')
    requireObject(event, objectId)
    must(readTeams().some(t => t.id === teamId), 'Команда не найдена в справочнике')

    const upsert = db.prepare(
      `INSERT INTO object_budgets (object_id, team_id, person_id, amount, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(object_id, team_id, person_id) DO UPDATE SET amount = excluded.amount, note = excluded.note`,
    )
    const drop = db.prepare(
      'DELETE FROM object_budgets WHERE object_id = ? AND team_id = ? AND person_id = ?',
    )

    if (changesTeam) {
      // Ноль убирает команду из плана вместе со всей её разбивкой.
      if (amount === 0) {
        db.prepare('DELETE FROM object_budgets WHERE object_id = ? AND team_id = ?').run(objectId, teamId)
        db.prepare(
          `DELETE FROM stage_allocations WHERE team_id = ?
           AND stage_id IN (SELECT id FROM stages WHERE object_id = ?)`,
        ).run(teamId, objectId)
      }
      else upsert.run(objectId, teamId, '', amount, note)
    }

    if (people) {
      const roster = readPeople()
      for (const x of people) {
        const person = roster.find(p => p.id === x.personId) ?? notFound('Человек')
        must(person.teamId === teamId, 'Человек не состоит в этой команде')
      }

      for (const x of people) {
        if (x.amount === 0) drop.run(objectId, teamId, x.personId)
        else upsert.run(objectId, teamId, x.personId, x.amount, '')
      }

      // Расписать больше, чем весь план команды, нельзя — иначе план ничего не значит.
      const row = db.prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN person_id = '' THEN amount END), 0) AS team,
           COALESCE(SUM(CASE WHEN person_id <> '' THEN amount END), 0) AS assigned
         FROM object_budgets WHERE object_id = ? AND team_id = ?`,
      ).get(objectId, teamId) as { team: number; assigned: number }
      must(
        row.team === 0 || row.assigned <= row.team,
        'По людям расписано больше, чем весь план команды',
      )
    }

    audit('object', objectId, 'budget', { teamId, amount: changesTeam ? amount : undefined, people }, user.id)
    return { ok: true }
  })
})
