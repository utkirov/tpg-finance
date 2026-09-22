<script setup lang="ts">
import {
  CURRENCIES, KIND_NAME, categoriesFor, categoryGroups, currencyIcon, currencyLabel, dmy, money,
  parseMoney, parseRate, toBase, today,
  type Kind, type Note, type Obj, type OpStatus, type Stage,
} from '#shared/calc'
import { teamMembers } from '#shared/plan'

const props = defineProps<{ open: boolean; stage: Stage; object: Obj }>()
const emit = defineEmits<{ close: [] }>()

const { state, settings, can, send, refresh } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const err = useErr()

/** Порядок полей рассчитан на ввод одной рукой: сумма → тип → человек → категория → дата. */
const form = reactive({
  amount: '',
  kind: 'exp' as Kind,
  personId: null as string | null,
  categoryId: null as string | null,
  teamId: null as string | null,
  /** Группа расходов не по объекту: офис, личное, транспорт. */
  group: null as string | null,
  /** Расход прямой, по объекту. Иначе это аванс участнику с назначением. */
  direct: true,
  date: today(),
  note: '',
  currency: props.object.currency,
  rate: '',
  promised: false,
  dueDate: '',
})
const files = ref<File[]>([])
const error = ref('')
const busy = ref(false)
const amountInput = ref<HTMLInputElement>()

const kinds = computed(() => (Object.keys(KIND_NAME) as Kind[]).filter(k => can.value.kinds.includes(k)))

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    // По умолчанию расход: это самая частая запись с телефона.
    Object.assign(form, {
      amount: '',
      kind: kinds.value.includes('exp') ? 'exp' : (kinds.value[0] ?? 'exp'),
      personId: null,
      categoryId: null,
      teamId: null,
      group: null,
      direct: true,
      date: today(),
      note: '',
      currency: props.object.currency,
      rate: '',
      promised: false,
      dueDate: '',
    })
    files.value = []
    error.value = ''
    await nextTick()
    amountInput.value?.focus()
  },
)

watch(() => form.kind, (kind) => {
  if (kind === 'in') {
    form.personId = null
    form.categoryId = null
    form.teamId = null
    form.promised = false
  }
  if (kind === 'adv') {
    form.categoryId = null
    form.teamId = null
  }
})

// Сменили команду или группу — прежняя категория к новому месту не относится.
watch([() => form.teamId, () => form.group, () => form.direct], () => {
  if (form.categoryId && !categories.value.some(c => c.id === form.categoryId)) form.categoryId = null
})

// Расход не по объекту — это аванс участнику: команда тут ни при чём.
watch(() => form.direct, (direct) => {
  if (!direct) {
    form.teamId = null
    form.personId = null
  }
})

const sharers = computed(() =>
  settings.value.shares.map(s => settings.value.people.find(p => p.id === s.personId)).filter(p => !!p))
/** Расход не по объекту и аванс адресуются только участникам дележа. */
const toSharer = computed(() => form.kind === 'adv' || (form.kind === 'exp' && !form.direct))
const teams = computed(() => state.value.teams)
const team = computed(() => teams.value.find(x => x.id === form.teamId) ?? null)

// Сначала команда, потом её люди.
const teamPeople = computed(() => teamMembers(settings.value.people, team.value))

const people = computed(() => (toSharer.value ? sharers.value : teamPeople.value))

// Сменили команду — человек из прежней больше не подходит.
watch(() => form.teamId, () => {
  if (form.personId && !people.value.some(p => p!.id === form.personId)) form.personId = null
})
const groups = computed(() => categoryGroups(settings.value.categories))
const offObject = computed(() => form.kind === 'exp' && !form.direct)
const categories = computed(() =>
  categoriesFor(settings.value.categories, {
    teamId: form.teamId,
    group: form.group,
    offObject: offObject.value,
  }))

/* ---------- своя категория, если нужной нет ---------- */

const adding = ref(false)
const newCategory = ref('')
const addingPerson = ref(false)
const newPerson = ref('')

