import { pruneSessions } from '../utils/auth'
import { offsiteConfigured, runBackup, sendOffsite } from '../utils/backup'
import { useDb } from '../utils/db'

/** База поднимается на старте, копия и уборка сессий — раз в сутки. */
export default defineNitroPlugin(() => {
  useDb()

  const daily = () => {
    try {
      const made = runBackup()
      pruneSessions()
      if (made) {
        console.info(`[финансы] резервная копия: ${made}`)
        // Копия вне сервера — в фоне: ошибка сети не должна мешать работе.
        if (offsiteConfigured()) {
          sendOffsite(made)
            .then(r => console.info(`[финансы] копия в Telegram: ${r === 'sent' ? 'отправлена' : r === 'too-big' ? 'больше 50 МБ, не отправлена' : 'пропущена'}`))
            .catch(e => console.error('[финансы] копия в Telegram не отправлена:', e))
        }
      }
    } catch (e) {
      console.error('[финансы] резервная копия не сделана:', e)
    }
  }

  daily()
  const timer = setInterval(daily, 864e5)
  timer.unref?.()
})
