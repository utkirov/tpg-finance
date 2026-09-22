<script setup lang="ts">
import { BONUS_CAT, currencyLabel, dmy, formatMoney, percent, periodRange, type PeriodRow } from '#shared/calc'
import { buildStats, type Delta } from '#shared/stats'
import type { Column } from '~/components/DataTable.vue'
import type { PeriodValue } from '~/components/PeriodFilter.vue'

/**
 * Статистика за период по всем объектам сразу или по одному.
 * Всё сведено в основную валюту справочников по курсу каждого объекта:
 * переключатель USD / SUM в шапке сюда не лезет — у сводки своя валюта.
 */
const { state, can } = useFinance()
const { t } = useT()
const router = useRouter()

const filter = ref<PeriodValue>({ objectId: '', ...periodRange('year') })

const stats = computed(() => buildStats(state.value, {
  objectId: filter.value.objectId || undefined,
  from: filter.value.from || undefined,
  to: filter.value.to || undefined,
}))
const report = computed(() => stats.value.report)

const code = computed(() => report.value.currency)
const label = computed(() => currencyLabel(code.value))
const sum = (cents: number) => formatMoney(cents, code.value)
/** Для осей графиков: целые, без копеек. */
const axis = (cents: number) => formatMoney(cents, code.value, true)

/** «↑ 12 % к прошлому периоду» — без цвета: рост расходов не всегда плохо. */
function versus(d: Delta, fallback: string): string {
  if (d.change === null) return fallback
  const arrow = d.change > 0 ? '↑' : d.change < 0 ? '↓' : '='
  return t('{arrow} {percent} к прошлому периоду ({amount})', {
    arrow,
    percent: percent(Math.abs(d.change)),
    amount: sum(d.before),
  })
}

const periodKpis = computed(() => [
  {
    label: t('Получено за период'),
    icon: 'ph:arrow-down-left',
    value: sum(stats.value.inc.now),
    sub: versus(stats.value.inc, t('приходов: {count}', { count: stats.value.incomeCount })),
    tone: 'acc' as const,
  },
  {
    label: t('Расходы за период'),
    icon: 'ph:receipt',
    value: sum(stats.value.exp.now),
    sub: versus(stats.value.exp, t('по всем категориям')),
  },
  {
    label: t('Авансы за период'),
    icon: 'ph:hand-coins',
    value: sum(stats.value.adv.now),
    sub: versus(stats.value.adv, t('выдано участникам')),
  },
  {
    label: t('Движение денег'),
    icon: 'ph:wallet',
    value: sum(stats.value.flow.now),
    sub: versus(stats.value.flow, t('приход − расход − авансы')),
    tone: stats.value.flow.now < 0 ? ('bad' as const) : undefined,
  },
])

const portfolioKpis = computed(() => {
  const p = stats.value.portfolio
  const pr = stats.value.promised
  return [
    { label: t('Сумма договоров'), icon: 'ph:handshake', value: sum(p.contract), sub: t('объектов: {count}', { count: stats.value.objects.length }) },
    { label: t('Получено всего'), icon: 'ph:arrow-down-left', value: sum(p.received), sub: t('собрано {percent} от этапов', { percent: percent(p.collected) }) },
    { label: t('Дебиторка'), icon: 'ph:hand-coins', value: sum(p.debt), sub: t('заказчики ещё должны') },
    {
      label: t('Обязательства'),
      icon: 'ph:clock-countdown',
      value: sum(pr.total),
      sub: pr.overdue ? t('просрочено {amount}', { amount: sum(pr.overdue) }) : t('записей: {count}', { count: pr.count }),
      tone: pr.overdue ? ('bad' as const) : pr.soon ? ('warn' as const) : undefined,
    },
  ]
})

const facts = computed(() => [
  { label: t('Средний приход'), value: sum(stats.value.avgIncome) },
  { label: t('Крупнейший расход'), value: sum(stats.value.biggestExpense) },
  { label: t('Доля бонуса в расходах'), value: percent(stats.value.bonusShare, 1) },
  { label: t('Операций за период'), value: String(report.value.count) },
  { label: t('Касса по объектам'), value: sum(stats.value.portfolio.cash) },
])

/* ---------- графики ---------- */

