<script setup lang="ts">
import {
  currencyLabel, formatMoney, objectTotals, otherCurrency, sharesFor, toObjectCurrency, totalsOf,
} from '#shared/calc'
import { objectForecast, stageProgress } from '#shared/plan'

const route = useRoute()
const router = useRouter()
const { state, can, objectById, personName, send } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const err = useErr()

const object = computed(() => objectById(String(route.params.id)))
const { m, m0 } = useMoney(() => object.value?.currency)
const editing = ref(false)
const addingStage = ref(false)
const savingAccess = ref(false)

const totals = computed(() => (object.value ? objectTotals(state.value, object.value.id) : null))
const papers = computed(() => state.value.attachments.filter(a => a.objectId === object.value?.id))

const kpis = computed(() => {
  const o = object.value
  const sums = totals.value
  if (!o || !sums) return []
  const out = []
  if (can.value.seeContract) {
    out.push({
      label: t('Сумма договора'),
      icon: 'ph:handshake',
      value: m0(o.contractAmount),
      sub: o.rate
        ? t('≈ {amount} {currency} по курсу {rate}', {
            amount: formatMoney(toObjectCurrency(o.contractAmount, o.currency, otherCurrency(o.currency), o.rate), otherCurrency(o.currency)),
            currency: currencyLabel(otherCurrency(o.currency)),
            rate: o.rate.toLocaleString('ru-RU'),
          })
        : t('по этапам разнесено {amount}', { amount: m0(sums.planned) }),
    })
  }
  out.push({
    label: t('Касса объекта'),
    icon: 'ph:wallet',
    value: m(sums.cash),
    sub: t('приходы − расходы − авансы'),
    tone: sums.cash < 0 ? ('bad' as const) : ('acc' as const),
  })
  if (can.value.seeContract) out.push({ label: t('Дебиторка'), icon: 'ph:hand-coins', value: m(sums.debt), sub: t('ещё не получено') })
  if (can.value.seeBonus) {
    out.push({
      label: t('Бонус'),
      icon: 'ph:star',
      value: `${o.bonusRate} %`,
      sub: t('получатель: {name}', { name: personName(o.bonusPersonId) }),
      tone: 'warn' as const,
    })
  }
  if (sums.promised) {
    out.push({ label: t('Предстоит выплатить'), icon: 'ph:clock-countdown', value: m(sums.promised), sub: t('обязательства'), tone: 'warn' as const })
  }
  return out
})

/* доступ к объекту */
const grantable = computed(() => state.value.users.filter(u => u.role === 'member' || u.role === 'foreman'))
const granted = ref<string[]>([])
watch(
  [object, () => state.value.users],
  () => {
    if (!object.value) return
    granted.value = state.value.users.filter(u => u.objectIds.includes(object.value!.id)).map(u => u.id)
  },
  { immediate: true },
)

/* доли: по каждому этапу и прогноз по всему договору */
const forecast = computed(() => {
  const o = object.value
  if (!o || !can.value.seeOwnShare) return null
  return objectForecast(state.value, o, sharesFor(state.value, o))
})

const stageList = computed(() => totals.value?.stages ?? [])

const shareRows = computed(() =>
  (forecast.value?.parts ?? []).map(part => ({
    part,
    name: personName(part.personId),
    byStage: stageList.value.map((st) => {
      const p = totalsOf(state.value, st.id).parts.find(x => x.personId === part.personId)
      return { id: st.id, number: st.number, amount: p?.amount ?? 0, paid: p?.paid ?? 0, due: p?.due ?? 0 }
    }),
  })))

const progressOf = (stageId: string) => {
  const stage = stageList.value.find(s => s.id === stageId)
  return stage ? stageProgress(stage, totalsOf(state.value, stage.id)) : null
}

const accessLoaded = computed(() => state.value.users.length > 0)
const hadAccess = computed(() => state.value.users.some(u => u.objectIds.includes(object.value?.id ?? '')))

