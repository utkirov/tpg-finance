import { today } from '#shared/calc'
import { abilities } from '#shared/roles'
import { visibleOp } from '#shared/visibility'

/** Обязательство выполнено: «обещано» → «проведено» датой фактической выплаты. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ date?: string }>(event)
  const paidAt = isoDate(body?.date || today())

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    // Провести можно только то, что роль сама вносит и видит в ленте:
    // прораб не закроет чужой аванс, даже зная его номер.
    if (!visibleOp(op, user)) notFound('Операция')
    must(abilities(user.role).kinds.includes(op.kind), 'Эта роль такие операции не вносит')
    must(op.status === 'promised', 'Операция не является обязательством')

    const stage = getStage(op.stageId) ?? notFound('Этап')
    must(stage.status !== 'closed', 'Этап закрыт')
    must(stage.status !== 'check', 'Этап на сверке — новые операции заблокированы')

    useDb()
      .prepare("UPDATE operations SET status = 'ok', date = ?, due_date = NULL WHERE id = ?")
      .run(paidAt, op.id)
    audit('operation', op.id, 'settle', { date: paidAt }, user.id)
    return { ok: true }
  })
})
