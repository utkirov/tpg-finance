import { abilities } from '#shared/roles'

/**
 * Журнал изменений объекта: кто, когда и что сделал.
 * Записи раскрывают суммы договора и ставку бонуса, поэтому доступны
 * только тем, кому и так видно всё, — владельцу и бухгалтеру.
 */
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const objectId = text(getRouterParam(event, 'id'), 'объект', { required: true })

  if (!abilities(user.role).seeAllShares) denied('Недостаточно прав')
  requireObject(event, objectId)
  getObject(objectId) ?? notFound('Объект')

  const limit = Math.min(Math.max(Number(getQuery(event).limit) || 300, 1), 1000)
  return { entries: auditForObject(objectId, limit) }
})
