<script setup lang="ts">
import { dmy, personSummary, today } from '#shared/calc'
import { personPlan } from '#shared/plan'

/**
 * Карточка человека. Главный вопрос: в каких объектах он занят,
 * сколько уже получил, сколько ещё нет и когда ждать следующие деньги.
 */
const route = useRoute()
const { state, personName } = useFinance()
const { t } = useT()
const { m } = useMoney()

const personId = computed(() => String(route.params.id))
const person = computed(() => state.value.settings.people.find(p => p.id === personId.value) ?? null)
const summary = computed(() => personSummary(state.value, personId.value))
const plan = computed(() => personPlan(state.value, personId.value))

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
</script>

<template>
  <div v-if="person">
    <div class="head-row">
      <div>
        <h1>{{ person.name }}</h1>
        <p class="sub">
          {{ person.role ? t(person.role) : t('без роли') }}
          <template v-if="plan.teamName"> · {{ plan.teamName }}</template>
          <template v-if="person.isSharer"> · {{ t('участник дележа') }}</template>
          <template v-if="person.phone"> · {{ person.phone }}</template>
        </p>
      </div>
      <div class="acts no-print">
        <button type="button" class="btn" @click="print"><Icon name="ph:printer" />{{ t('Акт сверки на печать') }}</button>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <p v-if="plan.basis === 'team' && !plan.personal && plan.teamSize > 1" class="hint no-print" style="margin: -8px 0 18px">
      {{ t('План — общий на всю команду, в ней {count} чел. Получено — только его выплаты.', { count: plan.teamSize }) }}
    </p>
    <p v-else class="hint no-print" style="margin: -8px 0 18px">
      {{ t('Сверка составлена {date}. Суммы — по объектам, доступным вам.', { date: dmy(today()) }) }}
    </p>

    <section class="sect">
      <h2>{{ t('По объектам') }}</h2>
      <div v-if="!plan.rows.length" class="empty">
        <Icon name="ph:tray" />
        <p>{{ t('Этот человек ещё нигде не встречается.') }}</p>
      </div>
      <div v-else class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Объект') }}</th>
              <th class="n">{{ t('Причитается') }}</th>
              <th class="n">{{ t('Получено') }}</th>
              <th class="n">{{ t('Осталось') }}</th>
              <th>{{ t('Когда') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in plan.rows" :key="r.objectId">
              <td class="desc">
                <b><NuxtLink :to="`/objects/${r.objectId}`">{{ r.objectName }}</NuxtLink></b>
              </td>
              <td class="n" :data-label="t('Причитается')">{{ m(r.expected) }}</td>
              <td class="n" :data-label="t('Получено')">{{ m(r.paid) }}</td>
              <td class="n" :data-label="t('Осталось')" :class="{ acc: r.left > 0 }">{{ m(r.left) }}</td>
              <td :data-label="t('Когда')">
                {{ when(r) }}
                <span v-if="r.promised" class="pill m">{{ t('обещано {amount}', { amount: m(r.promised) }) }}</span>
              </td>
            </tr>
            <tr class="tot">
              <td>{{ t('Итого') }}</td>
              <td class="n" :data-label="t('Причитается')">{{ m(plan.expected) }}</td>
              <td class="n" :data-label="t('Получено')">{{ m(plan.paid) }}</td>
              <td class="n" :data-label="t('Осталось')">{{ m(plan.left) }}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Операции с его участием') }}</h2>
      <div v-if="!ops.length" class="empty"><Icon name="ph:receipt" /><p>{{ t('Операций нет.') }}</p></div>
      <div v-else class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Дата') }}</th>
              <th>{{ t('Объект') }}</th>
              <th>{{ t('Операция') }}</th>
              <th class="n">{{ t('Сумма') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in ops" :key="op.id" :class="{ auto: op.isAuto, promised: op.status === 'promised' }">
              <td class="n" :data-label="t('Дата')">{{ dmy(op.date) }}</td>
              <td :data-label="t('Объект')">
                <NuxtLink :to="`/stages/${op.stageId}`">{{ objectName(op.objectId) }}</NuxtLink>
              </td>
              <td class="desc">
                <b>{{ op.isAuto ? t('Бонус') : op.kind === 'adv' ? t('Аванс') : t('Расход объекта') }}</b>
                <small v-if="op.note">{{ op.note }}</small>
                <span v-if="op.status === 'promised'" class="pill m">{{ t('обещано') }}</span>
              </td>
              <td class="n" :data-label="t('Сумма')">{{ m(op.amountBase) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="sign" style="display: none">
      <div>{{ t('Владелец — подпись, дата') }}</div>
      <div>{{ t('{name} — подпись, дата', { name: personName(personId) }) }}</div>
    </div>
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Человек не найден.') }}</p>
    <NuxtLink to="/people" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку людей') }}</NuxtLink>
  </div>
</template>

<style scoped>
@media print {
  .sign { display: grid !important; }
}
</style>
