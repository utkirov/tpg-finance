<script setup lang="ts">
import {
  KIND_NAME, OP_STATUS_NAME, closingProblems, dmy, percent, stageOps, totalsOf,
  type Note, type StageStatus,
} from '#shared/calc'
import type { Column } from '~/components/DataTable.vue'

import { stageProgress } from '#shared/plan'

const route = useRoute()
const { state, can, stageById, objectById, personName, filesOf, send } = useFinance()
const { ask, notice } = useAsk()
const ops = useOps()
const { t } = useT()
const err = useErr()

const stage = computed(() => stageById(String(route.params.id)))
const object = computed(() => (stage.value ? objectById(stage.value.objectId) : null))
const { m } = useMoney(() => object.value?.currency)
const totals = computed(() => (stage.value ? totalsOf(state.value, stage.value.id) : null))

const entering = ref(false)
const editing = ref(false)
const filter = reactive({ kind: '', categoryId: '', personId: '' })

const locked = computed(() => stage.value?.status === 'check' || stage.value?.status === 'closed')
const print = () => window.print()

/* ---------- показатели ---------- */

const kpis = computed(() => {
  const st = stage.value
  const c = totals.value
  if (!st || !c) return []
  if (!can.value.seeContract) {
    return [
      {
        label: t('Касса объекта'),
        icon: 'ph:wallet',
        value: m(c.cash),
        sub: t('наличные на руках'),
        tone: c.cash < 0 ? ('bad' as const) : ('acc' as const),
      },
      { label: t('Мои расходы'), icon: 'ph:receipt', value: m(c.exp), sub: t('по этому этапу') },
    ]
  }
  return [
    {
      label: t('Касса этапа'),
      icon: 'ph:wallet',
      value: m(c.cash),
      sub: t('приходы − расходы − авансы'),
      tone: c.cash < 0 ? ('bad' as const) : ('acc' as const),
    },
    {
      label: t('Получено'),
      icon: 'ph:arrow-down-left',
      value: m(c.inc),
      sub: t('из {amount} · долг {debt}', { amount: m(st.amount), debt: m(c.debt) }),
    },
    {
      label: t('Расходы этапа'),
      icon: 'ph:receipt',
      value: m(c.exp),
      sub: can.value.seeBonus ? t('в т. ч. бонус {amount}', { amount: m(c.bonus) }) : t('по всем категориям'),
    },
    { label: t('Чистая доля'), icon: 'ph:chart-pie-slice', value: m(c.net), sub: t('делится между участниками') },
  ]
})

const progress = computed(() =>
  stage.value && totals.value ? stageProgress(stage.value, totals.value) : null)

const shareTotals = computed(() => {
  const parts = totals.value?.parts ?? []
  return {
    percent: parts.reduce((a, p) => a + p.percent, 0),
    amount: parts.reduce((a, p) => a + p.amount, 0),
    paid: parts.reduce((a, p) => a + p.paid, 0),
    due: parts.reduce((a, p) => a + p.due, 0),
  }
})

const problems = computed<Note[]>(() => {
  if (!stage.value || !totals.value || stage.value.status !== 'check') return []
  return closingProblems(stage.value, totals.value)
})

/* ---------- лента ---------- */

const allOps = computed(() => (stage.value ? stageOps(state.value.ops, stage.value.id) : []))
const promised = computed(() => allOps.value.filter(o => o.status === 'promised'))

const rows = computed(() =>
  allOps.value
    .filter(o => o.status !== 'promised')
    .filter(o => (!filter.kind || o.kind === filter.kind)
      && (!filter.categoryId || o.categoryId === filter.categoryId)
      && (!filter.personId || o.personId === filter.personId))
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date))))

const exportUrl = computed(() => `/api/export?stage=${stage.value?.id}`)

/* ---------- действия ---------- */

