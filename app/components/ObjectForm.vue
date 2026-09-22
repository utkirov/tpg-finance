<script setup lang="ts">
import { CURRENCIES, MAX_BONUS_RATE, currencyIcon, currencyLabel, money, money0, parseMoney, parseRate, rateFor, type BasisType, type Obj } from '#shared/calc'

const props = defineProps<{ open: boolean; object?: Obj | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()

const { settings, can, send, refresh } = useFinance()
const { t } = useT()
const err = useErr()

const form = reactive({
  name: '', clientId: '', customer: '', address: '', amount: '',
  currency: 'USD', basisType: 'договор' as BasisType, basisNote: '',
  bonusPersonId: '', rate: '', rateReason: '', objRate: '',
})
const basisFile = ref<File[]>([])
const error = ref('')
const busy = ref(false)

/* ---------- человек, которого нет в списке ---------- */

const addingPerson = ref(false)
const newPerson = ref('')

async function addPerson() {
  const name = newPerson.value.trim()
  if (!name) return
  busy.value = true
  try {
    const res = await send<{ id: string }>('/api/people', { method: 'POST', body: { name } })
    await refresh()
    form.bonusPersonId = res.id
    newPerson.value = ''
    addingPerson.value = false
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}
const rateTouched = ref(false)

/** Курс объекта: свой, а без него — справочный из справочников. */
const objRate = computed(() => parseRate(form.objRate) || Number(settings.value.displayRate) || 0)
const ratePlaceholder = computed(() => String(settings.value.displayRate || 12000))

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    const o = props.object
    error.value = ''
    rateTouched.value = false
    basisFile.value = []
    Object.assign(form, {
      name: o?.name ?? '',
      clientId: o?.clientId ?? '',
      customer: o?.customer ?? '',
      address: o?.address ?? '',
      amount: o ? money(o.contractAmount) : '',
      currency: o?.currency ?? settings.value.currency ?? 'USD',
      basisType: o?.basisType ?? 'договор',
      basisNote: o?.basisNote ?? '',
      bonusPersonId: o?.bonusPersonId ?? '',
      rate: o ? String(o.bonusRate) : '',
      objRate: o?.rate ? String(o.rate) : '',
      rateReason: '',
    })
  },
  { immediate: true },
)

const amountCents = computed(() => parseMoney(form.amount))
const suggested = computed(() => (amountCents.value == null ? null : rateFor(settings.value.bonusScale, amountCents.value)))
const manualRate = computed(() => suggested.value != null && parseRate(form.rate) !== suggested.value)

const scaleHint = computed(() => {
  if (amountCents.value == null || suggested.value == null) return ''
  return t('По шкале для {amount} — ставка {rate} %. В объекте она фиксируется вместе с версией шкалы.', {
    amount: money0(amountCents.value),
    rate: suggested.value,
  })
})

// Ставка подставляется из шкалы, пока владелец не задал её руками.
watch(amountCents, (cents) => {
  if (props.object || rateTouched.value || cents == null) return
  form.rate = String(rateFor(settings.value.bonusScale, cents))
})

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  basisFile.value = Array.from(input.files ?? [])
  input.value = ''
}

