import { isProxy, markRaw, toRaw } from 'vue'

/**
 * Состояние из payload после гидратации ещё глубоко реактивно: Vue оборачивает
 * каждую операцию ленты. Когда страница ожила, снимаем обёртку один раз —
 * дальше refresh() и так кладёт состояние помеченным markRaw.
 * Во время самой гидратации трогать его нельзя: это меняет состояние
 * посреди отрисовки и даёт расхождение с HTML сервера.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:suspense:resolve', () => {
    const data = useState<object>('finance')
    if (data.value && isProxy(data.value)) data.value = markRaw(toRaw(data.value))
  })
})
