import { createReadStream } from 'node:fs'
import { abilities } from '#shared/roles'
import { visibleOp } from '#shared/visibility'

/** Файл отдаётся только тому, кто допущен к объекту, к которому он привязан. */
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const id = text(getRouterParam(event, 'id'), 'файл', { required: true })
  const file = getAttachment(id) ?? notFound('Файл')

  // Чек к операции виден тому, кто видит саму операцию: прораб не откроет
  // расписку о приходе, участник — чужой аванс.
  const op = file.operationId ? getOp(file.operationId) : null
  if (op && !visibleOp(op, user)) notFound('Файл')
  const objectId = file.objectId ?? op?.objectId ?? null
  if (objectId) requireObject(event, objectId)
  else if (!abilities(user.role).allObjects) notFound('Файл')

  setHeader(event, 'Content-Type', file.mime)
  setHeader(event, 'Content-Length', String(file.size))
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  // Тип файла назвал загрузивший — браузер не должен угадывать другой.
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return sendStream(event, createReadStream(file.path))
})