async function setStatus(status: StageStatus) {
  if (!stage.value) return
  try {
    const res = await send<{ closed: boolean; problems: Note[] }>(`/api/stages/${stage.value.id}/status`, {
      method: 'POST',
      body: { status },
    })
    if (status === 'closed' && !res.closed) {
      await notice(t('Этап не закрывается'), res.problems.map(p => t(p.text, p.params)).join(' '))
    }
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}

async function closeStage() {
  const go = await ask({
    title: t('Закрыть этап'),
    body: t('После закрытия операции блокируются, изменения — только сторно с указанием причины.'),
  })
  if (go) await setStatus('closed')
}

/* ---------- таблицы ---------- */

/** Длинную ленту показываем частями: тысячи строк разом телефон не тянет. */
const PAGE = 200
const shown = ref(PAGE)
watch(() => [filter.kind, filter.categoryId, filter.personId, stage.value?.id], () => (shown.value = PAGE))
const visibleRows = computed(() => rows.value.slice(0, shown.value))

const feedColumns = computed<Column[]>(() => [
  { key: 'date', label: t('Дата'), num: true },
  { key: 'what', label: t('Операция'), desc: true },
  { key: 'amount', label: t('Сумма'), num: true },
  ...(can.value.manage ? [{ key: 'act', label: '', act: true }] : []),
])

const promisedColumns = computed<Column[]>(() => [
  { key: 'due', label: t('Срок'), num: true },
  { key: 'what', label: t('Обязательство'), desc: true },
  { key: 'amount', label: t('Сумма'), num: true },
  { key: 'act', label: '', act: true },
])

const shareColumns = computed<Column[]>(() => [
  { key: 'name', label: t('Участник'), desc: true },
  { key: 'percent', label: '%', num: true },
  { key: 'amount', label: t('Доля'), num: true },
  { key: 'paid', label: t('Выдано'), num: true },
  { key: 'due', label: t('К доплате'), num: true },
])

const shareTotalRow = computed(() => (totals.value && totals.value.parts.length > 1
  ? {
      name: t('Итого') + (stage.value?.status === 'work' || stage.value?.status === 'draft' ? ` · ${t('предв.')}` : ''),
      percent: shareTotals.value.percent,
      amount: m(shareTotals.value.amount),
      paid: m(shareTotals.value.paid),
      due: m(shareTotals.value.due),
    }
  : null))
</script>

<template>
  <div v-if="stage && object && totals">
    <PageHead :title="`${t('Этап')} ${stage.number}${stage.name ? ` · ${stage.name}` : ''}`">
      <template #title><StatusPill :status="stage.status" /></template>
      <template #sub>
        {{ object.name }}
        <template v-if="can.seeContract">
          · {{ t('сумма этапа {amount}', { amount: m(stage.amount) }) }}
        </template>
      </template>

      <template v-if="can.closeStages">
        <button
          v-if="stage.status === 'draft' || stage.status === 'work'"
          type="button"
          class="btn"
          @click="setStatus('check')"
        >
          <Icon name="ph:seal-check" />{{ t('На сверку') }}
        </button>
        <template v-if="stage.status === 'check'">
          <button type="button" class="btn" @click="setStatus('work')">
            <Icon name="ph:arrow-counter-clockwise" />{{ t('Вернуть в работу') }}
          </button>
          <button type="button" class="btn pri" @click="closeStage">
            <Icon name="ph:lock-key" />{{ t('Закрыть этап') }}
          </button>
        </template>
        <button v-if="stage.status === 'closed'" type="button" class="btn" @click="setStatus('check')">
          <Icon name="ph:lock-key-open" />{{ t('Открыть сверку') }}
        </button>
      </template>
      <button v-if="can.manage" type="button" class="btn" @click="editing = true">
        <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
      </button>
      <NuxtLink v-if="can.seeAllShares" class="btn" :to="`/stages/${stage.id}/act`">
        <Icon name="ph:file-text" />{{ t('Акты') }}
      </NuxtLink>
      <button type="button" class="btn" @click="print">
        <Icon name="ph:printer" />{{ t('Печать') }}
      </button>
      <a class="btn" :href="exportUrl"><Icon name="ph:file-xls" />{{ t('Excel') }}</a>
    </PageHead>

    <KpiStrip :items="kpis" />

    <div v-if="can.seeContract && progress" class="closure no-print">
      <div>
        <div class="kpi-l"><Icon name="ph:seal-check" />{{ t('Закрытие этапа') }}</div>
        <ProgressBar :value="progress.overall" :tone="progress.done ? 'ok' : 'warn'" />
        <p class="hint">
          {{ t('заказчик заплатил {inc} · участникам выдано {out}', {
            inc: percent(progress.received),
            out: percent(progress.settled),
          }) }}
        </p>
      </div>
    </div>

    <div v-if="can.seeContract && totals.usage > 0.8" class="note g">
      <Icon name="ph:warning" />
      <div>
        <b>{{ t('Предупреждение') }}</b>
        {{ t('Освоено {percent} поступивших денег.', { percent: percent(totals.usage) }) }}
      </div>
    </div>

    <section v-if="promised.length" class="sect">
      <h2>{{ t('Предстоит выплатить') }} · {{ m(totals.promised) }}</h2>
      <DataTable :columns="promisedColumns" :rows="promised" :row-key="op => op.id" :row-class="() => 'promised'">
        <template #cell-due="{ row }">{{ row.dueDate ? dmy(row.dueDate) : t('без срока') }}</template>
        <template #cell-what="{ row }">
          <b>{{ ops.label(row) }}</b>
          <small v-if="row.note">{{ row.note }}</small>
        </template>
        <template #cell-amount="{ row }">{{ m(row.amountBase) }}</template>
        <template #cell-act="{ row }">
          <button v-if="ops.canSettle(row)" type="button" class="btn sm" @click="ops.settle(row, m(row.amountBase))">
            <Icon name="ph:check-circle" />{{ t('Выплачено') }}
          </button>
        </template>
      </DataTable>
    </section>

    <section v-if="can.seeOwnShare" class="sect">
      <h2>{{ can.seeAllShares ? t('Доли участников') : t('Моя доля') }}</h2>
      <div v-if="!totals.parts.length" class="note">
        <Icon name="ph:info" />
        <div>
          {{ t('Доли не настроены — откройте') }}
          <NuxtLink v-if="can.manage" to="/settings">{{ t('справочники') }}</NuxtLink><template v-else>{{ t('справочники') }}</template>.
        </div>
      </div>
      <DataTable
        v-else
        :columns="shareColumns"
        :rows="totals.parts"
        :row-key="p => p.personId"
        :total="shareTotalRow"
      >
        <template #cell-name="{ row }"><b>{{ personName(row.personId) }}</b></template>
        <template #cell-amount="{ row }">{{ m(row.amount) }}</template>
        <template #cell-paid="{ row }">{{ m(row.paid) }}</template>
        <template #cell-due="{ row }"><span :class="{ neg: row.due < 0 }">{{ m(row.due) }}</span></template>
      </DataTable>
    </section>

    <div v-if="stage.status === 'check' && can.seeContract" class="note" :class="problems.length ? 'r' : 'p'">
      <Icon :name="problems.length ? 'ph:warning' : 'ph:check-circle'" />
      <div>
        <b>{{ t('Контроль закрытия') }}</b>
        <template v-if="problems.length">
          {{ t('Этап не закроется, пока не сойдётся:') }}
          <ul><li v-for="p in problems" :key="p.text">{{ t(p.text, p.params) }}</li></ul>
        </template>
        <template v-else>
          {{ t('Сумма этапа = расходы + доли. Дебиторка ноль, касса ноль — этап можно закрыть.') }}
        </template>
      </div>
    </div>

    <StageAllocationTable
      v-if="can.seeContract"
      :stage-id="stage.id"
      :object-id="object.id"
      :editable="can.manage && stage.status !== 'closed'"
    />

    <section class="sect">
      <div class="sect-head">
        <h2>{{ t('Операции') }} · {{ rows.length }}</h2>
      </div>

      <div class="filters no-print">
        <div class="f">
          <label for="f-kind">{{ t('Тип') }}</label>
          <select id="f-kind" v-model="filter.kind">
            <option value="">{{ t('Все') }}</option>
            <option v-for="(name, kind) in KIND_NAME" :key="kind" :value="kind">{{ t(name) }}</option>
          </select>
        </div>
        <div class="f">
          <label for="f-cat">{{ t('Категория') }}</label>
          <select id="f-cat" v-model="filter.categoryId">
            <option value="">{{ t('Все') }}</option>
            <option v-for="c in state.settings.categories" :key="c.id" :value="c.id">{{ t(c.name) }}</option>
          </select>
        </div>
        <div class="f">
          <label for="f-person">{{ t('Человек') }}</label>
          <select id="f-person" v-model="filter.personId">
            <option value="">{{ t('Все') }}</option>
            <option v-for="p in state.settings.people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <EmptyState
        v-if="!rows.length"
        icon="ph:receipt"
        :text="allOps.length
          ? t('Под фильтр ничего не попало.')
          : t('Операций нет. Начните с прихода от заказчика — строку бонуса система создаст сама.')"
      />

      <template v-else>
        <DataTable
          :columns="feedColumns"
          :rows="visibleRows"
          :row-key="op => op.id"
          :row-class="op => ({ auto: op.isAuto, void: op.status === 'void' })"
        >
          <template #cell-date="{ row }">{{ dmy(row.date) }}</template>
          <template #cell-what="{ row }">
            <b>{{ ops.label(row) }}</b>
            <span v-if="row.isAuto" class="pill g">{{ t('бонус') }}</span>
            <span v-if="row.offObject" class="pill m">{{ t('не по объекту') }}</span>
            <span v-if="row.status === 'void'" class="pill m">{{ t(OP_STATUS_NAME[row.status]) }}</span>
            <small v-if="ops.notes(row).length">{{ ops.notes(row).join(' · ') }}</small>
            <FileThumbs :files="filesOf(row.id)" style="margin-top: 6px" />
          </template>
          <template #cell-amount="{ row }">
            <span :class="{ pos: row.kind === 'in' }">{{ row.kind === 'in' ? '+' : '−' }}{{ m(row.amountBase) }}</span>
          </template>
          <template #cell-act="{ row }">
            <button
              v-if="row.status === 'ok' && !row.isAuto"
              type="button"
              class="btn sm danger"
              @click="ops.reverse(row, m(row.amountBase))"
            >
              <Icon name="ph:arrow-counter-clockwise" />{{ t('Сторно') }}
            </button>
          </template>
        </DataTable>
        <div v-if="rows.length > shown" class="show-more no-print">
          <button type="button" class="btn" @click="shown += PAGE">
            <Icon name="ph:caret-down" />{{ t('Показать ещё {count}', { count: Math.min(PAGE, rows.length - shown) }) }}
          </button>
        </div>
      </template>
    </section>

    <button
      v-if="can.write && !locked"
      type="button"
      class="fab no-print"
      :aria-label="t('Новая операция')"
      @click="entering = true"
    >
      <Icon name="ph:plus" />
      <span class="fab-label">{{ t('Операция') }}</span>
    </button>

    <OpForm :open="entering" :stage="stage" :object="object" @close="entering = false" />
    <StageForm :open="editing" :object="object" :stage="stage" @close="editing = false" />
  </div>

  <EmptyState v-else :text="t('Этап не найден или вам не открыт доступ.')">
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </EmptyState>
</template>
