import { money } from '#shared/calc'
import { objectTeams } from '#shared/plan'

/**
 * Сколько из плана команды выделено на этап.
 * Больше, чем осталось нераспределённого по объекту, выделить нельзя.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{ stageId: string; teamId: string; amount: number }>(event)

  const stageId = text(body.stageId, 'этап', { required: true })
  const teamId = text(body.teamId, 'команда', { required: true })
  const amount = cents(body.amount, 'выделено', { positive: false })
  must(amount >= 0, 'Выделенная сумма не может быть отрицательной')

  return tx(() => {
    const db = useDb()
    const stage = getStage(stageId) ?? notFound('Этап')
    requireObject(event, stage.objectId)
    must(stage.status !== 'closed', 'Этап закрыт')
    must(readTeams().some(t => t.id === teamId), 'Команда не найдена в справочнике')

    // Только этот объект: остальная лента для проверки не нужна.
    const state = {
      ops: readOps([stage.objectId]),
      stages: readStages([stage.objectId]),
      teams: readTeams(),
      budgets: readBudgets(),
      allocations: readAllocations().filter(a => !(a.stageId === stageId && a.teamId === teamId)),
    }
    const row = objectTeams(state, stage.objectId).find(r => r.teamId === teamId)
    const free = row ? row.unallocated : 0
    // Выделяют из плана: без плана команды выделять не из чего.
    // Снять выделение (ноль) можно всегда.
    must(amount === 0 || (row && row.planned > 0), 'Сначала задайте команде план на объект')
    must(amount <= free || amount === 0, 'По плану команды свободно только {amount}', { amount: money(free) })

    if (amount === 0) {
      db.prepare('DELETE FROM stage_allocations WHERE stage_id = ? AND team_id = ?').run(stageId, teamId)
    } else {
      db.prepare(
        `INSERT INTO stage_allocations (stage_id, team_id, amount) VALUES (?, ?, ?)
         ON CONFLICT(stage_id, team_id) DO UPDATE SET amount = excluded.amount`,
      ).run(stageId, teamId, amount)
    }

    audit('stage', stageId, 'allocation', { teamId, amount }, user.id)
    return { ok: true }
  })
})
