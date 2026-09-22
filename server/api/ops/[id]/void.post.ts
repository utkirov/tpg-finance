import { dmy, today, type Op } from '#shared/calc'

/**
 * Сторно. Записи не удаляются никогда: исходная помечается отменённой,
 * рядом появляется обратная со ссылкой на неё — обе видны в ленте.
 * Сторно прихода снимает и порождённый им бонус.
 * Закрытый этап возвращается на сверку.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const id = text(getRouterParam(event, 'id'), 'операция', { required: true })
  const body = await readBody<{ reason?: string }>(event)
  const reason = text(body?.reason, 'причина', { required: true })

  return tx(() => {
    const op = getOp(id) ?? notFound('Операция')
    requireObject(event, op.objectId)
    must(op.status !== 'void', 'Операция уже отменена')
    must(!op.isAuto, 'Строка бонуса отдельно не сторнируется — отмените породивший её приход')

    const db = useDb()
    const stamp = db.prepare('UPDATE operations SET status = ?, reason = ? WHERE id = ?')

    const reverse = (src: Op, why: string, note: string) => {
      stamp.run('void', why, src.id)
      const back: Op = {
        ...src,
        id: uid(),
        date: today(),
        status: 'void',
        dueDate: null,
        reversesId: src.id,
        parentId: null,
        reason: why,
        note,
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      }
      insertOp(back)
      audit('operation', src.id, 'void', { reason: why, reversedBy: back.id }, user.id)
    }

    reverse(op, reason, `сторно записи от ${dmy(op.date)}`)

    if (op.kind === 'in') {
      const children = db.prepare("SELECT id FROM operations WHERE parent_id = ? AND status = 'ok'").all(op.id) as Array<{ id: string }>
      for (const { id: childId } of children) {
        const child = getOp(childId)
        if (child) reverse(child, 'сторно прихода', 'сторно строки бонуса')
      }
    }

    const stage = getStage(op.stageId)
    if (stage?.status === 'closed') {
      db.prepare("UPDATE stages SET status = 'check', closed_at = NULL WHERE id = ?").run(stage.id)
      audit('stage', stage.id, 'reopen', 'сторно в закрытом этапе', user.id)
    }

    return { ok: true }
  })
})
