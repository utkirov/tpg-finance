import { today } from '#shared/calc'

/** Обязательство выполнено: «обещано» → «проведено» датой фактической выплаты. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ date?: string }>(event)
  const paidAt = isoDate(body?.date || today())

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    must(op.status === 'promised', 'Операция не является обязательством')

    const stage = getStage(op.stageId) ?? notFound('Этап')
    must(stage.status !== 'closed', 'Этап закрыт')

    useDb()
      .prepare("UPDATE operations SET status = 'ok', date = ?, due_date = NULL WHERE id = ?")
      .run(paidAt, op.id)
    audit('operation', op.id, 'settle', { date: paidAt }, user.id)
    return { ok: true }
  })
})
