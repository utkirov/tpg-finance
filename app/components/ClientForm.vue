<script setup lang="ts">
import { CLIENT_SOURCES, type Client } from '#shared/calc'

const props = defineProps<{ open: boolean; client?: Client | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()

const { send } = useFinance()
const { t } = useT()
const err = useErr()

const form = reactive({ name: '', phone: '', phone2: '', email: '', source: '', note: '' })
const error = ref('')
const busy = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    const c = props.client
    error.value = ''
    Object.assign(form, {
      name: c?.name ?? '',
      phone: c?.phone ?? '',
      phone2: c?.phone2 ?? '',
      email: c?.email ?? '',
      source: c?.source ?? '',
      note: c?.note ?? '',
    })
  },
  { immediate: true },
)

async function save() {
  error.value = ''
  if (!form.name.trim()) return (error.value = t('Укажите фамилию, имя и отчество'))

  busy.value = true
  try {
    const { id } = await send<{ id: string }>('/api/clients', {
      method: 'POST',
      body: { id: props.client?.id, ...form },
    })
    emit('saved', id)
    emit('close')
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="client ? t('Клиент') : t('Новый клиент')"
    icon="ph:identification-card"
    @close="emit('close')"
  >
    <div class="f">
      <label for="cl-name">{{ t('Фамилия, имя, отчество') }}</label>
      <input id="cl-name" v-model="form.name" autocomplete="off">
    </div>

    <div class="row2">
      <div class="f">
        <label for="cl-phone">{{ t('Телефон') }}</label>
        <input id="cl-phone" v-model="form.phone" v-mask="'phone'" inputmode="tel" placeholder="+998 (__) ___-__-__">
      </div>
      <div class="f">
        <label for="cl-source">{{ t('Откуда пришёл') }}</label>
        <select id="cl-source" v-model="form.source">
          <option value="">{{ t('— не указано —') }}</option>
          <option v-for="src in CLIENT_SOURCES" :key="src" :value="src">{{ t(src) }}</option>
        </select>
      </div>
    </div>

    <MoreFields>
      <div class="row2">
        <div class="f">
          <label for="cl-phone2">{{ t('Второй телефон') }}</label>
          <input id="cl-phone2" v-model="form.phone2" v-mask="'phone'" inputmode="tel" placeholder="+998 (__) ___-__-__">
        </div>
        <div class="f">
          <label for="cl-email">{{ t('Почта') }}</label>
          <input id="cl-email" v-model="form.email" type="email" autocomplete="off">
        </div>
      </div>

      <div class="f">
        <label for="cl-note">{{ t('Комментарий') }}</label>
        <input id="cl-note" v-model="form.note" autocomplete="off">
      </div>
    </MoreFields>

    <p v-if="error" class="err">{{ error }}</p>

    <div class="acts">
      <button type="button" class="btn ghost" @click="emit('close')">{{ t('Отмена') }}</button>
      <button type="button" class="btn pri" :disabled="busy" @click="save">
        <Icon name="ph:check" />{{ t('Сохранить') }}
      </button>
    </div>
  </AppDialog>
</template>