/** Человека заводим сразу в выбранную команду — иначе он тут же исчезнет из списка. */
async function addPerson() {
  const name = newPerson.value.trim()
  if (!name) return
  busy.value = true
  try {
    const res = await send<{ id: string }>('/api/people', {
      method: 'POST',
      body: { name, teamId: form.teamId },
    })
    await refresh()
    form.personId = res.id
    newPerson.value = ''
    addingPerson.value = false
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}

async function addCategory() {
  const name = newCategory.value.trim()
  if (!name) return
  busy.value = true
  try {
    const res = await send<{ id: string }>('/api/categories', {
      method: 'POST',
      body: {
        name,
        teamId: offObject.value ? null : form.teamId,
        group: offObject.value ? form.group : null,
      },
    })
    await refresh()
    form.categoryId = res.id
    newCategory.value = ''
    adding.value = false
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}
const foreign = computed(() => form.currency.toUpperCase() !== props.object.currency.toUpperCase())

/* ---------- курс: подсказка, ввод всё равно ручной ---------- */

interface RateInfo { date: string | null; rates: Record<string, number>; stale: boolean }
const rateInfo = ref<RateInfo | null>(null)
const rateLoading = ref(false)

async function loadRates() {
  if (rateInfo.value || rateLoading.value) return
  rateLoading.value = true
  try {
    rateInfo.value = await $fetch<RateInfo>('/api/rates', { params: { base: props.object.currency } })
  } catch {
    rateInfo.value = { date: null, rates: {}, stale: true }
  } finally {
    rateLoading.value = false
  }
}

watch(foreign, (isForeign) => {
  if (isForeign) loadRates()
}, { immediate: true })

// В поле нужен точный курс, в подписи — читаемый.
const fmtRate = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 8 })
const fmtShown = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: v >= 100 ? 2 : 6 })

/** Сколько единиц валюты операции дают за одну валюту объекта: 1 USD = 12 700 UZS. */
const perBase = computed(() => {
  const value = rateInfo.value?.rates?.[form.currency.toUpperCase()]
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : null
})

/** Курс к валюте объекта — то, чем считают. */
const suggested = computed(() => (perBase.value ? 1 / perBase.value : null))

/**
 * Сумы к доллару вводят сумами: 12 000, а не 0,000083.
 * Поле спрашивает в понятную сторону, а на сервер уходит курс к валюте объекта.
 */
const inverted = computed(() =>
  form.currency.toUpperCase() === 'UZS' && props.object.currency.toUpperCase() === 'USD')

const rateLabel = computed(() => (inverted.value
  ? t('Сколько {op} за 1 {base}', {
      op: currencyLabel(form.currency),
      base: currencyLabel(props.object.currency),
    })
  : t('Курс к {currency}', { currency: currencyLabel(props.object.currency) })))

const ratePlaceholder = computed(() => {
  // Курс объекта и есть «сумов за доллар» — в обе стороны это одно число.
  if (props.object.rate > 0) return fmtRate(props.object.rate)
  const shown = inverted.value ? perBase.value : suggested.value
  return shown ? fmtRate(shown) : t('Курс к {currency}', { currency: currencyLabel(props.object.currency) })
})

/** Введённое число в курс к валюте объекта. */
function rateFromInput(): number | null {
  const typed = parseRate(form.rate)
  if (typed == null || typed <= 0) return null
  return inverted.value ? 1 / typed : typed
}

const rateCaption = computed(() => {
  if (!foreign.value) return ''
  if (props.object.rate > 0) {
    return t('Курс объекта {rate}. Впишите тот, по которому считали эту операцию.', {
      rate: props.object.rate.toLocaleString('ru-RU'),
    })
  }
  if (rateLoading.value) return t('Загрузка…')
  if (!perBase.value || !rateInfo.value?.date) return t('Курс не загрузился — введите вручную.')
  return t('Курс на {date}: 1 {quote} = {rate} {base}', {
    date: dmy(rateInfo.value.date),
    quote: props.object.currency,
    rate: fmtShown(perBase.value),
    base: form.currency.toUpperCase(),
  })
})

const preview = computed(() => {
  const amount = parseMoney(form.amount)
  const rate = rateFromInput()
  if (amount == null || rate == null || !foreign.value) return ''
  return t('≈ {amount} {currency} по курсу на {date}', {
    amount: money(toBase(amount, rate)),
    currency: props.object.currency,
    date: dmy(form.date),
  })
})

const KIND_ICON: Record<Kind, string> = {
  in: 'ph:arrow-down-left',
  exp: 'ph:receipt',
  adv: 'ph:hand-coins',
}

const pick = <T extends string>(current: T | null, id: T): T | null => (current === id ? null : id)

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  files.value = [...files.value, ...Array.from(input.files ?? [])]
  input.value = ''
}

