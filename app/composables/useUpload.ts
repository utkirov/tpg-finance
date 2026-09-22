/** Сжатие изображений на клиенте и загрузка вложений. Предел сервера — 10 МБ. */

const MAX_SIDE = 1600
const QUALITY = 0.82

export async function compressImage(file: File): Promise<Blob> {
  const compressible = /^image\/(jpeg|png|webp)$/.test(file.type)
  if (!compressible || typeof createImageBitmap !== 'function') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 900_000) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file // не вышло сжать — отправим как есть, сервер сам решит
  }
}

export interface UploadTarget {
  operationId?: string
  objectId?: string
  kind?: 'договор' | 'расписка' | 'чек' | 'фото' | 'прочее'
}

/** Возвращает список ошибок по файлам; пустой — всё загрузилось. */
export async function uploadFiles(files: File[], target: UploadTarget): Promise<string[]> {
  const problems: string[] = []

  for (const file of files) {
    try {
      const blob = await compressImage(file)
      const body = new FormData()
      body.append('file', blob, blob === file ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg')
      body.append('kind', target.kind ?? 'чек')
      if (target.operationId) body.append('operationId', target.operationId)
      if (target.objectId) body.append('objectId', target.objectId)
      await $fetch('/api/attachments', { method: 'POST', body })
    } catch (e) {
      problems.push(`${file.name}: ${errText(e)}`)
    }
  }

  return problems
}
