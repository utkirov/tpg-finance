import { dmy, today, type Op } from '#shared/calc'

/**
 * Сторно одной записи. Записи не удаляются никогда: исходная помечается
 * отменённой, рядом появляется обратная со ссылкой на неё.
 * Сторно прихода снимает и порождённый им бонус.
 * Закрытый этап возвращается на сверку.
 *
 * Вызывается внутри транзакции: из сторно и из «Исправить» (сторно + новая запись).
 */
export function voidOperation(op: Op, reason: string, userId: string) {
  const db = useDb()
  const stamp = db.prepare('UPDATE operations SET status = ?, reason = ? WHERE id = ?')

  const reverse = (src: Op, why: string, note: string) => {
    stamp.run('void', why, src.id)
    const back: Op = {
      ...src,
      id: uid(),
      date: today(),
      status: 'void',
      reversesId: src.id,
      parentId: null,
      clientKey: null,
      reason: why,
      note,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    }
    insertOp(back)
    audit('operation', src.id, 'void', { reason: why, reversedBy: back.id }, userId)
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
    audit('stage', stage.id, 'reopen', 'сторно в закрытом этапе', userId)
  }
}
