import { today } from '#shared/calc'

/**
 * Бонус получен / не получен.
 *
 * Строка бонуса появляется вместе с приходом, но в расходы и доли идёт только
 * с отметкой «получено»: пока получатель денег не взял, они лежат в кассе.
 * Отметку можно снять, если поставили по ошибке. На сверке и в закрытом этапе
 * отметка не меняется — от неё зависят доли, по которым сверяются.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ received?: boolean; date?: string }>(event)
  const received = body?.received !== false
  const at = received ? isoDate(body?.date || today()) : null

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    must(op.isAuto, 'Отметка «получено» ставится только у строки бонуса')
    must(op.status === 'ok', 'Строка бонуса отменена')

    const stage = getStage(op.stageId) ?? notFound('Этап')
    must(stage.status !== 'closed', 'Этап закрыт')
    must(stage.status !== 'check', 'Этап на сверке — новые операции заблокированы')

    if (op.received === received) return { ok: true }
    useDb().prepare('UPDATE operations SET received = ?, received_at = ? WHERE id = ?').run(received ? 1 : 0, at, op.id)
    audit('operation', op.id, received ? 'bonus-received' : 'bonus-unreceived', { date: at, amount: op.amountBase }, user.id)
    return { ok: true }
  })
})
