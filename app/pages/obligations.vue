<script setup lang="ts">
import { REMIND_DAYS, dmy, obligations, type Op } from '#shared/calc'

/** Предстоящие выплаты: всё, о чём договорились, но деньги не выдали. */
const { state, can, personName, categoryName, send } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const { m } = useMoney()
const err = useErr()

const list = computed(() => obligations(state.value))
const overdue = computed(() => list.value.filter(o => o.overdue))
const soon = computed(() => list.value.filter(o => o.soon))
const total = computed(() => list.value.reduce((a, o) => a + o.op.amountBase, 0))
const sum = (rows: typeof list.value) => rows.reduce((a, o) => a + o.op.amountBase, 0)

const kpis = computed(() => [
  {
    label: t('Всего обязательств'),
    icon: 'ph:clock-countdown',
    value: m(total.value),
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

function label(op: Op): string {
  if (op.kind === 'adv') return `${t('Аванс')} · ${personName(op.personId)}`
  return t(categoryName(op.categoryId)) + (op.personId ? ` · ${personName(op.personId)}` : '')
}

async function settle(op: Op) {
  const go = await ask({
    title: t('Выплата произведена'),
    body: t('{label} — {amount}. Запись станет проведённой сегодняшней датой и уйдёт из обязательств.', {
      label: label(op),
      amount: m(op.amountBase),
    }),
  })
  if (!go) return
  try {
    await send(`/api/ops/${op.id}/settle`, { method: 'POST', body: {} })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Предстоящие выплаты') }}</h1>
        <p class="sub">{{ t('Расходы, о которых договорились, но деньги не выдали. В кассу они не входят.') }}</p>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <div v-if="overdue.length" class="note r">
      <Icon name="ph:warning" />
      <div>
        <b>{{ t('Срок прошёл') }}</b>
      {{ t('{count} записей', { count: overdue.length }) }} — {{ m(sum(overdue)) }}.
      </div>
    </div>

    <div v-if="!list.length" class="empty">
      <Icon name="ph:check-circle" />
      <p>{{ t('Обязательств нет. Они появляются, когда при вводе расхода отмечают «договорились, деньги не выданы».') }}</p>
    </div>

    <div v-else class="tw">
      <table class="stack">
        <thead>
          <tr>
            <th>{{ t('Срок') }}</th>
            <th>{{ t('Обязательство') }}</th>
            <th>{{ t('Объект') }}</th>
            <th class="n">{{ t('Сумма') }}</th>
            <th class="no-print" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in list" :key="row.op.id">
            <td class="n" :data-label="t('Срок')">
              {{ row.op.dueDate ? dmy(row.op.dueDate) : t('без срока') }}
              <span v-if="row.overdue" class="pill r">{{ t('просрочено') }}</span>
              <span v-else-if="row.soon" class="pill g">{{ t('скоро') }}</span>
            </td>
            <td class="desc">
              <b>{{ label(row.op) }}</b>
              <small v-if="row.op.note">{{ row.op.note }}</small>
            </td>
            <td :data-label="t('Объект')">
              <NuxtLink :to="`/stages/${row.op.stageId}`">
                {{ row.objectName }} · {{ t('Этап') }} {{ row.stageNumber }}
              </NuxtLink>
            </td>
            <td class="n" :data-label="t('Сумма')">{{ m(row.op.amountBase) }}</td>
            <td class="act no-print">
              <button v-if="can.write" type="button" class="btn sm" @click="settle(row.op)">
                <Icon name="ph:check-circle" />{{ t('Выплачено') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
