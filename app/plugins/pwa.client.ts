/** Регистрация service worker: приложение ставится на телефон как PWA. */
export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator) || import.meta.dev) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Без service worker приложение работает как обычный сайт — молча продолжаем.
    })
  })
})
