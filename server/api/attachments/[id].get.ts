import { createReadStream } from 'node:fs'
import { visibleOp } from '#shared/visibility'

/** Файл отдаётся только тому, кто допущен к объекту, к которому он привязан. */
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const id = text(getRouterParam(event, 'id'), 'файл', { required: true })
  const file = getAttachment(id) ?? notFound('Файл')

  const op = file.operationId ? getOp(file.operationId) : null
  // Файл строки, которую роль не видит (чек прихода для прораба), не отдаём.
  if (op && !visibleOp(op, user)) notFound('Файл')
  const objectId = file.objectId ?? op?.objectId ?? null
  if (!objectId) notFound('Файл')
  requireObject(event, objectId)

  setHeader(event, 'Content-Type', file.mime)
  setHeader(event, 'Content-Length', file.size)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  // Браузер не угадывает тип сам: файл открывается ровно тем, чем записан.
  // (CSP sandbox не ставим — в песочнице Chrome не показывает PDF.)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return sendStream(event, createReadStream(file.path))
})
