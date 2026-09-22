<script setup lang="ts">
import { ROLE_NAME } from '#shared/roles'
import type { Lang } from '#shared/i18n'

const { me, state, refresh } = useFinance()
const { t, lang, LANGS } = useT()
const err = useErr()

const form = reactive({ current: '', next: '', repeat: '' })
const message = reactive({ text: '', bad: false })
const busy = ref(false)

async function changePassword() {
  message.text = ''
  if (form.next.length < 8) return fail(t('Новый пароль — не короче 8 символов'))
  if (form.next !== form.repeat) return fail(t('Повтор не совпадает с новым паролем'))

  busy.value = true
  try {
    await $fetch('/api/auth/password', { method: 'POST', body: { current: form.current, next: form.next } })
    Object.assign(form, { current: '', next: '', repeat: '' })
    message.bad = false
    message.text = t('Пароль изменён.')
    await refresh()
  } catch (e) {
    fail(err(e))
  } finally {
    busy.value = false
  }
}

function fail(text: string) {
  message.bad = true
  message.text = text
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refresh()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ me?.name }}</h1>
        <p class="sub">{{ me ? t(ROLE_NAME[me.role]) : '' }} · {{ t('логин {login}', { login: me?.login ?? '' }) }}</p>
      </div>
      <button type="button" class="btn" @click="logout"><Icon name="ph:sign-out" />{{ t('Выйти') }}</button>
    </div>

    <section class="sect">
      <h2>{{ t('Язык') }}</h2>
      <div class="panel">
        <div class="chips">
          <button
            v-for="(name, code) in LANGS"
            :key="code"
            type="button"
            :aria-pressed="lang === code"
            @click="lang = code as Lang"
          >
            {{ name }}
          </button>
        </div>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Пароль') }}</h2>
      <div class="panel" style="display: grid; gap: 13px; max-width: 420px">
        <div v-if="state.mustChange" class="note g" style="margin: 0">
          <Icon name="ph:lock-key" />
          <div>
            <b>{{ t('Временный пароль') }}</b>
            {{ t('Он совпадает с логином и известен всем, кто читал инструкцию по запуску. Смените его.') }}
          </div>
        </div>

        <div class="f">
          <label for="pw-current">{{ t('Текущий пароль') }}</label>
          <input id="pw-current" v-model="form.current" type="password" autocomplete="current-password">
        </div>
        <div class="f">
          <label for="pw-next">{{ t('Новый пароль') }}</label>
          <input id="pw-next" v-model="form.next" type="password" autocomplete="new-password">
        </div>
        <div class="f">
          <label for="pw-repeat">{{ t('Повторите новый') }}</label>
          <input id="pw-repeat" v-model="form.repeat" type="password" autocomplete="new-password">
        </div>

        <p v-if="message.text" :class="message.bad ? 'err' : 'ok'">{{ message.text }}</p>

        <div>
          <button type="button" class="btn pri" :disabled="busy" @click="changePassword">
            <Icon name="ph:key" />{{ t('Сменить пароль') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
