<script setup lang="ts">
import type { Lang } from '#shared/i18n'

const { refresh } = useFinance()
const { t, lang, LANGS } = useT()
const err = useErr()

const form = reactive({ login: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (!form.login.trim()) return (error.value = t('Введите логин'))
  if (!form.password) return (error.value = t('Введите пароль'))

  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { login: form.login, password: form.password } })
    await refresh()
    await navigateTo('/')
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="login" @submit.prevent="submit">
      <div style="display: flex; align-items: flex-start; gap: 10px">
        <div style="flex: 1">
          <div class="brand"><Icon name="ph:vault" />{{ t('Касса объектов') }}</div>
          <p class="hint" style="margin-top: 6px">{{ t('Учёт финансов по строительным объектам') }}</p>
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
      </div>

      <div class="f">
        <label for="login">{{ t('Логин') }}</label>
        <input
          id="login"
          v-model="form.login"
          v-mask="'login'"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="next"
        >
      </div>

      <div class="f">
        <label for="password">{{ t('Пароль') }}</label>
        <input id="password" v-model="form.password" type="password" autocomplete="current-password" enterkeyhint="go">
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <button type="submit" class="btn pri" :disabled="busy" style="min-height: 48px">
        <Icon name="ph:sign-in" />
        {{ busy ? t('Проверяем…') : t('Войти') }}
      </button>

      <p class="hint">
        {{ t('Вход по телефону и коду появится вместе с SMS-шлюзом — пока только логин и пароль.') }}
      </p>
    </form>
  </div>
</template>
