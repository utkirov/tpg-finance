import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { DB_FILE } from '../utils/db'

/** Фото чека, договор, расписка, страница блокнота — до 10 МБ. */
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
}

export const FILES_DIR = resolve(dirname(DB_FILE), 'files')

export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const parts = await readMultipartFormData(event)
  must(parts?.length, 'Файл не получен')

  const field = (name: string) => parts!.find(p => p.name === name && !p.filename)?.data.toString('utf8').trim() || ''
  const file = parts!.find(p => p.filename && p.data?.length)
  must(file, 'Файл не получен')

  const mime = String(file!.type ?? '').toLowerCase()
  must(ALLOWED[mime], 'Принимаются только JPEG, PNG, WebP, HEIC и PDF')
  must(file!.data.length <= MAX_BYTES, 'Файл больше 10 МБ — сожмите изображение')

  const kind = oneOf(field('kind') || 'прочее', ['договор', 'расписка', 'чек', 'фото', 'прочее'] as const, 'тип файла')
  const objectId = field('objectId') || null
  const operationId = field('operationId') || null
  must(objectId || operationId, 'Файл нужно привязать к объекту или операции')

  return tx(() => {
    if (operationId) {
      const op = getOp(operationId) ?? notFound('Операция')
      requireObject(event, op.objectId)
    }
    if (objectId) {
      getObject(objectId) ?? notFound('Объект')
      requireObject(event, objectId)
    }

    const id = uid()
    const ext = ALLOWED[mime] ?? extname(file!.filename ?? '') ?? ''
    const path = join(FILES_DIR, `${id}${ext}`)
    mkdirSync(FILES_DIR, { recursive: true })
    writeFileSync(path, file!.data)

    useDb()
      .prepare(
        `INSERT INTO attachments (id, kind, object_id, operation_id, filename, mime, size, path, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, kind, objectId, operationId,
        text(file!.filename ?? 'файл', 'имя файла', { max: 200 }),
        mime, file!.data.length, path, new Date().toISOString(), user.id,
      )

    audit('attachment', id, 'create', { kind, objectId, operationId, size: file!.data.length }, user.id)
    return { id, kind, size: file!.data.length }
  })
})
