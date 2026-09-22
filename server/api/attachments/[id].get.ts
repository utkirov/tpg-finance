import { createReadStream } from 'node:fs'

/** Файл отдаётся только тому, кто допущен к объекту, к которому он привязан. */
export default defineEventHandler((event) => {
  requireUser(event)
  const id = text(getRouterParam(event, 'id'), 'файл', { required: true })
  const file = getAttachment(id) ?? notFound('Файл')

  const objectId = file.objectId ?? (file.operationId ? getOp(file.operationId)?.objectId : null)
  if (objectId) requireObject(event, objectId)

  setHeader(event, 'Content-Type', file.mime)
  setHeader(event, 'Content-Length', String(file.size))
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  return sendStream(event, createReadStream(file.path))
})
