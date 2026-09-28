import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DB_FILE, FILES_DIR, useDb } from './db'

/**
 * Ежедневная копия базы с хранением 30 дней — раздел 12 ТЗ.
 * VACUUM INTO делает целостный снимок на горячей базе,
 * останавливать приложение не нужно.
 *
 * Копия вместе с вложениями: база без чеков и договоров — половина учёта.
 * Файлы вложений не меняются и не удаляются (имя — uuid), поэтому в копию
 * докладываются только новые.
 *
 * Каталог копий задаётся FINANCE_BACKUP_DIR. По умолчанию он рядом с базой,
 * то есть на том же диске, — от поломки диска это не спасает, поэтому
 * в продакшене его стоит направить на другой диск или смонтированное хранилище.
 */
const KEEP_DAYS = 30
export const BACKUP_DIR = resolve(process.env.FINANCE_BACKUP_DIR || join(dirname(DB_FILE), 'backups'))

export function runBackup(): string | null {
  const stamp = new Date().toISOString().slice(0, 10)
  const target = join(BACKUP_DIR, `finance-${stamp}.db`)
  mkdirSync(BACKUP_DIR, { recursive: true })

  // Вложения докладываем при каждом запуске — это дёшево: только новые файлы.
  copyAttachments()

  if (existsSync(target)) return null // копия базы за сегодня уже есть

  useDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  prune()
  return target
}

function copyAttachments() {
  if (!existsSync(FILES_DIR)) return
  const into = join(BACKUP_DIR, 'files')
  mkdirSync(into, { recursive: true })
  for (const name of readdirSync(FILES_DIR)) {
    const to = join(into, name)
    if (!existsSync(to)) copyFileSync(join(FILES_DIR, name), to)
  }
}

function prune() {
  const edge = Date.now() - KEEP_DAYS * 864e5
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.startsWith('finance-') || !name.endsWith('.db')) continue
    const path = join(BACKUP_DIR, name)
    if (statSync(path).mtimeMs < edge) unlinkSync(path)
  }
}

/* ---------- копия вне сервера: Telegram ---------- */

/**
 * Копия на том же сервере не спасает, если пропал сам сервер. Если заданы
 * FINANCE_TG_TOKEN (токен бота от @BotFather) и FINANCE_TG_CHAT (id чата или
 * канала, куда бот добавлен), свежая копия базы сжимается и уходит туда
 * документом. Лимит Telegram для ботов — 50 МБ; больше — не шлём и пишем в лог.
 *
 * Вложения (фото чеков) в Telegram не отправляются: их много и они большие.
 * Для них копия — каталог backups/files, его стоит держать на другом диске.
 */
const TG_LIMIT = 49 * 1024 * 1024

export function offsiteConfigured(): boolean {
  return !!(process.env.FINANCE_TG_TOKEN && process.env.FINANCE_TG_CHAT)
}

export async function sendOffsite(path: string): Promise<'sent' | 'skipped' | 'too-big'> {
  const token = process.env.FINANCE_TG_TOKEN
  const chat = process.env.FINANCE_TG_CHAT
  if (!token || !chat) return 'skipped'

  const packed = gzipSync(readFileSync(path))
  if (packed.length > TG_LIMIT) return 'too-big'

  const form = new FormData()
  form.append('chat_id', chat)
  form.append('caption', `Касса объектов: копия базы ${basename(path)}`)
  form.append('document', new Blob([packed], { type: 'application/gzip' }), `${basename(path)}.gz`)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Telegram ответил ${res.status}`)
  return 'sent'
}
