<script setup lang="ts">
import { REMIND_DAYS, dmy, obligations, type Obligation } from '#shared/calc'
import type { Column } from '~/components/DataTable.vue'

/** Предстоящие выплаты: всё, о чём договорились, но деньги не выдали. */
const { state, can, toMain } = useFinance()
const { t } = useT()
const { m } = useMoney()
const ops = useOps()

const list = computed(() => obligations(state.value))
const overdue = computed(() => list.value.filter(o => o.overdue))
const soon = computed(() => list.value.filter(o => o.soon))
/** Итоги по разным объектам — в основной валюте. */
const sum = (rows: Obligation[]) => rows.reduce((a, o) => a + toMain(o.op.amountBase, o.op.objectId), 0)
/** Строка — в валюте своего объекта. */
const amount = (row: Obligation) => m(row.op.amountBase, ops.currencyOf(row.op))

const kpis = computed(() => [
  {
    label: t('Всего обязательств'),
    icon: 'ph:clock-countdown',
    value: m(sum(list.value)),
    sub: t('{count} записей', { count: list.value.length }),
  },
  {
    label: t('Просрочено'),
    icon: 'ph:warning',
    value: m(sum(overdue.value)),
    sub: t('{count} записей', { count: overdue.value.length }),
    tone: overdue.value.length ? ('bad' as const) : undefined,
  },
  {
    label: t('Срок в ближайшие {days} дн.', { days: REMIND_DAYS }),
    icon: 'ph:calendar-blank',
    value: m(sum(soon.value)),
    sub: t('{count} записей', { count: soon.value.length }),
    tone: soon.value.length ? ('warn' as const) : undefined,
  },
])

const columns = computed<Column[]>(() => [
  { key: 'due', label: t('Срок'), num: true },
  { key: 'what', label: t('Обязательство'), desc: true },
  { key: 'where', label: t('Объект') },
  { key: 'amount', label: t('Сумма'), num: true },
  ...(can.value.write ? [{ key: 'act', label: '', act: true }] : []),
])
</script>

<template>
  <div>
    <PageHead
      :title="t('Предстоящие выплаты')"
      :sub="t('Расходы, о которых договорились, но деньги не выдали. В кассу они не входят.')"
    />

    <KpiStrip :items="kpis" />

    <div v-if="overdue.length" class="note r">
      <Icon name="ph:warning" />
      <div>
        <b>{{ t('Срок прошёл') }}</b>
        {{ t('{count} записей', { count: overdue.length }) }} — {{ m(sum(overdue)) }}.
      </div>
    </div>

    <EmptyState
      v-if="!list.length"
      icon="ph:check-circle"
      :text="t('Обязательств нет. Они появляются, когда при вводе расхода отмечают «договорились, деньги не выданы».')"
    />

    <DataTable v-else :columns="columns" :rows="list" :row-key="r => r.op.id">
      <template #cell-due="{ row }">
        {{ row.op.dueDate ? dmy(row.op.dueDate) : t('без срока') }}
        <span v-if="row.overdue" class="pill r">{{ t('просрочено') }}</span>
        <span v-else-if="row.soon" class="pill g">{{ t('скоро') }}</span>
      </template>
      <template #cell-what="{ row }">
        <b>{{ ops.label(row.op) }}</b>
        <small v-if="row.op.note">{{ row.op.note }}</small>
      </template>
      <template #cell-where="{ row }">
        <NuxtLink :to="`/stages/${row.op.stageId}`">
          {{ row.objectName }} · {{ t('Этап') }} {{ row.stageNumber }}
        </NuxtLink>
      </template>
      <template #cell-amount="{ row }">{{ amount(row) }}</template>
      <template #cell-act="{ row }">
        <button v-if="ops.canSettle(row.op)" type="button" class="btn sm" @click="ops.settle(row.op, amount(row))">
          <Icon name="ph:check-circle" />{{ t('Выплачено') }}
        </button>
      </template>
    </DataTable>
  </div>
</template>
