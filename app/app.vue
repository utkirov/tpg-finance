<script setup lang="ts">
import { ROLE_NAME } from '#shared/roles'
import type { Lang } from '#shared/i18n'
import { currencyIcon, currencyLabel } from '#shared/calc'

const route = useRoute()
const { me, can, state, objectById, stageById } = useFinance()
const { t, lang, LANGS } = useT()
const { shown, rate, CURRENCIES, converted } = useMoney()

const bare = computed(() => route.path === '/login')

// Заголовок вкладки тоже на языке интерфейса.
useHead({
  title: () => t('Касса объектов'),
  htmlAttrs: { lang: () => lang.value },
})

const links = computed(() => {
  const out = [{ to: '/', label: 'Объекты', icon: 'ph:buildings' }]
  if (can.value.seeContract) out.push({ to: '/clients', label: 'Клиенты', icon: 'ph:identification-card' })
  out.push({ to: '/obligations', label: 'Выплаты', icon: 'ph:clock-countdown' })
  if (can.value.seeAllShares) out.push({ to: '/reports', label: 'Отчёты', icon: 'ph:chart-bar' })
  if (can.value.seeAllShares) out.push({ to: '/people', label: 'Люди', icon: 'ph:users-three' })
  if (can.value.manage) out.push({ to: '/settings', label: 'Справочники', icon: 'ph:gear-six' })
  return out
})

const isOn = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

const crumbs = computed(() => {
  const trail: Array<{ label: string; to: string }> = []
  const id = String(route.params.id ?? '')

  if (route.path.startsWith('/objects/')) {
    const obj = objectById(id)
    if (obj) trail.push({ label: obj.name, to: `/objects/${obj.id}` })
  }
  if (route.path.startsWith('/stages/')) {
    const stage = stageById(id)
    if (stage) {
      const obj = objectById(stage.objectId)
      if (obj) trail.push({ label: obj.name, to: `/objects/${obj.id}` })
      trail.push({ label: `${t('Этап')} ${stage.number}`, to: `/stages/${stage.id}` })
    }
  }
  if (route.path.startsWith('/people/') && id) trail.push({ label: t('Люди'), to: '/people' })
  if (route.path.startsWith('/clients/') && id) {
    const c = state.value.clients.find(x => x.id === id)
    trail.push({ label: t('Клиенты'), to: '/clients' })
    if (c) trail.push({ label: c.name, to: `/clients/${c.id}` })
  }
  return trail
})

const showCrumbs = computed(() => crumbs.value.length > 0 && !route.path.endsWith('/act'))
</script>

<template>
  <div>
    <template v-if="bare">
      <NuxtPage />
    </template>

    <template v-else>
      <header class="top no-print">
        <div class="wrap top-in">
          <NuxtLink to="/" class="brand" :title="t('Касса объектов')">
            <Icon name="ph:vault" />
            <span class="lbl">{{ t('Касса объектов') }}</span>
          </NuxtLink>

          <nav class="nav" aria-label="разделы">
            <NuxtLink
              v-for="l in links"
              :key="l.to"
              :to="l.to"
              :title="t(l.label)"
              :class="{ on: isOn(l.to) }"
            >
              <Icon :name="l.icon" />
              <span class="lbl">{{ t(l.label) }}</span>
            </NuxtLink>
          </nav>

          <div class="top-act">
            <div
              class="seg-sm"
              role="group"
              :aria-label="t('Валюта показа')"
              :title="t('Пересчёт по курсу {rate} — только для показа', { rate: rate.toLocaleString('ru-RU') })"
            >
              <button
                v-for="c in CURRENCIES"
                :key="c"
                type="button"
                :aria-pressed="shown === c"
                :aria-label="currencyLabel(c)"
                :title="currencyLabel(c)"
                @click="shown = c"
              >
                <Icon :name="currencyIcon(c)" />
              </button>
            </div>

            <div class="seg-sm" role="group" :aria-label="t('Язык')">
              <button
                v-for="(name, code) in LANGS"
                :key="code"
                type="button"
                :aria-pressed="lang === code"
                :title="name"
                @click="lang = code as Lang"
              >
                {{ String(code).toUpperCase() }}
              </button>
            </div>

            <NuxtLink to="/profile" class="who" :title="t('Профиль')">
              <Icon name="ph:user-circle" />
              <span>
                <b>{{ me?.name }}</b>
                {{ me ? t(ROLE_NAME[me.role]) : '' }}
              </span>
            </NuxtLink>
          </div>
        </div>
      </header>

      <main class="wrap">
        <nav v-if="showCrumbs" class="crumbs no-print" aria-label="навигация">
          <NuxtLink to="/">{{ t('Объекты') }}</NuxtLink>
          <template v-for="c in crumbs" :key="c.to">
            <Icon name="ph:caret-right" />
            <NuxtLink :to="c.to">{{ c.label }}</NuxtLink>
          </template>
        </nav>

        <p v-if="converted" class="hint no-print" style="margin-top: 12px">
          {{ t('Показ в {currency} по курсу {rate} · учёт в {base}', {
            currency: currencyLabel(shown),
            rate: rate.toLocaleString('ru-RU'),
            base: currencyLabel(state.settings.currency),
          }) }}
          <NuxtLink v-if="can.manage" to="/settings">{{ t('изменить курс') }}</NuxtLink>
        </p>

        <div v-if="state.mustChange" class="note g no-print" style="margin-top: 14px">
          <Icon name="ph:lock-key" />
          <div>
            <b>{{ t('Временный пароль') }}.</b>
            <NuxtLink to="/profile">{{ t('Смените его') }}</NuxtLink>
          </div>
        </div>

        <NuxtPage />
      </main>

      <nav class="tabs no-print" aria-label="разделы">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" :class="{ on: isOn(l.to) }">
          <span class="ind"><Icon :name="l.icon" /></span>
          <span class="lbl">{{ t(l.label) }}</span>
        </NuxtLink>
      </nav>

      <AskDialog />
    </template>
  </div>
</template>
