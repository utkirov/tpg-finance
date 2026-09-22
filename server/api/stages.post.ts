import { money } from '#shared/calc'

/** Создание и правка этапа. Сумма этапов не может превысить сумму договора объекта. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{ id?: string; objectId?: string; name?: string; amount: number }>(event)
  const amount = cents(body.amount, 'сумма этапа')
  const name = text(body.name, 'название', { max: 120 })

  return tx(() => {
    const db = useDb()
    const id = body.id ? text(body.id, 'этап') : null
    const stage = id ? (getStage(id) ?? notFound('Этап')) : null
    const obj = getObject(stage ? stage.objectId : text(body.objectId, 'объект', { required: true })) ?? notFound('Объект')

    must(!stage || stage.status !== 'closed', 'Закрытый этап не редактируется')

    const others = stagesOfObject(obj.id).reduce((a, s) => a + (s.id === id ? 0 : s.amount), 0)
    must(
      others + amount <= obj.contractAmount,
      `Сумма этапов превысит сумму договора на ${money(others + amount - obj.contractAmount)}`,
    )

    if (stage) {
      db.prepare('UPDATE stages SET name = ?, amount = ? WHERE id = ?').run(name, amount, stage.id)
      audit('stage', stage.id, 'update', { amount, was: stage.amount }, user.id)
      return { id: stage.id }
    }

    const fresh = uid()
    const number = stagesOfObject(obj.id).length + 1
    db.prepare(
      "INSERT INTO stages (id, object_id, number, name, amount, status, closed_at) VALUES (?, ?, ?, ?, ?, 'draft', NULL)",
    ).run(fresh, obj.id, number, name, amount)
    audit('stage', fresh, 'create', { objectId: obj.id, number, amount }, user.id)
    return { id: fresh }
  })
})
