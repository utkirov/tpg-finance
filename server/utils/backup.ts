import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DB_FILE, useDb } from './db'

/**
 * Ежедневная копия базы с хранением 30 дней — раздел 12 ТЗ.
 * VACUUM INTO делает целостный снимок на горячей базе,
 * останавливать приложение не нужно.
 */
const KEEP_DAYS = 30
export const BACKUP_DIR = join(dirname(DB_FILE), 'backups')

export function runBackup(): string | null {
  const stamp = new Date().toISOString().slice(0, 10)
  const target = join(BACKUP_DIR, `finance-${stamp}.db`)
  mkdirSync(BACKUP_DIR, { recursive: true })

  try {
    statSync(target)
    return null // копия за сегодня уже есть
  } catch {
    // копии нет — делаем
  }

  useDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  prune()
  return target
}

function prune() {
  const edge = Date.now() - KEEP_DAYS * 864e5
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.startsWith('finance-') || !name.endsWith('.db')) continue
    const path = join(BACKUP_DIR, name)
    if (statSync(path).mtimeMs < edge) unlinkSync(path)
  }
}
