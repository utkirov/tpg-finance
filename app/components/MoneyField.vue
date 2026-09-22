<script setup lang="ts">
import {
  CURRENCIES, currencyIcon, currencyLabel, formatMoney, otherCurrency, parseMoney, toObjectCurrency,
} from '#shared/calc'

/**
 * Сумма с выбором валюты. Вводить можно в долларах или в сумах,
 * наружу всегда уходит сумма в валюте объекта — по курсу объекта.
 * Курс показан рядом: видно, из чего получилось число.
 */
const props = defineProps<{
  modelValue: string
  /** Валюта объекта — в ней ведётся учёт и в ней отдаётся значение. */
  currency: string
  /** Курс объекта: сколько сумов за доллар. */
  rate: number
  label: string
  id: string
  big?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useT()

const cur = ref(props.currency.toUpperCase())
const raw = ref(props.modelValue)
const own = ref(false)

// Родитель поменял значение сам (открыл форму, подставил сумму) — показываем его.
watch(() => props.modelValue, (v) => {
  if (own.value) { own.value = false; return }
  cur.value = props.currency.toUpperCase()
  raw.value = v
})

const base = computed(() => props.currency.toUpperCase())
const other = computed(() => otherCurrency(base.value))
const foreign = computed(() => cur.value !== base.value)

/** Сумма в валюте объекта из того, что набрано. */
function toBaseText(text: string, from: string): string {
  const n = parseMoney(text)
  if (n == null) return ''
  return formatMoney(toObjectCurrency(n, from, base.value, props.rate), base.value)
}

function push() {
  own.value = true
  emit('update:modelValue', foreign.value ? toBaseText(raw.value, cur.value) : raw.value)
}

watch(raw, push)

/** Переключили валюту — показываем ту же сумму в новой. */
function setCurrency(code: string) {
  if (cur.value === code) return
  if (code !== base.value && !props.rate) return
  const n = parseMoney(raw.value)
  if (n != null && props.rate) {
    const inBase = toObjectCurrency(n, cur.value, base.value, props.rate)
    raw.value = formatMoney(
      code === base.value ? inBase : toObjectCurrency(inBase, base.value, code, props.rate),
      code,
    )
  }
  cur.value = code
  push()
}

const hint = computed(() => {
  const n = parseMoney(raw.value)
  if (n == null || !props.rate) return ''
  const shown = foreign.value
    ? toObjectCurrency(n, cur.value, base.value, props.rate)
    : toObjectCurrency(n, base.value, other.value, props.rate)
  const code = foreign.value ? base.value : other.value
  return t('≈ {amount} {currency} по курсу {rate}', {
    amount: formatMoney(shown, code),
    currency: currencyLabel(code),
    rate: props.rate.toLocaleString('ru-RU'),
  })
})
</script>

<template>
  <div class="f">
    <label :for="id">{{ label }}</label>
    <div class="pick">
      <input
        :id="id"
        v-model="raw"
        v-mask="'money'"
        class="num"
        :class="{ big }"
        inputmode="decimal"
        autocomplete="off"
        placeholder="0,00"
      >
      <div class="seg cur">
        <button
          v-for="c in CURRENCIES"
          :key="c"
          type="button"
          :aria-pressed="cur === c"
          :aria-label="currencyLabel(c)"
          :disabled="c !== base && !rate"
          :title="c !== base && !rate ? t('Сначала укажите курс объекта') : currencyLabel(c)"
          @click="setCurrency(c)"
        >
          <Icon :name="currencyIcon(c)" />
        </button>
      </div>
    </div>
    <p v-if="hint" class="hint" style="margin-top: 6px">{{ hint }}</p>
    <p v-else-if="!rate" class="hint" style="margin-top: 6px">
      {{ t('Курс объекта не задан — вторую валюту выбрать нельзя.') }}
    </p>
  </div>
</template>

<style scoped>
.seg.cur { flex: none; width: 104px; }
.seg.cur button { min-height: 52px; }
</style>
