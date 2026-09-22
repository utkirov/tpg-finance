<script setup lang="ts">
import {
  BONUS_CAT, categoryReport, currencyLabel, dmy, formatMoney, objectTotals, percent,
  periodRange, periodReport, type PeriodRow,
} from '#shared/calc'

/** Сводная аналитика за период: по всем объектам сразу или по одному. */
const { state, can } = useFinance()
const { t } = useT()
const router = useRouter()

const filter = reactive({ objectId: '', ...periodRange('year') })

const report = computed(() => periodReport(state.value, {
  objectId: filter.objectId || undefined,
  from: filter.from || undefined,
  to: filter.to || undefined,
}))

/** Сводка в одной валюте — переключатель показа сюда не лезет. */
const sum = (cents: number) => formatMoney(cents, report.value.currency)
const label = computed(() => currencyLabel(report.value.currency))

const cats = computed(() => categoryReport(state.value, {
  objectId: filter.objectId || undefined,
  from: filter.from || undefined,
  to: filter.to || undefined,
}))

const debt = computed(() => {
  const list = filter.objectId
    ? state.value.objects.filter(o => o.id === filter.objectId)
    : state.value.objects
  return list.reduce((a, o) => a + objectTotals(state.value, o.id).debt, 0)
})

const kpis = computed(() => [
  {
    label: t('Получено за период'),
    icon: 'ph:arrow-down-left',
    value: sum(report.value.inc),
    sub: t('операций: {count}', { count: report.value.count }),
    tone: 'acc' as const,
  },
  {
    label: t('Расходы за период'),
    icon: 'ph:receipt',
    value: sum(report.value.exp),
    sub: report.value.bonus
      ? t('в т. ч. бонус {amount}', { amount: sum(report.value.bonus) })
      : t('по всем категориям'),
  },
  {
    label: t('Авансы за период'),
    icon: 'ph:hand-coins',
    value: sum(report.value.adv),
    sub: t('выдано участникам'),
  },
  {
    label: t('Движение денег'),
    icon: 'ph:wallet',
    value: sum(report.value.flow),
    sub: t('приход − расход − авансы'),
    tone: report.value.flow < 0 ? ('bad' as const) : undefined,
  },
])

/** Помесячно: полоса от самого большого месяца. */
const peak = computed(() =>
  Math.max(1, ...report.value.months.map(x => Math.max(x.inc, x.out))))

const monthName = (m: string) => {
  const [y, mm] = m.split('-')
  return `${mm}.${String(y).slice(2)}`
}

function setRange(kind: 'month' | 'quarter' | 'year' | 'all') {
  Object.assign(filter, periodRange(kind))
}

const ranges = [
  { key: 'month' as const, label: 'Месяц' },
  { key: 'quarter' as const, label: 'Квартал' },
  { key: 'year' as const, label: 'Год' },
  { key: 'all' as const, label: 'Всё время' },
]

const active = computed(() => {
  const found = ranges.find(r => {
    const range = periodRange(r.key)
    return range.from === filter.from && range.to === filter.to
  })
  return found?.key ?? ''
})

const totalOf = (rows: PeriodRow[]) => rows.reduce(
  (a, r) => ({ inc: a.inc + r.inc, exp: a.exp + r.exp, adv: a.adv + r.adv, flow: a.flow + r.flow }),
  { inc: 0, exp: 0, adv: 0, flow: 0 },
)

const blocks = computed(() => [
  { key: 'objects', title: t('По объектам'), icon: 'ph:buildings', rows: report.value.objects, link: true },
  { key: 'teams', title: t('По командам'), icon: 'ph:users-three', rows: report.value.teams, link: false },
  { key: 'people', title: t('Кому выплачено'), icon: 'ph:user', rows: report.value.people, link: false },
].map(b => ({ ...b, sum: totalOf(b.rows) })))

const print = () => window.print()
const exportUrl = computed(() =>
  `/api/export?${new URLSearchParams({
    ...(filter.objectId ? { object: filter.objectId } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  })}`)

