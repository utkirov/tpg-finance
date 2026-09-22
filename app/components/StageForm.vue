<script setup lang="ts">
import { money, parseMoney, stagesOf, type Obj, type Stage } from '#shared/calc'

const props = defineProps<{ open: boolean; object: Obj; stage?: Stage | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()

const { state, send } = useFinance()
const { t } = useT()
const err = useErr()

const form = reactive({ name: '', amount: '' })
const error = ref('')
const busy = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = ''
    form.name = props.stage?.name ?? ''
    form.amount = props.stage ? money(props.stage.amount) : ''
  },
  { immediate: true },
)

const free = computed(() => {
  const used = stagesOf(state.value.stages, props.object.id).reduce(
    (a, s) => a + (props.stage && s.id === props.stage.id ? 0 : s.amount),
    0,
  )
  return props.object.contractAmount - used
})

async function save() {
  error.value = ''
  const amount = parseMoney(form.amount)
  if (amount == null || amount <= 0) return (error.value = t('Проверьте сумму этапа'))

  busy.value = true
  try {
    const { id } = await send<{ id: string }>('/api/stages', {
      method: 'POST',
      body: { id: props.stage?.id, objectId: props.object.id, name: form.name, amount },
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
    :title="stage ? `${t('Этап')} ${stage.number}` : t('Новый этап')"
    icon="ph:list-checks"
    @close="emit('close')"
  >
    <div class="row2">
      <div class="f">
        <label for="st-name">{{ t('Название') }}</label>
        <input id="st-name" v-model="form.name" :placeholder="t('необязательно')">
      </div>
      <MoneyField
        id="st-amount"
        v-model="form.amount"
        :label="t('Сумма этапа')"
        :currency="object.currency"
        :rate="object.rate"
      />
    </div>
    <p class="hint">{{ t('Свободно по договору: {amount}', { amount: money(free) }) }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <div class="acts">
      <button type="button" class="btn ghost" @click="emit('close')">{{ t('Отмена') }}</button>
      <button type="button" class="btn pri" :disabled="busy" @click="save">
        <Icon name="ph:check" />{{ t('Сохранить') }}
      </button>
    </div>
  </AppDialog>
</template>
