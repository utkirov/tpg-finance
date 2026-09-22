/** Кто из участников и прорабов допущен к объекту. */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const objectId = text(getRouterParam(event, 'id'), 'объект', { required: true })
  const body = await readBody<{ userIds: string[] }>(event)
  const userIds = (body?.userIds ?? []).map(id => text(id, 'пользователь', { required: true }))

  return tx(() => {
    getObject(objectId) ?? notFound('Объект')
    const db = useDb()
    const known = new Set((db.prepare('SELECT id FROM users WHERE active = 1').all() as Array<{ id: string }>).map(r => r.id))
    must(userIds.every(id => known.has(id)), 'Указан несуществующий пользователь')

    db.prepare('DELETE FROM object_access WHERE object_id = ?').run(objectId)
    const grant = db.prepare('INSERT INTO object_access (object_id, user_id) VALUES (?, ?)')
    for (const id of userIds) grant.run(objectId, id)

    audit('object', objectId, 'access', { userIds }, user.id)
    return { ok: true }
  })
})