async function save() {
  error.value = ''
  const amount = amountCents.value
  const rate = parseRate(form.rate)
  if (!form.name.trim()) return (error.value = t('Название обязательно'))
  if (amount == null || amount < 0) return (error.value = t('Проверьте сумму договора'))
  if (rate == null) return (error.value = t('Проверьте ставку бонуса'))
  if (rate > MAX_BONUS_RATE) return (error.value = t('Ставка бонуса выше {max} % не сохраняется', { max: MAX_BONUS_RATE }))
  if (manualRate.value && !form.rateReason.trim()) {
    return (error.value = t('Ставка отличается от шкалы — укажите причину, она попадёт в журнал'))
  }

  busy.value = true
  try {
    const { id } = await send<{ id: string }>('/api/objects', {
      method: 'POST',
      body: {
        id: props.object?.id,
        name: form.name,
        clientId: form.clientId || null,
        customer: form.customer,
        address: form.address,
        contractAmount: amount,
        currency: form.currency.toUpperCase(),
        basisType: form.basisType,
        basisNote: form.basisNote,
        bonusPersonId: form.bonusPersonId || null,
        bonusRate: rate,
        rate: parseRate(form.objRate) || 0,
        rateReason: form.rateReason,
      },
    })

    if (basisFile.value.length) {
      await uploadFiles(basisFile.value, { objectId: id, kind: form.basisType === 'расписка' ? 'расписка' : 'договор' })
      await refresh()
    }

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
  <AppDialog :open="open" :title="object ? t('Объект') : t('Новый объект')" icon="ph:buildings" @close="emit('close')">
    <ClientPicker v-model="form.clientId" />

    <div class="row2">
      <div class="f">
        <label for="ob-name">{{ t('Название') }}</label>
        <input id="ob-name" v-model="form.name" :placeholder="t('Объект')">
      </div>
      <div v-if="!form.clientId" class="f">
        <label for="ob-customer">{{ t('Заказчик') }}</label>
        <input id="ob-customer" v-model="form.customer" :placeholder="t('если клиента нет в CRM')">
      </div>
    </div>

    <div class="row2">
      <div class="f">
        <label>{{ t('Валюта учёта') }}</label>
        <div class="seg">
          <button
            v-for="c in CURRENCIES"
            :key="c"
            type="button"
            :aria-pressed="form.currency === c"
            :aria-label="currencyLabel(c)"
            :title="currencyLabel(c)"
            @click="form.currency = c"
          >
            <Icon :name="currencyIcon(c)" />
          </button>
        </div>
      </div>
      <div class="f">
        <label for="ob-rate">{{ t('Курс объекта: сколько SUM за 1 USD') }}</label>
        <input
          id="ob-rate"
          v-model="form.objRate"
          v-mask="'rate'"
          class="num"
          inputmode="decimal"
          autocomplete="off"
          :placeholder="ratePlaceholder"
        >
      </div>
    </div>

    <MoneyField
      id="ob-amount"
      v-model="form.amount"
      :label="t('Сумма договора')"
      :currency="form.currency"
      :rate="objRate"
    />

    <div class="row2">
      <div class="f">
        <label for="ob-bonus-person">{{ t('Получатель бонуса') }}</label>
        <div class="pick">
          <select id="ob-bonus-person" v-model="form.bonusPersonId">
            <option value="">{{ t('— не выбран —') }}</option>
            <option v-for="p in settings.people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button v-if="can.manage" type="button" class="icon-btn" :title="t('Новый человек')" @click="addingPerson = !addingPerson">
            <Icon name="ph:plus" />
          </button>
        </div>
        <div v-if="addingPerson" class="pick" style="margin-top: 8px">
          <input v-model="newPerson" :placeholder="t('Имя человека')" @keyup.enter="addPerson">
          <button type="button" class="btn sm tonal" :disabled="busy" @click="addPerson">
            <Icon name="ph:check" />{{ t('Добавить') }}
          </button>
        </div>
      </div>
      <div class="f">
        <label for="ob-rate">{{ t('Ставка бонуса, %') }}</label>
        <input
          id="ob-rate"
          v-model="form.rate"
          v-mask="'percent'"
          class="num"
          inputmode="decimal"
          placeholder="0"
          @input="rateTouched = true"
        >
      </div>
    </div>
    <p v-if="scaleHint" class="hint">{{ scaleHint }}</p>
    <p class="hint">
      {{ t('Курс объекта — справочный: по нему суммы показываются во второй валюте. У операции курс свой, на её дату.') }}
    </p>

    <div v-if="manualRate" class="f">
      <label for="ob-reason">{{ t('Причина отклонения от шкалы') }}</label>
      <input id="ob-reason" v-model="form.rateReason" :placeholder="t('почему ставка другая')">
    </div>

    <MoreFields>
      <div class="f">
        <label for="ob-address">{{ t('Адрес') }}</label>
        <input id="ob-address" v-model="form.address">
      </div>

      <div class="f">
        <label for="ob-basis">{{ t('Основание') }}</label>
        <select id="ob-basis" v-model="form.basisType">
          <option value="договор">{{ t('договор') }}</option>
          <option value="расписка">{{ t('расписка') }}</option>
          <option value="устно">{{ t('устно') }}</option>
        </select>
      </div>

      <div v-if="form.basisType === 'устно'" class="f">
        <label for="ob-note">{{ t('Условия, если договорённость устная') }}</label>
        <input id="ob-note" v-model="form.basisNote">
      </div>

      <div v-else class="f">
        <label for="ob-file">{{ t('Документ-основание') }}</label>
        <label class="drop" for="ob-file">
          <Icon name="ph:paperclip" />
          {{ basisFile.length ? basisFile[0]!.name : t('Прикрепить договор или расписку') }}
        </label>
        <input id="ob-file" type="file" accept="image/*,application/pdf" class="sr" @change="addFiles">
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
