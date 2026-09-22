<script setup lang="ts">
const { request, answer } = useAsk()
const { t } = useT()
const value = ref('')
const input = ref<HTMLInputElement>()

watch(request, async (req) => {
  if (!req) return
  value.value = ''
  if (req.label) {
    await nextTick()
    input.value?.focus()
  }
})

function confirm() {
  if (request.value?.label && !value.value.trim()) {
    input.value?.focus()
    return
  }
  answer(request.value?.label ? value.value.trim() : 'ok')
}
</script>

<template>
  <AppDialog :open="!!request" :title="request?.title ?? ''" :icon="request?.notice ? 'ph:info' : 'ph:question'" @close="answer(null)">
    <p v-if="request?.body" class="hint" style="margin: 0">{{ request.body }}</p>
    <div v-if="request?.label" class="f">
      <label for="ask-input">{{ request.label }}</label>
      <input id="ask-input" ref="input" v-model="value" autocomplete="off" @keydown.enter.prevent="confirm">
    </div>
    <div class="acts">
      <button v-if="!request?.notice" type="button" class="btn ghost" @click="answer(null)">{{ t('Отмена') }}</button>
      <button type="button" class="btn pri" @click="confirm">{{ request?.ok ?? t('Подтвердить') }}</button>
    </div>
  </AppDialog>
</template>
