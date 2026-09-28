<script setup lang="ts">
import {
  KIND_NAME, OP_STATUS_NAME, closingProblems, dmy, formatMoney, percent, stageOps, today, totalsOf,
  type Note, type Op, type StageStatus,
} from '#shared/calc'

import { stageProgress } from '#shared/plan'

const route = useRoute()
const { state, raw, can, stageById, objectById, rawStageById, rawObjectById, personName, categoryName, teamName, filesOf, send } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const err = useErr()

const stage = computed(() => stageById(String(route.params.id)))
const object = computed(() => (stage.value ? objectById(stage.value.objectId) : null))
// Формы вводят суммы в валюте учёта объекта — им нужны исходные данные, а не пересчёт для экрана.
const rawStage = computed(() => rawStageById(String(route.params.id)))
const rawObject = computed(() => (stage.value ? rawObjectById(stage.value.objectId) : null))
const { m, code: shownCode } = useMoney()
const totals = computed(() => (stage.value ? totalsOf(state.value, stage.value.id) : null))

const entering = ref(false)
/** «Исправить»: исходная запись (в валюте учёта), форма откроется заполненной ею. */
const fixing = ref<Op | null>(null)
function fixOp(op: Op) {
  fixing.value = raw.value.ops.find(o => o.id === op.id) ?? null
  entering.value = true
}
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
  // Под кассой — то, что в ней не свободно: неполученный бонус и курсовая разница.
  const cashNotes = [t('приходы − расходы − авансы')]
  if (c.bonusPending) cashNotes.push(t('свободно {free} без неполученного бонуса', { free: m(c.cash - c.bonusPending) }))
  if (c.fxDiff) cashNotes.push(t('в т. ч. курсовая разница {amount}', { amount: m(c.fxDiff) }))
  return [
    {
      label: t('Касса этапа'),
      icon: 'ph:wallet',
      value: m(c.cash),
      sub: cashNotes.join(' · '),
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
      sub: can.value.seeBonus ? t('в т. ч. полученный бонус {amount}', { amount: m(c.bonus) }) : t('по всем категориям'),
    },
    { label: t('Чистая доля'), icon: 'ph:chart-pie-slice', value: m(c.net), sub: t('получено − расходы, делится между участниками') },
    ...(c.bonusPending
      ? [{
          label: t('Бонус не получен'),
          icon: 'ph:star',
          value: m(c.bonusPending),
          sub: t('в расчёт не идёт, пока не отмечен'),
          tone: 'warn' as const,
        }]
      : []),
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

// Закрытие проверяется в валюте учёта, как на сервере: в другой валюте касса
// может «не сойтись» на курсовую разницу, а это не деньги.
const problems = computed<Note[]>(() => {
  const st = rawStage.value
  const book = st ? raw.value.totals[st.id] : null
  if (!st || !book || st.status !== 'check') return []
  return closingProblems(st, book, personName)
})

/* ---------- лента ---------- */

const allOps = computed(() => (stage.value ? stageOps(state.value.ops, stage.value.id) : []))

// Сторно и отменённые записи в расчёт не входят и по умолчанию скрыты: лента — про живые деньги.
const showVoid = ref(false)
const voidCount = computed(() => allOps.value.filter(o => o.status === 'void').length)

const rows = computed(() =>
  allOps.value
    .filter(o => showVoid.value || o.status !== 'void')
    .filter(o => (!filter.kind || o.kind === filter.kind)
      && (!filter.categoryId || o.categoryId === filter.categoryId)
      && (!filter.personId || o.personId === filter.personId))
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date))))

const exportUrl = computed(() => `/api/export?stage=${stage.value?.id}`)

function opLabel(op: Op): string {
  if (op.kind === 'in') return t('Приход от заказчика')
  if (op.kind === 'adv') {
    const who = personName(op.personId)
    return op.offObject ? `${t('Расход не по объекту')} · ${who}` : `${t('Аванс')} · ${who}`
  }
  const team = op.teamId ? `${teamName(op.teamId)} · ` : ''
  return team + t(categoryName(op.categoryId)) + (op.personId ? ` · ${personName(op.personId)}` : '')
}

function opNotes(op: Op): string[] {
  const out: string[] = []
  if (op.isAuto && !op.reversesId) {
    out.push(op.received
      ? t('бонус получен {date}', { date: dmy(op.receivedAt) })
      : t('бонус начислен, не получен — в расчёт не идёт'))
  }
  if (op.note) out.push(op.note)
  if (op.currency !== shownCode.value) {
    // Как записали: сумма в валюте операции и курс доллара на её дату.
    out.push(t('записано {amount} · курс {fx}', {
      amount: formatMoney(op.amount, op.currency),
      fx: op.fx ? op.fx.toLocaleString('ru-RU') : '—',
    }))
  }
  if (op.reversesId) out.push(t('сторно') + (op.reason ? `: ${op.reason}` : ''))
  else if (op.status === 'void') out.push(t('отменено') + (op.reason ? `: ${op.reason}` : ''))
  return out
}

