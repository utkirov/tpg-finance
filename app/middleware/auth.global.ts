/** Без сессии доступен только вход. */
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, loaded, refresh } = useFinance()
  if (!loaded.value) await refresh()

  if (!me.value && to.path !== '/login') return navigateTo('/login')
  if (me.value && to.path === '/login') return navigateTo('/')
})
