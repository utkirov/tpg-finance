import { calcStage, operationWarnings, today, type Note } from '#shared/calc'
import { abilities } from '#shared/roles'
import { visibleOp } from '#shared/visibility'

/**
 * Обязательство выполнено: «обещано» → «проведено» датой фактической выплаты.
 *
 * Проведение меняет кассу, поэтому проходит те же проверки, что и новая запись:
 * этап не закрыт и не на сверке, запись видна роли, предупреждения
 * (аванс сверх доли, освоение) возвращаются без записи; повтор с force: true сохраняет.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const ab = abilities(user.role)
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ date?: string; force?: boolean }>(event)
  const paidAt = isoDate(body?.date || today())

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    // Чего роль не видит, того она и не проводит.
    if (!visibleOp(op, user)) notFound('Операция')
    must(ab.kinds.includes(op.kind), 'Эта роль такие операции не вносит')
    must(op.status === 'promised', 'Операция не является обязательством')

    const stage = getStage(op.stageId) ?? notFound('Этап')
    must(stage.status !== 'closed', 'Этап закрыт')
    must(stage.status !== 'check', 'Этап на сверке — новые операции заблокированы')

    const obj = getObject(op.objectId) ?? notFound('Объект')
    const ops = opsOfStage(stage.id).filter(o => o.id !== op.id)
    const totals = calcStage(stage, ops, sharesOfVersion(obj.sharesVersion))
    const warnings = operationWarnings(
      { kind: op.kind, amountBase: op.amountBase, date: paidAt, personId: op.personId },
      stage, ops, totals, { revealIncome: ab.seeContract, ignoreId: op.id },
    )
    if (warnings.length && !body?.force) return { ok: false, warnings }

    useDb()
      .prepare("UPDATE operations SET status = 'ok', date = ?, due_date = NULL WHERE id = ?")
      .run(paidAt, op.id)
    audit('operation', op.id, 'settle', { date: paidAt, forced: warnings.length > 0 }, user.id)
    return { ok: true, warnings: [] as Note[] }
  })
})
