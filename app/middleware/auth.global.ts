/** Без сессии доступен только вход; с временным паролем — только профиль. */
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, loaded, mustChange, refresh } = useFinance()
  if (!loaded.value) await refresh()

  if (!me.value && to.path !== '/login') return navigateTo('/login')
  if (me.value && to.path === '/login') return navigateTo('/')
  if (me.value && mustChange.value && to.path !== '/profile') return navigateTo('/profile')
})
