import { CLIENT_SOURCES } from '#shared/calc'

/** Клиент CRM: создание и правка. Удаления нет — только архив. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{
    id?: string
    name: string
    phone?: string
    phone2?: string
    email?: string
    source?: string
    note?: string
    archived?: boolean
  }>(event)

  const name = text(body.name, 'клиент: имя', { required: true, max: 160 })
  const phone = text(body.phone, 'телефон', { max: 40 })
  const phone2 = text(body.phone2, 'телефон', { max: 40 })
  const email = text(body.email, 'почта', { max: 120 })
  const source = text(body.source, 'источник', { max: 60 })
  const note = text(body.note, 'комментарий', { max: 1000 })
  if (source) must((CLIENT_SOURCES as readonly string[]).includes(source), 'Источник не из списка')

  return tx(() => {
    const db = useDb()
    const id = body.id ? text(body.id, 'клиент') : null

    if (id) {
      getClient(id) ?? notFound('Клиент')
      db.prepare(
        `UPDATE clients SET name = ?, phone = ?, phone2 = ?, email = ?, source = ?, note = ?, archived = ?
         WHERE id = ?`,
      ).run(name, phone, phone2, email, source, note, body.archived ? 1 : 0, id)
      audit('client', id, 'update', { name }, user.id)
      return { id }
    }

    const fresh = uid()
    db.prepare(
      `INSERT INTO clients (id, name, phone, phone2, email, source, note, created_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(fresh, name, phone, phone2, email, source, note, new Date().toISOString())
    audit('client', fresh, 'create', { name, source }, user.id)
    return { id: fresh }
  })
})
