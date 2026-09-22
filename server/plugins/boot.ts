import { pruneSessions } from '../utils/auth'
import { runBackup } from '../utils/backup'
import { useDb } from '../utils/db'

/** База поднимается на старте, копия и уборка сессий — раз в сутки. */
export default defineNitroPlugin(() => {
  useDb()

  const daily = () => {
    try {
      const made = runBackup()
      pruneSessions()
      if (made) console.info(`[финансы] резервная копия: ${made}`)
    } catch (e) {
      console.error('[финансы] резервная копия не сделана:', e)
    }
  }

  daily()
  const timer = setInterval(daily, 864e5)
  timer.unref?.()
})