const monthName = (m: string) => {
  const [y, mm] = m.split('-')
  return `${mm}.${String(y).slice(2)}`
}
const months = computed(() => stats.value.months)
const monthLabels = computed(() => months.value.map(m => monthName(m.month)))
const monthSeries = computed(() => [
  { label: t('Приход'), data: months.value.map(m => m.inc), slot: 1 as const },
  { label: t('Расходы и авансы'), data: months.value.map(m => m.out), slot: 2 as const },
])
const balanceSeries = computed(() => [
  { label: t('Остаток'), data: months.value.map(m => m.balance), slot: 1 as const },
])

const catLabels = computed(() => stats.value.categories.map(r => t(r.name)))
const catSeries = computed(() => [
  { label: t('Расходы'), data: stats.value.categories.map(r => r.exp), slot: 1 as const },
])

const teamLabels = computed(() => stats.value.teams.map(r => r.name))
const teamSeries = computed(() => [
  { label: t('План'), data: stats.value.teams.map(r => r.planned), slot: 1 as const },
  { label: t('Потрачено'), data: stats.value.teams.map(r => r.spent), slot: 2 as const },
])

const objLabels = computed(() => stats.value.objects.map(r => r.name))
const objSeries = computed(() => [
  { label: t('Получено'), data: stats.value.objects.map(r => r.received), slot: 1 as const },
  { label: t('Дебиторка'), data: stats.value.objects.map(r => r.debt), slot: 2 as const },
])

/** Высота горизонтального графика — по числу строк, чтобы подписи не слипались. */
const rowsHeight = (n: number) => Math.max(160, 44 + n * 34)

/* ---------- таблицы ---------- */

const flowColumns = computed<Column[]>(() => [
  { key: 'name', label: t('Название'), desc: true },
  { key: 'inc', label: t('Приход'), num: true },
  { key: 'exp', label: t('Расходы'), num: true },
  { key: 'adv', label: t('Авансы'), num: true },
  { key: 'flow', label: t('Итого'), num: true },
])

const totalOf = (rows: PeriodRow[]) => {
  const s = rows.reduce(
    (a, r) => ({ inc: a.inc + r.inc, exp: a.exp + r.exp, adv: a.adv + r.adv, flow: a.flow + r.flow }),
    { inc: 0, exp: 0, adv: 0, flow: 0 },
  )
  return { name: t('Итого'), inc: sum(s.inc), exp: sum(s.exp), adv: sum(s.adv), flow: sum(s.flow) }
}

const blocks = computed(() => [
  { key: 'objects', title: t('По объектам'), icon: 'ph:buildings', rows: report.value.objects, link: true },
  { key: 'teams', title: t('По командам'), icon: 'ph:users-three', rows: report.value.teams, link: false },
  { key: 'people', title: t('Кому выплачено'), icon: 'ph:user', rows: report.value.people, link: false },
])

const catColumns = computed<Column[]>(() => [
  { key: 'name', label: t('Категория'), desc: true },
  { key: 'exp', label: t('Сумма'), num: true },
  { key: 'share', label: t('Доля'), num: true },
])
const catTotal = computed(() => report.value.categories.reduce((a, r) => a + r.exp, 0))

const monthColumns = computed<Column[]>(() => [
  { key: 'month', label: t('Месяц'), desc: true },
  { key: 'inc', label: t('Приход'), num: true },
  { key: 'out', label: t('Расходы и авансы'), num: true },
  { key: 'flow', label: t('Движение'), num: true },
  { key: 'balance', label: t('Остаток'), num: true },
])

const objColumns = computed<Column[]>(() => [
  { key: 'name', label: t('Объект'), desc: true },
  { key: 'contract', label: t('Договор'), num: true },
  { key: 'received', label: t('Получено'), num: true },
  { key: 'debt', label: t('Дебиторка'), num: true },
  { key: 'cash', label: t('Касса'), num: true },
])

const teamColumns = computed<Column[]>(() => [
  { key: 'name', label: t('Команда'), desc: true },
  { key: 'planned', label: t('План'), num: true },
  { key: 'spent', label: t('Потрачено'), num: true },
  { key: 'rest', label: t('Осталось'), num: true },
])

const print = () => window.print()
const exportUrl = computed(() =>
  `/api/export?${new URLSearchParams({
    ...(filter.value.objectId ? { object: filter.value.objectId } : {}),
    ...(filter.value.from ? { from: filter.value.from } : {}),
    ...(filter.value.to ? { to: filter.value.to } : {}),
  })}`)

