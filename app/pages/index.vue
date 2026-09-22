<script setup lang="ts">
import { objectTotals, obligations, percent } from '#shared/calc'

const { state, can, loading, refresh } = useFinance()
const { t } = useT()
const { m, m0 } = useMoney()
const router = useRouter()

const showForm = ref(false)
const sort = ref<'cash' | 'name'>('cash')

const rows = computed(() => {
  const list = state.value.objects.map(o => ({ o, c: objectTotals(state.value, o.id) }))
  return sort.value === 'name'
    ? list.sort((a, b) => a.o.name.localeCompare(b.o.name, 'ru'))
    : list.sort((a, b) => b.c.cash - a.c.cash)
})

const totals = computed(() =>
  rows.value.reduce(
    (acc, { o, c }) => ({
      cash: acc.cash + c.cash,
      debt: acc.debt + c.debt,
      contract: acc.contract + o.contractAmount,
      promised: acc.promised + c.promised,
    }),
    { cash: 0, debt: 0, contract: 0, promised: 0 },
  ))

const soon = computed(() => obligations(state.value).filter(o => o.overdue || o.soon).length)

const kpis = computed(() => {
  const out = [
    {
      label: t('Общая касса'),
      icon: 'ph:wallet',
      value: m(totals.value.cash),
      sub: t('наличные на руках'),
      tone: totals.value.cash < 0 ? ('bad' as const) : ('acc' as const),
    },
  ]
  if (can.value.seeContract) {
    out.push({ label: t('Дебиторка'), icon: 'ph:hand-coins', value: m(totals.value.debt), sub: t('заказчики ещё должны'), tone: undefined })
    out.push({ label: t('Сумма договоров'), icon: 'ph:handshake', value: m0(totals.value.contract), sub: t('по всем объектам'), tone: undefined })
  }
  out.push({
    label: t('Предстоит выплатить'),
    icon: 'ph:clock-countdown',
    value: m(totals.value.promised),
    sub: soon.value ? t('{count} с близким сроком', { count: soon.value }) : t('обязательств по сроку нет'),
    tone: soon.value ? ('warn' as const) : undefined,
  })
  return out
})

const width = (usage: number) => `${Math.max(0, Math.min(1, usage)) * 100}%`
const tone = (usage: number) => (usage > 1 ? 'over' : usage > 0.8 ? 'hot' : '')
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Объекты') }}</h1>
        <p class="sub">{{ state.objects.length }} {{ can.allObjects ? t('в системе') : t('доступно вам') }}</p>
      </div>
      <div class="acts no-print">
        <select v-if="rows.length > 1" v-model="sort" :aria-label="t('Сортировка')" style="min-height: 36px">
          <option value="cash">{{ t('Сначала с большей кассой') }}</option>
          <option value="name">{{ t('По названию') }}</option>
        </select>
        <button v-if="can.manage" type="button" class="btn pri" @click="showForm = true">
          <Icon name="ph:plus" />{{ t('Новый объект') }}
        </button>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <div v-if="loading && !rows.length" class="skel">
      <i /><i /><i />
    </div>

    <div v-else-if="!rows.length" class="empty">
      <Icon name="ph:buildings" />
      <p v-if="can.manage">{{ t('Объектов пока нет. Создайте первый — этап, приходы и доли появятся внутри него.') }}</p>
      <p v-else>{{ t('Вам пока не назначен ни один объект. Попросите владельца открыть доступ.') }}</p>
      <button v-if="can.manage" type="button" class="btn pri" @click="showForm = true">
        <Icon name="ph:plus" />{{ t('Создать объект') }}
      </button>
      <button v-else type="button" class="btn" @click="refresh()">
        <Icon name="ph:arrows-clockwise" />{{ t('Обновить') }}
      </button>
    </div>

    <div v-else class="cards">
      <NuxtLink v-for="{ o, c } in rows" :key="o.id" class="ocard" :to="`/objects/${o.id}`">
        <div class="t">
          <Icon name="ph:buildings" />
          {{ o.name }}
          <span v-if="o.status === 'closed'" class="pill m">{{ t('закрыт') }}</span>
        </div>
        <div class="c">{{ o.customer || '—' }}<template v-if="o.address"> · {{ o.address }}</template></div>
        <dl>
          <template v-if="can.seeContract">
            <dt>{{ t('Договор') }}</dt>
            <dd>{{ m0(o.contractAmount, o.currency) }}</dd>
          </template>
          <dt>{{ t('Касса') }}</dt>
          <dd :class="{ neg: c.cash < 0 }">{{ m(c.cash, o.currency) }}</dd>
          <template v-if="can.seeContract">
            <dt>{{ t('Дебиторка') }}</dt>
            <dd>{{ m(c.debt, o.currency) }}</dd>
          </template>
          <dt>{{ t('Этапов') }}</dt>
          <dd>{{ c.stages.length }}</dd>
        </dl>
        <template v-if="can.seeContract">
          <div class="bar"><i :class="tone(c.usage)" :style="{ width: width(c.usage) }" /></div>
          <div class="kpi-s">{{ t('Освоено {percent} поступивших', { percent: percent(c.usage) }) }}</div>
        </template>
      </NuxtLink>
    </div>

    <ObjectForm :open="showForm" @close="showForm = false" @saved="id => router.push(`/objects/${id}`)" />
  </div>
</template>