/* ---------- действия ---------- */

async function setStatus(status: StageStatus, extra: { force?: boolean; reason?: string } = {}) {
  if (!stage.value) return
  try {
    const res = await send<{ closed: boolean; problems: Note[]; softOnly?: boolean }>(`/api/stages/${stage.value.id}/status`, {
      method: 'POST',
      body: { status, ...extra },
    })
    if (status === 'closed' && !res.closed) {
      const text = res.problems.map(p => t(p.text, p.params)).join(' ')
      if (!res.softOnly) return await notice(t('Этап не закрывается'), text)
      // Касса сошлась, но между участниками перекос — закрыть можно только осознанно.
      const reason = await ask({
        title: t('Перекос между участниками'),
        body: `${text} ${t('Касса этапа ноль, но одному переплачено за счёт другого. Закрыть всё равно?')}`,
        label: t('Причина'),
        ok: t('Закрыть с расхождением'),
      })
      if (reason) await setStatus('closed', { force: true, reason })
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

async function voidOp(op: Op) {
  const reason = await ask({
    title: t('Сторнировать операцию'),
    body: t('{kind} {amount} от {date}. Запись не удаляется — создаётся обратная, обе видны в ленте.', {
      kind: t(KIND_NAME[op.kind]),
      amount: m(op.amountBase),
      date: dmy(op.date),
    }),
    label: t('Причина'),
  })
  if (!reason) return
  try {
    await send(`/api/ops/${op.id}/void`, { method: 'POST', body: { reason } })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}

/** Бонус получен (с датой) / снять отметку. Пока не получен — в расходы и доли не идёт. */
async function toggleBonus(op: Op) {
  const received = !op.received
  const answer = await ask({
    title: received ? t('Бонус получен') : t('Снять отметку «получен»'),
    body: received
      ? t('{name} — {amount}. Бонус войдёт в расходы этапа и уменьшит чистую долю.', { name: personName(op.personId), amount: m(op.amountBase) })
      : t('Бонус выйдет из расходов этапа, деньги снова будут числиться в кассе.'),
    ...(received ? { label: t('Дата получения'), inputType: 'date' as const, value: today() } : {}),
  })
  if (!answer) return
  try {
    await send(`/api/ops/${op.id}/bonus`, { method: 'POST', body: { received, date: received ? answer : undefined } })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}
</script>

<template>
  <div v-if="stage && object && totals">
    <div class="head-row">
      <div>
        <h1>
          {{ t('Этап') }} {{ stage.number }}<template v-if="stage.name"> · {{ stage.name }}</template>
          <StatusPill :status="stage.status" />
        </h1>
        <p class="sub">
          {{ object.name }}
          <template v-if="can.seeContract">
            · {{ t('сумма этапа {amount}', { amount: m(stage.amount) }) }}
          </template>
        </p>
      </div>

      <div class="acts no-print">
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
      </div>
    </div>

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

    <section v-if="can.seeOwnShare" class="sect">
      <h2>{{ can.seeAllShares ? t('Доли участников') : t('Моя доля') }}</h2>
      <div class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Участник') }}</th>
              <th class="n">%</th>
              <th class="n">{{ t('Доля') }}</th>
              <th class="n">{{ t('Выдано') }}</th>
              <th class="n">{{ t('К доплате') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!totals.parts.length">
              <td colspan="5" class="dim">
                {{ t('Доли не настроены — откройте') }} <NuxtLink to="/settings">{{ t('справочники') }}</NuxtLink>.
              </td>
            </tr>
            <tr v-for="p in totals.parts" :key="p.personId">
              <td class="desc"><b>{{ personName(p.personId) }}</b></td>
              <td class="n" data-label="%">{{ p.percent }}</td>
              <td class="n" :data-label="t('Доля')">{{ m(p.amount) }}</td>
              <td class="n" :data-label="t('Выдано')">{{ m(p.paid) }}</td>
              <td class="n" :data-label="t('К доплате')" :class="{ neg: p.due < 0 }">{{ m(p.due) }}</td>
            </tr>
            <tr v-if="totals.parts.length > 1" class="tot">
              <td>
                {{ t('Итого') }}
                <span v-if="stage.status === 'work' || stage.status === 'draft'" class="pill m">{{ t('предв.') }}</span>
              </td>
              <td class="n" data-label="%">{{ shareTotals.percent }}</td>
              <td class="n" :data-label="t('Доля')">{{ m(shareTotals.amount) }}</td>
              <td class="n" :data-label="t('Выдано')">{{ m(shareTotals.paid) }}</td>
              <td class="n" :data-label="t('К доплате')">{{ m(shareTotals.due) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
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
          {{ t('Дебиторка ноль, бонус получен, касса ноль — этап можно закрыть.') }}
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
        <button
          v-if="voidCount"
          type="button"
          class="btn sm no-print"
          :class="{ tonal: showVoid }"
          :aria-pressed="showVoid"
          @click="showVoid = !showVoid"
        >
          <Icon name="ph:arrow-counter-clockwise" />
          {{ showVoid ? t('Скрыть сторно') : t('Показать сторно · {count}', { count: voidCount }) }}
        </button>
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

      <div v-if="!rows.length" class="empty">
        <Icon name="ph:receipt" />
        <p v-if="allOps.length">{{ t('Под фильтр ничего не попало.') }}</p>
        <p v-else>{{ t('Операций нет. Начните с прихода от заказчика — строку бонуса система создаст сама.') }}</p>
      </div>

      <div v-else class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Дата') }}</th><th>{{ t('Операция') }}</th><th class="n">{{ t('Сумма') }}</th><th class="no-print" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in rows" :key="op.id" :class="{ auto: op.isAuto, void: op.status === 'void', pending: op.isAuto && !op.received }">
              <td class="n" :data-label="t('Дата')">{{ dmy(op.date) }}</td>
              <td class="desc">
                <b>{{ opLabel(op) }}</b>
                <span v-if="op.isAuto" class="pill g">{{ t('бонус') }}</span>
                <span v-if="op.isAuto && op.status === 'ok' && !op.received" class="pill m">{{ t('не получен') }}</span>
                <span v-if="op.offObject" class="pill m">{{ t('не по объекту') }}</span>
                <span v-if="op.status === 'void'" class="pill m">{{ t(OP_STATUS_NAME[op.status]) }}</span>
                <small v-if="opNotes(op).length">{{ opNotes(op).join(' · ') }}</small>
                <span v-if="filesOf(op.id).length" class="files" style="margin-top: 6px">
                  <a
                    v-for="f in filesOf(op.id)"
                    :key="f.id"
                    class="file"
                    :href="`/api/attachments/${f.id}`"
                    target="_blank"
                    rel="noopener"
                  >
                    <img v-if="f.mime.startsWith('image/')" :src="`/api/attachments/${f.id}`" alt="">
                    <span>{{ f.mime.startsWith('image/') ? t('фото') : t('файл') }}</span>
                  </a>
                </span>
              </td>
              <td class="n" :data-label="t('Сумма')" :class="{ pos: op.kind === 'in' }">
                {{ op.kind === 'in' ? '+' : '−' }}{{ m(op.amountBase) }}
              </td>
              <td class="act no-print">
                <button
                  v-if="can.write && op.isAuto && op.status === 'ok' && !locked"
                  type="button"
                  class="btn sm"
                  :class="{ tonal: !op.received }"
                  @click="toggleBonus(op)"
                >
                  <Icon :name="op.received ? 'ph:x' : 'ph:check-circle'" />{{ op.received ? t('Не получен') : t('Получено') }}
                </button>
                <button
                  v-if="can.closeStages && op.status === 'ok' && !op.isAuto && !locked"
                  type="button"
                  class="btn sm"
                  @click="fixOp(op)"
                >
                  <Icon name="ph:pencil-simple" />{{ t('Исправить') }}
                </button>
                <button
                  v-if="can.closeStages && op.status === 'ok' && !op.isAuto"
                  type="button"
                  class="btn sm danger"
                  @click="voidOp(op)"
                >
                  <Icon name="ph:arrow-counter-clockwise" />{{ t('Сторно') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <button
      v-if="can.write && !locked"
      type="button"
      class="fab no-print"
      :aria-label="t('Новая операция')"
      @click="fixing = null; entering = true"
    >
      <Icon name="ph:plus" />
      <span class="fab-label">{{ t('Операция') }}</span>
    </button>

    <OpForm
      v-if="rawStage && rawObject"
      :open="entering"
      :stage="rawStage"
      :object="rawObject"
      :edit="fixing"
      @close="entering = false; fixing = null"
    />
    <StageForm v-if="rawStage && rawObject" :open="editing" :object="rawObject" :stage="rawStage" @close="editing = false" />
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Этап не найден или вам не открыт доступ.') }}</p>
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </div>
</template>
