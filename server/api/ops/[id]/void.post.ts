import { voidOperation } from '../../../utils/voiding'

/**
 * Сторно. Записи не удаляются никогда: исходная помечается отменённой,
 * рядом появляется обратная со ссылкой на неё — обе видны в ленте (по кнопке).
 * Сторно прихода снимает и порождённый им бонус.
 * Закрытый этап возвращается на сверку.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'closeStages')
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ reason?: string }>(event)
  const reason = text(body?.reason, 'причина', { required: true })

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    must(op.status !== 'void', 'Операция уже отменена')
    must(!op.isAuto, 'Строка бонуса отдельно не сторнируется — отмените породивший её приход')
    voidOperation(op, reason, user.id)
    return { ok: true }
  })
})
