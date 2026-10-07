<script setup lang="ts">
import { dmy, personSummary, today } from '#shared/calc'
import { personPlan } from '#shared/plan'
import type { Column } from '~/components/DataTable.vue'

/**
 * Карточка человека. Главный вопрос: в каких объектах он занят,
 * сколько уже получил, сколько ещё нет и когда ждать следующие деньги.
 */
const route = useRoute()
const { state, personName, toMain } = useFinance()
const opText = useOps()
const { t } = useT()
const { m } = useMoney()

const personId = computed(() => String(route.params.id))
const person = computed(() => state.value.settings.people.find(p => p.id === personId.value) ?? null)
// Итоги по разным объектам — в основной валюте, строки ленты — в валюте своего объекта.
const summary = computed(() => personSummary(state.value, personId.value, toMain))
const plan = computed(() => personPlan(state.value, personId.value, toMain))

const ops = computed(() =>
  state.value.ops
    .filter(o => o.personId === personId.value && o.status !== 'void')
    .sort((a, b) => b.date.localeCompare(a.date)))

const objectName = (id: string) => state.value.objects.find(o => o.id === id)?.name ?? '—'

/** Когда ждать деньги: названный срок либо этап, который их принесёт. */
const when = (row: { dueDate: string | null; stageNumber: number | null; left: number }) => {
  if (row.dueDate) return dmy(row.dueDate)
  if (row.stageNumber !== null) return t('после этапа {n}', { n: row.stageNumber })
  return row.left > 0 ? t('срок не назначен') : '—'
}

const nextText = computed(() => {
  const next = plan.value.next
  if (!next) return t('платежей не запланировано')
  if (next.dueDate) return dmy(next.dueDate)
  return next.stageNumber !== null ? t('после этапа {n}', { n: next.stageNumber }) : t('срок не назначен')
})

const kpis = computed(() => [
  {
    label: plan.value.basis === 'team' ? t('Договорено') : t('Начислено'),
    icon: 'ph:handshake',
    value: m(plan.value.expected),
    sub: plan.value.basis !== 'team'
      ? t('доля по всем этапам')
      : plan.value.personal
        ? t('его сумма в команде «{team}»', { team: plan.value.teamName || t('—') })
        : t('план команды «{team}»', { team: plan.value.teamName || t('—') }),
  },
  {
    label: t('Получено'),
    icon: 'ph:hand-coins',
    value: m(plan.value.paid),
    sub: summary.value.bonuses
      ? t('в том числе бонусов {amount}', { amount: m(summary.value.bonuses) })
      : t('объектов: {count}', { count: plan.value.rows.length }),
  },
  {
    label: t('Ещё не получил'),
    icon: 'ph:wallet',
    value: m(plan.value.left),
    sub: t('по текущему расчёту'),
    tone: plan.value.left > 0 ? ('acc' as const) : undefined,
  },
  {
    label: t('Следующий платёж'),
    icon: 'ph:calendar-check',
    value: plan.value.next ? m(plan.value.next.amount) : '—',
    sub: nextText.value,
    tone: 'warn' as const,
  },
])

const print = () => window.print()

const objectColumns = computed<Column[]>(() => [
  { key: 'objectName', label: t('Объект'), desc: true },
  { key: 'expected', label: t('Причитается'), num: true },
  { key: 'paid', label: t('Получено'), num: true },
  { key: 'left', label: t('Осталось'), num: true },
  { key: 'when', label: t('Когда') },
])

const opColumns = computed<Column[]>(() => [
  { key: 'date', label: t('Дата'), num: true },
  { key: 'object', label: t('Объект') },
  { key: 'what', label: t('Операция'), desc: true },
  { key: 'amount', label: t('Сумма'), num: true },
])
</script>

<template>
  <div v-if="person">
    <PageHead :title="person.name">
      <template #sub>
        {{ person.role ? t(person.role) : t('без роли') }}
        <template v-if="plan.teamName"> · {{ plan.teamName }}</template>
        <template v-if="person.isSharer"> · {{ t('участник дележа') }}</template>
        <template v-if="person.phone"> · <a :href="`tel:${person.phone.replace(/[^+\d]/g, '')}`">{{ person.phone }}</a></template>
      </template>
      <button type="button" class="btn" @click="print"><Icon name="ph:printer" />{{ t('Акт сверки на печать') }}</button>
    </PageHead>

    <KpiStrip :items="kpis" />

    <p v-if="plan.basis === 'team' && !plan.personal && plan.teamSize > 1" class="hint no-print" style="margin: -8px 0 18px">
      {{ t('План — общий на всю команду, в ней {count} чел. Получено — только его выплаты.', { count: plan.teamSize }) }}
    </p>
    <p v-else class="hint no-print" style="margin: -8px 0 18px">
      {{ t('Сверка составлена {date}. Суммы — по объектам, доступным вам.', { date: dmy(today()) }) }}
    </p>

    <section class="sect">
      <h2>{{ t('По объектам') }}</h2>
      <EmptyState v-if="!plan.rows.length" :text="t('Этот человек ещё нигде не встречается.')" />
      <DataTable
        v-else
        :columns="objectColumns"
        :rows="plan.rows"
        :row-key="r => r.objectId"
        :total="{ objectName: t('Итого'), expected: m(plan.expected), paid: m(plan.paid), left: m(plan.left) }"
      >
        <template #cell-objectName="{ row }">
          <b><NuxtLink :to="`/objects/${row.objectId}`">{{ row.objectName }}</NuxtLink></b>
        </template>
        <template #cell-expected="{ row }">{{ m(row.expected) }}</template>
        <template #cell-paid="{ row }">{{ m(row.paid) }}</template>
        <template #cell-left="{ row }"><span :class="{ acc: row.left > 0 }">{{ m(row.left) }}</span></template>
        <template #cell-when="{ row }">
          {{ when(row) }}
          <span v-if="row.promised" class="pill m">{{ t('обещано {amount}', { amount: m(row.promised) }) }}</span>
        </template>
      </DataTable>
    </section>

    <section class="sect">
      <h2>{{ t('Операции с его участием') }}</h2>
      <EmptyState v-if="!ops.length" icon="ph:receipt" :text="t('Операций нет.')" />
      <DataTable
        v-else
        :columns="opColumns"
        :rows="ops"
        :row-key="op => op.id"
        :row-class="op => ({ auto: op.isAuto, promised: op.status === 'promised' })"
      >
        <template #cell-date="{ row }">{{ dmy(row.date) }}</template>
        <template #cell-object="{ row }">
          <NuxtLink :to="`/stages/${row.stageId}`">{{ objectName(row.objectId) }}</NuxtLink>
        </template>
        <template #cell-what="{ row }">
          <b>{{ opText.label(row) }}</b>
          <small v-if="row.note">{{ row.note }}</small>
          <span v-if="row.status === 'promised'" class="pill m">{{ t('обещано') }}</span>
        </template>
        <template #cell-amount="{ row }">{{ m(row.amountBase, opText.currencyOf(row)) }}</template>
      </DataTable>
    </section>

    <div class="sign" style="display: none">
      <div>{{ t('Владелец — подпись, дата') }}</div>
      <div>{{ t('{name} — подпись, дата', { name: personName(personId) }) }}</div>
    </div>
  </div>

  <EmptyState v-else :text="t('Человек не найден.')">
    <NuxtLink to="/people" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку людей') }}</NuxtLink>
  </EmptyState>
</template>

<style scoped>
@media print {
  .sign { display: grid !important; }
}
</style>
