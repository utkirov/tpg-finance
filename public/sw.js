// Service worker: в кэше только статика сборки и значки.
//
// Страницы в кэш не кладём: сервер отрисовывает их вместе с состоянием,
// и HTML несёт суммы, доли и имена. В кэше браузера они пережили бы выход
// из приложения и достались бы следующему человеку за этим телефоном.
// ponytail: офлайн-ввод операций ТЗ не требует — при необходимости
// сюда добавляется очередь POST-запросов в IndexedDB.
const STATIC = 'static-v2'
const PRECACHE = ['/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']

const OFFLINE = `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Нет сети</title>
<body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center">
<div><h1 style="font-size:20px">Нет сети</h1><p>Касса объектов работает только онлайн — данные всегда свежие.<br>Tarmoq yoʻq — internetga ulaning.</p>
<button onclick="location.reload()" style="font:inherit;padding:10px 20px;border-radius:20px;border:0;background:#006a60;color:#fff">Повторить</button></div>`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  // Старый кэш shell-v1 хранил страницы с данными — удаляем его целиком.
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('message', (e) => {
  // Выход из приложения: чистим всё, что успели сохранить.
  if (e.data === 'logout') e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
})

const isStatic = (url) => url.pathname.startsWith('/_nuxt/') || PRECACHE.includes(url.pathname)

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Файлы сборки неизменяемы (имя с хэшем) — сначала кэш.
  if (isStatic(url)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(STATIC).then((c) => c.put(e.request, copy)).catch(() => {})
        }
        return res
      })),
    )
    return
  }

  // Страницы — только из сети; без сети — заглушка без данных.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })))
  }
})
