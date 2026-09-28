/** Без сессии доступен только вход; с временным паролем — только профиль. */
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, state, loaded, refresh } = useFinance()
  if (!loaded.value) await refresh()

  if (!me.value && to.path !== '/login') return navigateTo('/login')
  if (me.value && to.path === '/login') return navigateTo('/')
  if (me.value && state.value.mustChange && to.path !== '/profile') return navigateTo('/profile')
})
