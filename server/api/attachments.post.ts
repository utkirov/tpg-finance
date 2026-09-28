import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { visibleOp } from '#shared/visibility'
import { FILES_DIR } from '../utils/db'

/** Фото чека, договор, расписка, страница блокнота — до 10 МБ. */
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
}

/**
 * Тип файла по первым байтам. Заголовку Content-Type из формы верить нельзя:
 * его пишет клиент, и под «image/png» может приехать что угодно.
 */
function sniff(data: Buffer): string | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => data[offset + i] === b)
  if (at(0, [0xFF, 0xD8, 0xFF])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2D])) return 'application/pdf'
  // HEIC: коробка ftyp с брендом heic/heix/mif1/msf1 и т. п.
  if (at(4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = data.subarray(8, 12).toString('latin1')
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const parts = await readMultipartFormData(event)
  must(parts?.length, 'Файл не получен')

  const field = (name: string) => parts!.find(p => p.name === name && !p.filename)?.data.toString('utf8').trim() || ''
  const file = parts!.find(p => p.filename && p.data?.length)
  must(file, 'Файл не получен')

  must(file!.data.length <= MAX_BYTES, 'Файл больше 10 МБ — сожмите изображение')
  // Тип определяем по содержимому, а не по заявленному браузером.
  const mime = sniff(file!.data) ?? ''
  must(ALLOWED[mime], 'Принимаются только JPEG, PNG, WebP, HEIC и PDF')

  const kind = oneOf(field('kind') || 'прочее', ['договор', 'расписка', 'чек', 'фото', 'прочее'] as const, 'тип файла')
  const objectId = field('objectId') || null
  const operationId = field('operationId') || null
  must(objectId || operationId, 'Файл нужно привязать к объекту или операции')

  return tx(() => {
    if (operationId) {
      const op = getOp(operationId) ?? notFound('Операция')
      requireObject(event, op.objectId)
      // К строке, которую роль не видит (приход для прораба), файл не прикрепить.
      if (!visibleOp(op, user)) notFound('Операция')
    }
    if (objectId) {
      getObject(objectId) ?? notFound('Объект')
      requireObject(event, objectId)
    }

    const id = uid()
    const path = join(FILES_DIR, `${id}${ALLOWED[mime]}`)

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

    // Файл пишется последним: если проверки или запись в базу упали,
    // на диске не остаётся сироты. Упадёт запись файла — откатится строка в базе.
    mkdirSync(FILES_DIR, { recursive: true })
    writeFileSync(path, file!.data)

    audit('attachment', id, 'create', { kind, objectId, operationId, size: file!.data.length }, user.id)
    return { id, kind, size: file!.data.length }
  })
})
