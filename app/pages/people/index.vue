<script setup lang="ts">
import { dmy } from '#shared/calc'
import { personPlan, type PersonPlan } from '#shared/plan'
import type { Column } from '~/components/DataTable.vue'

/** Люди разложены по командам: архитекторы, дизайнеры, конструкторы, инженеры. */
const { state, toMain } = useFinance()
const { t } = useT()
const { m } = useMoney()
const router = useRouter()

const query = ref('')

// Суммы по разным объектам сводятся в основную валюту.
const rows = computed(() =>
  state.value.settings.people.map(p => ({ id: p.id, p, plan: personPlan(state.value, p.id, toMain) })))

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const found = rows.value.filter(r => !q || `${r.p.name} ${r.p.role} ${r.p.phone}`.toLowerCase().includes(q))
  const out = state.value.teams.map(team => ({
    id: team.id,
    name: team.name,
    icon: team.composite ? 'ph:users-four' : 'ph:users-three',
    rows: found.filter(r => r.p.teamId === team.id),
  }))
  out.push({ id: '', name: t('Без команды'), icon: 'ph:user', rows: found.filter(r => !r.p.teamId) })
  return out.filter(g => g.rows.length)
})

const totals = computed(() => rows.value.reduce(
  (a, r) => ({ expected: a.expected + r.plan.expected, paid: a.paid + r.plan.paid, left: a.left + r.plan.left }),
  { expected: 0, paid: 0, left: 0 },
))

const kpis = computed(() => [
  { label: t('Людей'), icon: 'ph:users-three', value: String(rows.value.length), sub: t('команд: {count}', { count: state.value.teams.length }) },
  { label: t('Причитается'), icon: 'ph:handshake', value: m(totals.value.expected), sub: t('по планам и долям') },
  { label: t('Получено'), icon: 'ph:hand-coins', value: m(totals.value.paid), sub: t('выплачено на руки') },
  { label: t('Ещё не получили'), icon: 'ph:wallet', value: m(totals.value.left), sub: t('по текущему расчёту'), tone: 'acc' as const },
])

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('Человек'), desc: true },
  { key: 'expected', label: t('Причитается'), num: true },
  { key: 'paid', label: t('Получено'), num: true },
  { key: 'left', label: t('Осталось'), num: true },
  { key: 'next', label: t('Следующий платёж') },
])

const when = (plan: PersonPlan) => {
  if (plan.next?.dueDate) return dmy(plan.next.dueDate)
  if (plan.next?.stageNumber != null) return t('после этапа {n}', { n: plan.next.stageNumber })
  return plan.left > 0 ? t('срок не назначен') : '—'
}
</script>

<template>
  <div>
    <PageHead :title="t('Люди')" :sub="t('По командам. Видно, сколько человек получил и сколько ему ещё должны.')" />

    <KpiStrip v-if="rows.length" :items="kpis" />

    <div v-if="rows.length > 6" class="filters no-print">
      <div class="f" style="flex: 1 1 280px">
        <label for="pp-q">{{ t('Поиск') }}</label>
        <input id="pp-q" v-model="query" :placeholder="t('Имя, роль или телефон')" autocomplete="off">
      </div>
    </div>

    <EmptyState
      v-if="!rows.length"
      icon="ph:users-three"
      :text="t('Людей нет. Заведите их в справочниках — на них ссылаются авансы, бонусы и расходы.')"
    >
      <NuxtLink to="/settings" class="btn"><Icon name="ph:gear-six" />{{ t('К справочникам') }}</NuxtLink>
    </EmptyState>

    <EmptyState v-else-if="!groups.length" icon="ph:magnifying-glass" :text="t('Под поиск никто не попал.')" />

    <section v-for="g in groups" :key="g.id" class="sect">
      <h2><Icon :name="g.icon" />{{ g.name }}</h2>
      <DataTable :columns="columns" :rows="g.rows" :row-key="r => r.id" clickable @open="r => router.push(`/people/${r.id}`)">
        <template #cell-name="{ row }">
          <b>{{ row.p.name }}</b>
          <small>
            {{ row.p.role ? t(row.p.role) : '—' }}
            <template v-if="row.p.isSharer"> · {{ t('участник дележа') }}</template>
          </small>
        </template>
        <template #cell-expected="{ row }">{{ m(row.plan.expected) }}</template>
        <template #cell-paid="{ row }">{{ m(row.plan.paid) }}</template>
        <template #cell-left="{ row }"><span :class="{ acc: row.plan.left > 0 }">{{ m(row.plan.left) }}</span></template>
        <template #cell-next="{ row }">{{ when(row.plan) }}</template>
      </DataTable>
    </section>
  </div>
</template>
