<script setup lang="ts">
import { objectTotals, obligations } from '#shared/calc'
import type { Kpi } from '~/components/KpiStrip.vue'

const { state, can, loading, refresh, toMain } = useFinance()
const { t } = useT()
const { m, m0 } = useMoney()
const router = useRouter()

const showForm = ref(false)
const sort = ref<'cash' | 'debt' | 'name'>('cash')
const query = ref('')

const all = computed(() => state.value.objects.map(o => ({ o, c: objectTotals(state.value, o.id) })))

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = all.value.filter(({ o }) => !q || `${o.name} ${o.customer} ${o.address}`.toLowerCase().includes(q))
  // Сравниваем в одной валюте: касса в сумах и касса в долларах — разные числа.
  if (sort.value === 'name') return list.sort((a, b) => a.o.name.localeCompare(b.o.name, 'ru'))
  const pick = sort.value
  return list.sort((a, b) => toMain(b.c[pick], b.o.id) - toMain(a.c[pick], a.o.id))
})

/** Итоги по всем объектам — в основной валюте, каждый по своему курсу. */
const totals = computed(() =>
  all.value.reduce(
    (acc, { o, c }) => ({
      cash: acc.cash + toMain(c.cash, o.id),
      debt: acc.debt + toMain(c.debt, o.id),
      contract: acc.contract + toMain(o.contractAmount, o.id),
      promised: acc.promised + toMain(c.promised, o.id),
    }),
    { cash: 0, debt: 0, contract: 0, promised: 0 },
  ))

const soon = computed(() => obligations(state.value).filter(o => o.overdue || o.soon).length)

const kpis = computed(() => {
  const out: Kpi[] = [
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
</script>

<template>
  <div>
    <PageHead
      :title="t('Объекты')"
      :sub="`${state.objects.length} ${can.allObjects ? t('в системе') : t('доступно вам')}`"
    >
      <button v-if="can.manage" type="button" class="btn pri" @click="showForm = true">
        <Icon name="ph:plus" />{{ t('Новый объект') }}
      </button>
    </PageHead>

    <KpiStrip :items="kpis" />

    <div v-if="all.length > 1" class="filters no-print">
      <div class="f" style="flex: 1 1 240px">
        <label for="obj-q">{{ t('Поиск') }}</label>
        <input id="obj-q" v-model="query" :placeholder="t('Название, заказчик или адрес')" autocomplete="off">
      </div>
      <div class="f">
        <label for="obj-sort">{{ t('Сортировка') }}</label>
        <select id="obj-sort" v-model="sort">
          <option value="cash">{{ t('Сначала с большей кассой') }}</option>
          <option v-if="can.seeContract" value="debt">{{ t('Сначала с большим долгом') }}</option>
          <option value="name">{{ t('По названию') }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading && !all.length" class="skel">
      <i /><i /><i />
    </div>

    <EmptyState
      v-else-if="!all.length"
      icon="ph:buildings"
      :text="can.manage
        ? t('Объектов пока нет. Создайте первый — этап, приходы и доли появятся внутри него.')
        : t('Вам пока не назначен ни один объект. Попросите владельца открыть доступ.')"
    >
      <button v-if="can.manage" type="button" class="btn pri" @click="showForm = true">
        <Icon name="ph:plus" />{{ t('Создать объект') }}
      </button>
      <button v-else type="button" class="btn" @click="refresh()">
        <Icon name="ph:arrows-clockwise" />{{ t('Обновить') }}
      </button>
    </EmptyState>

    <EmptyState v-else-if="!rows.length" icon="ph:magnifying-glass" :text="t('Под поиск ничего не попало.')" />

    <div v-else class="cards">
      <ObjectCard v-for="{ o, c } in rows" :key="o.id" :object="o" :totals="c" />
    </div>

    <ObjectForm :open="showForm" @close="showForm = false" @saved="id => router.push(`/objects/${id}`)" />
  </div>
</template>