const flowClass = (row: PeriodRow) => (row.flow < 0 ? 'neg' : '')
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Сводка за период') }}</h1>
        <p class="sub">
          {{ filter.from || filter.to
            ? t('с {from} по {to}', { from: filter.from ? dmy(filter.from) : '…', to: filter.to ? dmy(filter.to) : '…' })
            : t('за всё время') }}
          · {{ t('суммы сведены в {currency}', { currency: label }) }}
        </p>
      </div>
      <div class="acts no-print">
        <button type="button" class="btn" @click="print"><Icon name="ph:printer" />{{ t('Печать') }}</button>
        <a v-if="can.seeAllShares" class="btn" :href="exportUrl"><Icon name="ph:file-xls" />{{ t('Excel') }}</a>
      </div>
    </div>

    <div class="filters no-print">
      <div class="f">
        <label>{{ t('Период') }}</label>
        <div class="seg">
          <button
            v-for="r in ranges"
            :key="r.key"
            type="button"
            :aria-pressed="active === r.key"
            @click="setRange(r.key)"
          >
            {{ t(r.label) }}
          </button>
        </div>
      </div>
      <div class="f">
        <label for="rp-from">{{ t('С') }}</label>
        <input id="rp-from" v-model="filter.from" type="date">
      </div>
      <div class="f">
        <label for="rp-to">{{ t('По') }}</label>
        <input id="rp-to" v-model="filter.to" type="date">
      </div>
      <div class="f">
        <label for="rp-obj">{{ t('Объект') }}</label>
        <select id="rp-obj" v-model="filter.objectId">
          <option value="">{{ t('все объекты') }}</option>
          <option v-for="o in state.objects" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <div v-if="!report.count" class="empty">
      <Icon name="ph:chart-bar" />
      <p>{{ t('За этот период операций не было. Возьмите период шире.') }}</p>
    </div>

    <template v-else>
      <section v-if="report.months.length > 1" class="sect">
        <h2><Icon name="ph:chart-bar" />{{ t('По месяцам') }}</h2>
        <div class="panel months">
          <div v-for="mo in report.months" :key="mo.month" class="mo">
            <div class="bars">
              <i class="in" :style="{ height: `${Math.round((mo.inc / peak) * 100)}%` }" :title="sum(mo.inc)" />
              <i class="out" :style="{ height: `${Math.round((mo.out / peak) * 100)}%` }" :title="sum(mo.out)" />
            </div>
            <span>{{ monthName(mo.month) }}</span>
          </div>
        </div>
        <p class="hint" style="margin-top: 10px">
          {{ t('Слева приход, справа расходы с авансами. Самый высокий столбик — {amount}.', { amount: sum(peak) }) }}
        </p>
      </section>

      <section v-for="b in blocks" :key="b.key" class="sect">
        <h2><Icon :name="b.icon" />{{ b.title }}</h2>
        <div v-if="!b.rows.length" class="empty"><Icon name="ph:tray" /><p>{{ t('Пусто за этот период.') }}</p></div>
        <div v-else class="tw">
          <table class="stack">
            <thead>
              <tr>
                <th>{{ t('Название') }}</th>
                <th class="n">{{ t('Приход') }}</th>
                <th class="n">{{ t('Расходы') }}</th>
                <th class="n">{{ t('Авансы') }}</th>
                <th class="n">{{ t('Итого') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in b.rows"
                :key="row.id"
                :class="{ click: b.link }"
                @click="b.link ? router.push(`/objects/${row.id}`) : null"
              >
                <td class="desc"><b>{{ t(row.name) }}</b></td>
                <td class="n" :data-label="t('Приход')">{{ row.inc ? sum(row.inc) : '—' }}</td>
                <td class="n" :data-label="t('Расходы')">{{ row.exp ? sum(row.exp) : '—' }}</td>
                <td class="n" :data-label="t('Авансы')">{{ row.adv ? sum(row.adv) : '—' }}</td>
                <td class="n" :data-label="t('Итого')" :class="flowClass(row)">{{ sum(row.flow) }}</td>
              </tr>
              <tr class="tot">
                <td>{{ t('Итого') }}</td>
                <td class="n" :data-label="t('Приход')">{{ sum(b.sum.inc) }}</td>
                <td class="n" :data-label="t('Расходы')">{{ sum(b.sum.exp) }}</td>
                <td class="n" :data-label="t('Авансы')">{{ sum(b.sum.adv) }}</td>
                <td class="n" :data-label="t('Итого')">{{ sum(b.sum.flow) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="sect">
        <h2><Icon name="ph:tag" />{{ t('По категориям расходов') }}</h2>
        <div class="tw">
          <table class="stack">
            <thead>
              <tr>
                <th>{{ t('Категория') }}</th>
                <th class="n">{{ t('Сумма') }}</th>
                <th class="n">{{ t('Доля') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in cats.rows" :key="row.categoryId" :class="{ auto: row.categoryId === BONUS_CAT }">
                <td class="desc"><b>{{ t(row.name) }}</b></td>
                <td class="n" :data-label="t('Сумма')">{{ sum(row.amount) }}</td>
                <td class="n" :data-label="t('Доля')">{{ percent(row.share, 1) }}</td>
              </tr>
              <tr class="tot">
                <td>{{ t('Итого') }}</td>
                <td class="n" :data-label="t('Сумма')">{{ sum(cats.total) }}</td>
                <td class="n" :data-label="t('Доля')">100 %</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p v-if="can.seeContract" class="hint">
        {{ t('Заказчики ещё должны {amount} — это за всё время, а не за период.', { amount: sum(debt) }) }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.months { display: flex; align-items: flex-end; gap: 10px; overflow-x: auto; }
.mo { display: grid; justify-items: center; gap: 6px; min-width: 46px; }
.mo .bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
.mo .bars i {
  display: block; width: 14px; min-height: 2px;
  border-radius: var(--shape-xs) var(--shape-xs) 0 0;
  transition: height var(--motion-long) var(--ease-decelerate);
}
.mo .bars i.in { background: var(--positive); }
.mo .bars i.out { background: var(--primary); opacity: 0.55; }
.mo span { font-size: 12px; color: var(--on-surface-variant); font-variant-numeric: tabular-nums; }
</style>