async function saveAccess() {
  if (!object.value || !accessLoaded.value) return

  // Пустой список отзывает доступ у всех — это спрашиваем вслух.
  if (!granted.value.length && hadAccess.value) {
    const go = await ask({
      title: t('Закрыть доступ всем?'),
      body: t('Никто, кроме владельца и бухгалтера, не увидит этот объект. Записи останутся на месте.'),
    })
    if (!go) return
  }

  savingAccess.value = true
  try {
    await send(`/api/objects/${object.value.id}/access`, { method: 'POST', body: { userIds: granted.value } })
    await notice(t('Доступ сохранён'), t('Изменения вступают в силу при следующем открытии приложения этими людьми.'))
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  } finally {
    savingAccess.value = false
  }
}

function toggle(id: string) {
  granted.value = granted.value.includes(id) ? granted.value.filter(x => x !== id) : [...granted.value, id]
}
</script>

<template>
  <div v-if="object">
    <div class="head-row">
      <div>
        <h1>{{ object.name }}</h1>
        <p class="sub">
          {{ object.customer || '—' }}<template v-if="object.address"> · {{ object.address }}</template>
          <template v-if="can.seeContract"> · {{ t('основание: {basis}', { basis: t(object.basisType) }) }}</template>
          <template v-if="can.seeContract && object.basisNote"> ({{ object.basisNote }})</template>
        </p>
      </div>
      <div class="acts no-print">
        <NuxtLink v-if="can.seeAllShares" class="btn" :to="`/objects/${object.id}/journal`">
          <Icon name="ph:clock-counter-clockwise" />{{ t('Журнал изменений') }}
        </NuxtLink>
        <template v-if="can.manage">
          <button type="button" class="btn" @click="editing = true">
            <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
          </button>
          <button type="button" class="btn pri" @click="addingStage = true">
            <Icon name="ph:plus" />{{ t('Добавить этап') }}
          </button>
        </template>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <div v-if="can.seeContract && object.basisType === 'устно' && !papers.length" class="note g">
      <Icon name="ph:warning" />
      <div>
        <b>{{ t('Нет документа-основания') }}</b>
        {{ t('Договорённость записана как устная. Приложите хотя бы фото расписки или страницы блокнота.') }}
      </div>
    </div>

    <section v-if="papers.length" class="sect">
      <h2>{{ t('Документы') }}</h2>
      <div class="files">
        <a v-for="f in papers" :key="f.id" class="file" :href="`/api/attachments/${f.id}`" target="_blank" rel="noopener">
          <img v-if="f.mime.startsWith('image/')" :src="`/api/attachments/${f.id}`" :alt="t(f.kind)">
          <Icon v-else name="ph:file-text" />
          <span><b>{{ t(f.kind) }}</b><br>{{ f.filename }}</span>
        </a>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Этапы') }}</h2>

      <div v-if="!totals?.stages.length" class="empty">
        <Icon name="ph:list-checks" />
        <p>{{ t('Этапов нет. Все расчёты замкнуты внутри этапа — создайте хотя бы один.') }}</p>
        <button v-if="can.manage" type="button" class="btn pri" @click="addingStage = true">
          <Icon name="ph:plus" />{{ t('Добавить этап') }}
        </button>
      </div>

      <div v-else class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Этап') }}</th>
              <th v-if="can.seeContract" class="n">{{ t('Сумма') }}</th>
              <th v-if="can.seeContract" class="n">{{ t('Получено') }}</th>
              <th class="n">{{ t('Расходы') }}</th>
              <th class="n">{{ t('Касса') }}</th>
              <th>{{ t('Закрытие') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="st in totals.stages" :key="st.id" class="click" @click="router.push(`/stages/${st.id}`)">
              <td class="desc">
                <b>{{ t('Этап') }} {{ st.number }}<StatusPill :status="st.status" /></b>
                <small v-if="st.name">{{ st.name }}</small>
              </td>
              <td v-if="can.seeContract" class="n" :data-label="t('Сумма')">{{ m(st.amount) }}</td>
              <td v-if="can.seeContract" class="n" :data-label="t('Получено')">{{ m(totalsOf(state, st.id).inc) }}</td>
              <td class="n" :data-label="t('Расходы')">{{ m(totalsOf(state, st.id).exp) }}</td>
              <td class="n" :data-label="t('Касса')" :class="{ neg: totalsOf(state, st.id).cash < 0 }">
                {{ m(totalsOf(state, st.id).cash) }}
              </td>
              <td :data-label="t('Закрытие')">
                <ProgressBar
                  :value="progressOf(st.id)?.overall ?? 0"
                  :tone="progressOf(st.id)?.done ? 'ok' : 'warn'"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="shareRows.length" class="sect">
      <h2><Icon name="ph:chart-pie-slice" />{{ t('Доли участников') }}</h2>

      <div class="share-cards">
        <div v-for="row in shareRows" :key="row.part.personId" class="panel share-card">
          <div class="sc-h">
            <b>{{ row.name }}</b>
            <span class="pill">{{ row.part.percent }} %</span>
          </div>
          <div class="sc-v num" :class="{ neg: row.part.due < 0 }">{{ m(row.part.due) }}</div>
          <div class="sc-s">
            {{ t('осталось по прогнозу · всего по договору {amount}', { amount: m(row.part.amount) }) }}
          </div>
          <div v-if="row.byStage.length" class="sc-cap">{{ t('по этапам сейчас') }}</div>
          <dl v-if="row.byStage.length" class="sc-st">
            <template v-for="cell in row.byStage" :key="cell.id">
              <dt>{{ t('Этап') }} {{ cell.number }}</dt>
              <dd>
                <span class="dim">{{ m(cell.paid) }}</span> →
                <b :class="{ neg: cell.due < 0 }">{{ m(cell.due) }}</b>
              </dd>
            </template>
          </dl>
        </div>
      </div>

      <p v-if="forecast" class="hint" style="margin-top: 12px">
        {{ t('По этапам: слева получено, справа осталось. Прогноз по договору — за вычетом расходов ({spent}) и остатка планов команд ({plan}).', {
          spent: m(forecast.spent),
          plan: m(forecast.planLeft),
        }) }}
      </p>
    </section>

    <TeamPlanTable v-if="can.seeContract" :object-id="object.id" :editable="can.manage" />

    <section v-if="can.manage" class="sect no-print">
      <h2>{{ t('Кто допущен к объекту') }}</h2>
      <div class="panel">
        <p class="hint" style="margin-bottom: 10px">
          {{ t('Прорабы и участники видят только назначенные объекты. Владелец и бухгалтер — все.') }}
        </p>
        <div class="chips" style="margin-bottom: 12px">
          <button
            v-for="u in grantable"
            :key="u.id"
            type="button"
            :aria-pressed="granted.includes(u.id)"
            @click="toggle(u.id)"
          >
            {{ u.name }} · {{ u.role === 'foreman' ? t('прораб') : t('участник') }}
          </button>
          <span v-if="!grantable.length" class="hint">
            {{ t('Прорабов и участников пока нет — заведите их в справочниках.') }}
          </span>
        </div>
        <button
          v-if="grantable.length"
          type="button"
          class="btn"
          :disabled="savingAccess || !accessLoaded"
          @click="saveAccess"
        >
          <Icon name="ph:check" />{{ t('Сохранить доступ') }}
        </button>
      </div>
    </section>

    <ObjectForm :open="editing" :object="object" @close="editing = false" />
    <StageForm
      :open="addingStage"
      :object="object"
      @close="addingStage = false"
      @saved="id => router.push(`/stages/${id}`)"
    />
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Объект не найден или вам не открыт доступ.') }}</p>
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </div>
</template>