const periodText = computed(() => filter.value.from || filter.value.to
  ? t('с {from} по {to}', {
      from: filter.value.from ? dmy(filter.value.from) : '…',
      to: filter.value.to ? dmy(filter.value.to) : '…',
    })
  : t('за всё время'))
</script>

<template>
  <div>
    <PageHead :title="t('Статистика')">
      <template #sub>
        {{ periodText }} · {{ t('суммы сведены в {currency}', { currency: label }) }}
        <template v-if="stats.previous">
          · {{ t('сравнение с {from} – {to}', { from: dmy(stats.previous.from), to: dmy(stats.previous.to) }) }}
        </template>
      </template>
      <button type="button" class="btn" @click="print"><Icon name="ph:printer" />{{ t('Печать') }}</button>
      <a v-if="can.seeAllShares" class="btn" :href="exportUrl"><Icon name="ph:file-xls" />{{ t('Excel') }}</a>
    </PageHead>

    <PeriodFilter v-model="filter" :objects="state.objects" />

    <KpiStrip :items="periodKpis" />

    <section class="sect">
      <h2><Icon name="ph:briefcase" />{{ t('Портфель на сегодня') }}</h2>
      <KpiStrip :items="portfolioKpis" />
      <dl class="facts panel">
        <div v-for="f in facts" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd class="num">{{ f.value }}</dd>
        </div>
      </dl>
    </section>

    <EmptyState v-if="!report.count" icon="ph:chart-bar" :text="t('За этот период операций не было. Возьмите период шире.')" />

    <template v-else>
      <div class="viz-grid">
        <section class="panel viz">
          <h3>{{ t('Приход и расход по месяцам') }}</h3>
          <ChartBox kind="bar" :labels="monthLabels" :series="monthSeries" :format="axis" :label="t('Приход и расход по месяцам')" />
        </section>

        <section class="panel viz">
          <h3>{{ t('Остаток нарастающим итогом') }}</h3>
          <p class="hint">{{ t('Сколько денег осталось с начала периода, месяц за месяцем.') }}</p>
          <ChartBox kind="line" :labels="monthLabels" :series="balanceSeries" :format="axis" :label="t('Остаток нарастающим итогом')" />
        </section>

        <section v-if="stats.categories.length" class="panel viz">
          <h3>{{ t('Расходы по категориям') }}</h3>
          <ChartBox
            kind="bar"
            horizontal
            :labels="catLabels"
            :series="catSeries"
            :format="axis"
            :height="rowsHeight(catLabels.length)"
            :label="t('Расходы по категориям')"
          />
        </section>

        <section v-if="stats.teams.length" class="panel viz">
          <h3>{{ t('Команды: план и факт') }}</h3>
          <ChartBox
            kind="bar"
            horizontal
            :labels="teamLabels"
            :series="teamSeries"
            :format="axis"
            :height="rowsHeight(teamLabels.length * 1.6)"
            :label="t('Команды: план и факт')"
          />
        </section>

        <section v-if="stats.objects.length > 1" class="panel viz wide">
          <h3>{{ t('Объекты: получено и долг') }}</h3>
          <p class="hint">{{ t('Длина полосы — сумма этапов; слева получено, справа ещё должны.') }}</p>
          <ChartBox
            kind="bar"
            horizontal
            stacked
            :labels="objLabels"
            :series="objSeries"
            :format="axis"
            :height="rowsHeight(objLabels.length)"
            :label="t('Объекты: получено и долг')"
          />
        </section>
      </div>

      <section class="sect">
        <h2><Icon name="ph:calendar" />{{ t('По месяцам') }}</h2>
        <DataTable :columns="monthColumns" :rows="months" :row-key="r => r.month">
          <template #cell-month="{ row }"><b>{{ monthName(row.month) }}</b></template>
          <template #cell-inc="{ row }">{{ row.inc ? sum(row.inc) : '—' }}</template>
          <template #cell-out="{ row }">{{ row.out ? sum(row.out) : '—' }}</template>
          <template #cell-flow="{ row }"><span :class="{ neg: row.flow < 0 }">{{ sum(row.flow) }}</span></template>
          <template #cell-balance="{ row }"><span :class="{ neg: row.balance < 0 }">{{ sum(row.balance) }}</span></template>
        </DataTable>
      </section>

      <section v-if="stats.objects.length" class="sect">
        <h2><Icon name="ph:buildings" />{{ t('Договоры и дебиторка') }}</h2>
        <DataTable
          :columns="objColumns"
          :rows="stats.objects"
          :row-key="r => r.id"
          clickable
          :total="{
            name: t('Итого'),
            contract: sum(stats.portfolio.contract),
            received: sum(stats.portfolio.received),
            debt: sum(stats.portfolio.debt),
            cash: sum(stats.portfolio.cash),
          }"
          @open="r => router.push(`/objects/${r.id}`)"
        >
          <template #cell-name="{ row }"><b>{{ row.name }}</b></template>
          <template #cell-contract="{ row }">{{ sum(row.contract) }}</template>
          <template #cell-received="{ row }">{{ sum(row.received) }}</template>
          <template #cell-debt="{ row }">{{ sum(row.debt) }}</template>
          <template #cell-cash="{ row }"><span :class="{ neg: row.cash < 0 }">{{ sum(row.cash) }}</span></template>
        </DataTable>
      </section>

      <section v-if="stats.teams.length" class="sect">
        <h2><Icon name="ph:users-three" />{{ t('Команды: план и факт') }}</h2>
        <DataTable :columns="teamColumns" :rows="stats.teams" :row-key="r => r.id">
          <template #cell-name="{ row }"><b>{{ row.name }}</b></template>
          <template #cell-planned="{ row }">{{ row.planned ? sum(row.planned) : '—' }}</template>
          <template #cell-spent="{ row }">{{ sum(row.spent) }}</template>
          <template #cell-rest="{ row }">
            <span :class="{ neg: row.spent > row.planned && row.planned > 0 }">
              {{ row.planned ? sum(row.planned - row.spent) : '—' }}
            </span>
          </template>
        </DataTable>
      </section>

      <section v-for="b in blocks" :key="b.key" class="sect">
        <h2><Icon :name="b.icon" />{{ b.title }} · {{ t('движение за период') }}</h2>
        <EmptyState v-if="!b.rows.length" :text="t('Пусто за этот период.')" />
        <DataTable
          v-else
          :columns="flowColumns"
          :rows="b.rows"
          :row-key="r => r.id"
          :clickable="b.link"
          :total="totalOf(b.rows)"
          @open="r => router.push(`/objects/${r.id}`)"
        >
          <template #cell-name="{ row }"><b>{{ t(row.name) }}</b></template>
          <template #cell-inc="{ row }">{{ row.inc ? sum(row.inc) : '—' }}</template>
          <template #cell-exp="{ row }">{{ row.exp ? sum(row.exp) : '—' }}</template>
          <template #cell-adv="{ row }">{{ row.adv ? sum(row.adv) : '—' }}</template>
          <template #cell-flow="{ row }"><span :class="{ neg: row.flow < 0 }">{{ sum(row.flow) }}</span></template>
        </DataTable>
      </section>

      <section class="sect">
        <h2><Icon name="ph:tag" />{{ t('По категориям расходов') }}</h2>
        <DataTable
          :columns="catColumns"
          :rows="report.categories.filter(r => r.exp > 0)"
          :row-key="r => r.id"
          :row-class="r => (r.id === BONUS_CAT ? 'auto' : undefined)"
          :total="{ name: t('Итого'), exp: sum(catTotal), share: '100 %' }"
        >
          <template #cell-name="{ row }"><b>{{ t(row.name) }}</b></template>
          <template #cell-exp="{ row }">{{ sum(row.exp) }}</template>
          <template #cell-share="{ row }">{{ percent(catTotal ? row.exp / catTotal : 0, 1) }}</template>
        </DataTable>
      </section>
    </template>
  </div>
</template>

<style scoped>
.facts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px 24px; margin: 12px 0 0;
}
.facts dt { font-size: 12px; color: var(--on-surface-variant); letter-spacing: 0.04em; }
.facts dd { margin: 2px 0 0; font-size: 18px; font-weight: 500; }
.viz-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr));
  gap: 12px; margin-bottom: 32px;
}
.viz { display: grid; gap: 8px; align-content: start; min-width: 0; }
.viz h3 { margin: 0; }
.viz.wide { grid-column: 1 / -1; }
@media print {
  .viz { break-inside: avoid; }
}
</style>