async function save(force = false) {
  error.value = ''
  const amount = parseMoney(form.amount)
  const rate = foreign.value ? rateFromInput() : 1
  if (amount == null || amount <= 0) return (error.value = t('Введите сумму больше нуля'))
  if (rate == null || rate <= 0) return (error.value = t('Укажите курс к валюте объекта'))
  if (form.kind === 'exp' && !form.categoryId) return (error.value = t('Расход без категории не сохраняется'))
  if (offObject.value && !form.group) return (error.value = t('Выберите группу расходов'))
  if (toSharer.value && !form.personId) {
    return (error.value = form.kind === 'adv'
      ? t('Укажите, кому выдан аванс')
      : t('Расход не по объекту записывается на участника — выберите человека'))
  }

  busy.value = true
  try {
    const status: OpStatus = form.promised ? 'promised' : 'ok'
    const res = await send<{ saved: boolean; warnings: Note[]; hint?: Note | null; op?: { id: string } }>('/api/ops', {
      method: 'POST',
      body: {
        // Расход не по объекту уходит на сервер авансом: чистую долю он не трогает.
        stageId: props.stage.id,
        kind: form.kind === 'exp' && !form.direct ? 'adv' : form.kind,
        offObject: form.kind === 'exp' && !form.direct,
        amount,
        currency: form.currency.toUpperCase(),
        rate,
        date: form.date || today(),
        personId: form.personId,
        categoryId: form.categoryId,
        teamId: form.direct ? form.teamId : null,
        note: form.note,
        status,
        dueDate: form.promised && form.dueDate ? form.dueDate : null,
        force,
      },
    })

    if (!res.saved) {
      busy.value = false
      const text = res.warnings.map(w => t(w.text, w.params)).join(' ')
      const go = await ask({ title: t('Проверьте'), body: `${text} ${t('Всё равно сохранить?')}` })
      if (go) await save(true)
      return
    }

    let filesNote = ''
    if (files.value.length && res.op?.id) {
      const problems = await uploadFiles(files.value, { operationId: res.op.id, kind: 'чек' })
      await refresh()
      if (problems.length) filesNote = ' ' + t('Файлы: {problems}', { problems: problems.join('; ') })
    }

    emit('close')
    const hint = res.hint ? t(res.hint.text, res.hint.params) : ''
    if (hint || filesNote) await notice(t('Сохранено'), hint + filesNote)
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppDialog :open="open" :title="t(KIND_NAME[form.kind])" :icon="KIND_ICON[form.kind]" @close="emit('close')">
    <div class="f">
      <label for="op-amount">{{ t('Сумма') }}</label>
      <div class="pick">
        <input
          id="op-amount"
          ref="amountInput"
          v-model="form.amount"
          v-mask="'money'"
          class="big num"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0,00"
          enterkeyhint="done"
        >
        <div class="seg cur">
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
    </div>

    <div v-if="foreign" class="f">
      <label for="op-rate">{{ rateLabel }}</label>
      <input
        id="op-rate"
        v-model="form.rate"
        v-mask="'rate'"
        class="num"
        inputmode="decimal"
        autocomplete="off"
        :placeholder="ratePlaceholder"
      >
      <p v-if="rateCaption" class="hint" style="margin-top: 6px">{{ rateCaption }}</p>
      <p v-if="preview" class="hint" style="margin-top: 4px">{{ preview }}</p>
    </div>

    <div v-if="kinds.length > 1" class="f">
      <label>{{ t('Тип') }}</label>
      <div class="seg">
        <button v-for="k in kinds" :key="k" type="button" :aria-pressed="form.kind === k" @click="form.kind = k">
          <Icon :name="KIND_ICON[k]" />
          {{ t(KIND_NAME[k]) }}
        </button>
      </div>
    </div>

    <div v-if="form.kind === 'exp'" class="f">
      <label>{{ t('Какой это расход') }}</label>
      <div class="seg">
        <button type="button" :aria-pressed="form.direct" @click="form.direct = true">
          <Icon name="ph:buildings" />
          {{ t('По объекту') }}
        </button>
        <button type="button" :aria-pressed="!form.direct" @click="form.direct = false">
          <Icon name="ph:hand-coins" />
          {{ t('Не по объекту') }}
        </button>
      </div>
      <p v-if="!form.direct" class="hint" style="margin-top: 8px">
        {{ t('Деньги участника: чистую долю не трогает.') }}
      </p>
    </div>

    <div v-if="offObject && groups.length" class="f">
      <label>{{ t('Группа расходов') }}</label>
      <div class="chips">
        <button
          v-for="g in groups"
          :key="g"
          type="button"
          :aria-pressed="form.group === g"
          @click="form.group = pick(form.group, g)"
        >
          <Icon v-if="form.group === g" name="ph:check" />
          {{ t(g) }}
        </button>
      </div>
    </div>

    <div v-if="form.kind === 'exp' && form.direct && teams.length" class="f">
      <label>{{ t('Команда') }}</label>
      <div class="chips">
        <button
          v-for="team in teams"
          :key="team.id"
          type="button"
          :aria-pressed="form.teamId === team.id"
          @click="form.teamId = pick(form.teamId, team.id)"
        >
          <Icon v-if="form.teamId === team.id" name="ph:check" />
          {{ team.name }}
        </button>
      </div>
    </div>

    <div v-if="form.kind !== 'in'" class="f">
      <label>{{ toSharer ? t('Участник') : team ? t('Кто из команды') : t('Человек') }}</label>
      <div class="chips">
        <button
          v-for="p in people"
          :key="p!.id"
          type="button"
          :aria-pressed="form.personId === p!.id"
          @click="form.personId = pick(form.personId, p!.id)"
        >
          <Icon v-if="form.personId === p!.id" name="ph:check" />
          {{ p!.name }}
        </button>
        <button v-if="can.manage && !toSharer" type="button" class="add" @click="addingPerson = !addingPerson">
          <Icon name="ph:plus" />{{ t('Добавить') }}
        </button>
        <span v-if="!people.length && toSharer" class="hint">{{ t('Людей нет — добавьте в справочниках.') }}</span>
      </div>
      <div v-if="addingPerson" class="pick" style="margin-top: 10px">
        <input v-model="newPerson" :placeholder="t('Имя человека')" @keyup.enter="addPerson">
        <button type="button" class="btn sm tonal" :disabled="busy" @click="addPerson">
          <Icon name="ph:check" />{{ t('Добавить') }}
        </button>
      </div>
    </div>

    <div v-if="form.kind === 'exp'" class="f">
      <label>{{ form.direct ? t('Категория') : t('Назначение') }}</label>
      <div class="chips">
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          :aria-pressed="form.categoryId === c.id"
          @click="form.categoryId = pick(form.categoryId, c.id)"
        >
          <Icon v-if="form.categoryId === c.id" name="ph:check" />
          {{ t(c.name) }}
        </button>
        <button v-if="can.manage" type="button" class="add" @click="adding = !adding">
          <Icon name="ph:plus" />{{ t('Добавить') }}
        </button>
      </div>
      <div v-if="adding" class="pick" style="margin-top: 10px">
        <input v-model="newCategory" :placeholder="t('Название категории')" @keyup.enter="addCategory">
        <button type="button" class="btn sm tonal" :disabled="busy" @click="addCategory">
          <Icon name="ph:check" />{{ t('Добавить') }}
        </button>
      </div>
    </div>

    <div class="row2">
      <div class="f">
        <label for="op-date">{{ t('Дата') }}</label>
        <input id="op-date" v-model="form.date" type="date">
      </div>
    </div>

    <div class="f">
      <label for="op-files">{{ t('Фото чека') }}</label>
      <label class="drop" for="op-files">
        <Icon name="ph:camera" />
        {{ files.length ? t('Выбрано файлов: {count}', { count: files.length }) : t('Снять или выбрать файл') }}
      </label>
      <input
        id="op-files"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        class="sr"
        @change="addFiles"
      >
    </div>

    <MoreFields>
      <div class="f">
        <label for="op-note">{{ t('Комментарий') }}</label>
        <input id="op-note" v-model="form.note" autocomplete="off" placeholder="—">
      </div>

      <div v-if="form.kind !== 'in'" class="f">
        <label class="check">
          <input v-model="form.promised" type="checkbox">
          {{ t('Обязательство: договорились, деньги не выданы') }}
        </label>
        <input v-if="form.promised" v-model="form.dueDate" type="date" :aria-label="t('Срок выплаты')" style="width: 100%">
      </div>
    </MoreFields>

    <p v-if="form.kind === 'in' && object.bonusPersonId && !form.promised" class="hint">
      {{ t('После сохранения система создаст строку расхода «Бонус» {rate} % на получателя объекта.', { rate: object.bonusRate }) }}
    </p>
    <p v-if="error" class="err">{{ error }}</p>

    <div class="acts">
      <button type="button" class="btn ghost" @click="emit('close')">{{ t('Отмена') }}</button>
      <button type="button" class="btn pri" :disabled="busy" @click="save(false)">
        <Icon name="ph:check" />
        {{ busy ? t('Сохраняем…') : t('Сохранить') }}
      </button>
    </div>
  </AppDialog>
</template>
