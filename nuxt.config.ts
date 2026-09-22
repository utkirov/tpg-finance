import { fileURLToPath } from 'node:url'

const shared = fileURLToPath(new URL('./shared', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-09-17',
  devtools: { enabled: false },
  modules: ['@nuxt/icon'],
  css: ['~/assets/main.css'],

  // Phosphor лежит в проекте пакетом. В сборку попадают только те иконки,
  // что реально встречаются в коде: вся коллекция — это 9 тысяч штук.
  icon: {
    mode: 'svg',
    class: 'ic',
    size: '1.4em',
    serverBundle: false,
    clientBundle: { scan: true, sizeLimitKb: 512 },
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'Касса объектов',
      htmlAttrs: { lang: 'ru' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Учёт финансов по строительным объектам' },
        { name: 'theme-color', content: '#006a60' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Касса' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  // ponytail: алиас объявлен явно, чтобы не зависеть от версии соглашения о папке shared/
  alias: { '#shared': shared },
  nitro: { alias: { '#shared': shared } },
})
