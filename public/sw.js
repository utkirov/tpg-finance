// Service worker: кэшируется только статика приложения, страницы и данные — никогда.
//
// Страница, отрисованная сервером, несёт в себе состояние пользователя
// (суммы, доли, люди). В Cache Storage она пережила бы выход из учётки,
// и на общем телефоне её открыл бы следующий человек. Поэтому HTML идёт
// только из сети, а без сети показывается нейтральная заглушка.
//
// ponytail: офлайн-ввод операций ТЗ не требует — при необходимости
// сюда добавляется очередь POST-запросов в IndexedDB.
const STATIC = 'static-v2'
const STATIC_FILES = ['/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']

const OFFLINE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Касса объектов</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;
background:#f4fbf8;color:#171d1b}@media (prefers-color-scheme:dark){body{background:#0e1513;color:#dde4e1}}
main{padding:24px;text-align:center;max-width:320px}</style></head>
<body><main><h1>Нет сети</h1><p>Касса работает только онлайн. Проверьте подключение и обновите страницу.</p>
<p lang="uz">Tarmoq yo‘q. Ulanishni tekshirib, sahifani yangilang.</p></main></body></html>`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(STATIC_FILES)))
  self.skipWaiting()
})

// Старые кэши (в том числе shell-v1 со страницами прежней версии) удаляются.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

const isStatic = (url) => url.pathname.startsWith('/_nuxt/') || STATIC_FILES.includes(url.pathname)

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Страницы: только сеть. Без сети — заглушка, а не чужие данные из кэша.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
    )
    return
  }

  if (!isStatic(url)) return

  // Сборка Nuxt с хэшем в имени не меняется: кэш, а при промахе — сеть.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(STATIC).then((c) => c.put(e.request, copy)).catch(() => {})
      }
      return res
    })),
  )
})
