<script setup lang="ts">
import { money, parseMoney } from '#shared/calc'
import { objectTeams, teamPeople } from '#shared/plan'

/** План расходов по командам на объект: договорились — выделили — потратили. */
const props = defineProps<{ objectId: string; editable: boolean }>()

const { state, send } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const { m } = useMoney()
const err = useErr()

const object = computed(() => state.value.objects.find(o => o.id === props.objectId) ?? null)
const objCurrency = computed(() => object.value?.currency ?? 'USD')
const objRate = computed(() => object.value?.rate ?? 0)

const rows = computed(() => objectTeams(state.value, props.objectId))
const totals = computed(() => ({
  planned: rows.value.reduce((a, r) => a + r.planned, 0),
  allocated: rows.value.reduce((a, r) => a + r.allocated, 0),
  spent: rows.value.reduce((a, r) => a + r.spent, 0),
  left: rows.value.reduce((a, r) => a + r.left, 0),
}))

const free = computed(() => state.value.teams.filter(x => !rows.value.some(r => r.teamId === x.id)))

const editing = ref(false)
const form = reactive({ teamId: '', amount: '', note: '' })
const error = ref('')
const busy = ref(false)

/* ---------- сумма на человека внутри команды ---------- */

const sharing = ref(false)
const shareTeamId = ref('')
const shareRows = ref<Array<{ personId: string; name: string; amount: string; spent: number }>>([])
const shareError = ref('')

const shareTeam = computed(() => rows.value.find(r => r.teamId === shareTeamId.value) ?? null)

/** Сколько из плана команды ещё не расписано — считается на лету, пока правят. */
const shareLeft = computed(() => {
  const planned = shareTeam.value?.planned ?? 0
  const given = shareRows.value.reduce((a, r) => a + (parseMoney(r.amount || '0') ?? 0), 0)
  return planned - given
})

function openPeople(teamId: string) {
  shareTeamId.value = teamId
  shareRows.value = teamPeople(state.value, props.objectId, teamId).map(r => ({
    personId: r.personId,
    name: r.name,
    amount: r.planned ? money(r.planned) : '',
    spent: r.spent,
  }))
  shareError.value = ''
  sharing.value = true
}

async function savePeople() {
  shareError.value = ''
  const people = shareRows.value.map(r => ({ personId: r.personId, amount: parseMoney(r.amount || '0') }))
  if (people.some(x => x.amount == null || x.amount < 0)) return (shareError.value = t('Проверьте сумму'))
  if (shareLeft.value < 0) return (shareError.value = t('По людям расписано больше, чем весь план команды'))

  busy.value = true
  try {
    await send('/api/budgets', {
      method: 'POST',
      body: { objectId: props.objectId, teamId: shareTeamId.value, people },
    })
    sharing.value = false
  } catch (e) {
    shareError.value = err(e)
  } finally {
    busy.value = false
  }
}

const personLine = (teamId: string) =>
  teamPeople(state.value, props.objectId, teamId)
    .filter(r => r.planned > 0)
    .map(r => `${r.name} — ${m(r.planned)}`)
    .join(' · ')

function open(teamId: string) {
  const row = rows.value.find(r => r.teamId === teamId)
  const budget = state.value.budgets.find(b => b.objectId === props.objectId && b.teamId === teamId)
  form.teamId = teamId
  form.amount = row && row.planned ? money(row.planned) : ''
  form.note = budget?.note ?? ''
  error.value = ''
  editing.value = true
}

function add() {
  const first = free.value[0]
  if (first) open(first.id)
}

async function save() {
  error.value = ''
  const amount = parseMoney(form.amount || '0')
  if (amount == null || amount < 0) return (error.value = t('Проверьте сумму плана'))

  busy.value = true
  try {
    await send('/api/budgets', {
      method: 'POST',
      body: { objectId: props.objectId, teamId: form.teamId, amount, note: form.note },
    })
    editing.value = false
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}

async function remove(teamId: string) {
  const row = rows.value.find(r => r.teamId === teamId)
  const go = await ask({
    title: t('Убрать команду из плана?'),
    body: t('Снимется и план, и выделенное на этапы ({amount}). Проведённые расходы останутся.', {
      amount: money(row?.allocated ?? 0),
    }),
  })
  if (!go) return
  try {
    await send('/api/budgets', { method: 'POST', body: { objectId: props.objectId, teamId, amount: 0 } })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}

const teamName = (id: string) => state.value.teams.find(x => x.id === id)?.name ?? '—'
const teamParts = (id: string) => {
  const team = state.value.teams.find(x => x.id === id)
  if (!team?.composite) return ''
  return team.parts.map(teamName).join(' · ')
}
</script>

<template>
  <section class="sect">
    <div class="sect-head">
      <h2>{{ t('Команды и план расходов') }}</h2>
      <button v-if="editable && free.length" type="button" class="btn sm tonal no-print" @click="add">
        <Icon name="ph:plus" />{{ t('Добавить команду') }}
      </button>
    </div>

    <div v-if="!rows.length" class="empty">
      <Icon name="ph:users-three" />
      <p>{{ t('Команды не назначены. Добавьте команду и укажите, о какой сумме с ней договорились.') }}</p>
      <button v-if="editable && free.length" type="button" class="btn pri" @click="add">
        <Icon name="ph:plus" />{{ t('Добавить команду') }}
      </button>
    </div>

    <div v-else class="tw">
      <table class="stack">
        <thead>
          <tr>
            <th>{{ t('Команда') }}</th>
            <th class="n">{{ t('План') }}</th>
            <th class="n">{{ t('Выделено на этапы') }}</th>
            <th class="n">{{ t('Потрачено') }}</th>
            <th class="n">{{ t('Осталось') }}</th>
            <th class="no-print" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.teamId">
            <td class="desc">
              <b>{{ r.name }}</b>
              <small v-if="teamParts(r.teamId)">{{ teamParts(r.teamId) }}</small>
              <small v-if="!r.planned && r.spent">{{ t('расход проведён без плана') }}</small>
              <small v-if="personLine(r.teamId)">{{ personLine(r.teamId) }}</small>
              <small v-if="r.unassigned > 0 && r.planned > 0">
                {{ t('не расписано на людей: {amount}', { amount: m(r.unassigned) }) }}
              </small>
              <small v-if="r.unallocated > 0">
                {{ t('не разнесено по этапам: {amount}', { amount: m(r.unallocated) }) }}
              </small>
            </td>
            <td class="n" :data-label="t('План')">{{ m(r.planned) }}</td>
            <td class="n" :data-label="t('Выделено на этапы')">{{ m(r.allocated) }}</td>
            <td class="n" :data-label="t('Потрачено')">{{ m(r.spent) }}</td>
            <td class="n" :data-label="t('Осталось')" :class="{ neg: r.spent > r.planned && r.planned > 0 }">
              {{ m(r.left) }}
            </td>
            <td class="act no-print">
              <template v-if="editable">
                <button type="button" class="btn sm" @click="open(r.teamId)">
                  <Icon name="ph:pencil-simple" />{{ t('План') }}
                </button>
                <button type="button" class="btn sm" @click="openPeople(r.teamId)">
                  <Icon name="ph:users-three" />{{ t('По людям') }}
                </button>
                <button
                  v-if="r.planned > 0 || r.allocated > 0"
                  type="button"
                  class="x"
                  :title="t('Убрать')"
                  @click="remove(r.teamId)"
                >
                  <Icon name="ph:trash" />
                </button>
              </template>
            </td>
          </tr>
          <tr class="tot">
            <td>{{ t('Итого') }}</td>
            <td class="n" :data-label="t('План')">{{ m(totals.planned) }}</td>
            <td class="n" :data-label="t('Выделено на этапы')">{{ m(totals.allocated) }}</td>
            <td class="n" :data-label="t('Потрачено')">{{ m(totals.spent) }}</td>
            <td class="n" :data-label="t('Осталось')">{{ m(totals.left) }}</td>
            <td class="no-print" />
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog :open="editing" :title="t('План команды')" icon="ph:users-three" @close="editing = false">
      <div class="f">
        <label for="tp-team">{{ t('Команда') }}</label>
        <select id="tp-team" v-model="form.teamId">
          <option v-for="x in state.teams" :key="x.id" :value="x.id">{{ x.name }}</option>
        </select>
      </div>
      <MoneyField
        id="tp-amount"
        v-model="form.amount"
        :label="t('О какой сумме договорились')"
        :currency="objCurrency"
        :rate="objRate"
      />
      <div class="f">
        <label for="tp-note">{{ t('Комментарий') }}</label>
        <input id="tp-note" v-model="form.note" autocomplete="off">
      </div>
      <p class="hint">{{ t('Ноль убирает команду из плана. Из плана потом выделяют суммы на этапы.') }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="acts">
        <button type="button" class="btn ghost" @click="editing = false">{{ t('Отмена') }}</button>
        <button type="button" class="btn pri" :disabled="busy" @click="save">
          <Icon name="ph:check" />{{ t('Сохранить') }}
        </button>
      </div>
    </AppDialog>

    <AppDialog
      :open="sharing"
      :title="t('Кто сколько получает')"
      icon="ph:users-three"
      @close="sharing = false"
    >
      <p class="hint">
        {{ t('План команды «{team}» — {amount}. Разделите его между людьми: эта сумма и будет видна в карточке человека.', {
          team: shareTeam?.name ?? '—',
          amount: money(shareTeam?.planned ?? 0),
        }) }}
      </p>

      <div v-if="!shareRows.length" class="empty">
        <Icon name="ph:user" />
        <p>{{ t('В команде никого нет — добавьте людей в справочниках.') }}</p>
      </div>

      <div v-for="row in shareRows" :key="row.personId" class="f">
        <label :for="`tp-p-${row.personId}`">
          {{ row.name }}
          <span v-if="row.spent" class="dim">· {{ t('уже выплачено {amount}', { amount: money(row.spent) }) }}</span>
        </label>
        <MoneyField
          :id="`tp-p-${row.personId}`"
          v-model="row.amount"
          :label="''"
          :currency="objCurrency"
          :rate="objRate"
        />
      </div>

      <p v-if="shareRows.length" class="hint" :class="{ err: shareLeft < 0 }">
        {{ shareLeft < 0
          ? t('Перебор на {amount}', { amount: money(-shareLeft) })
          : t('Не расписано: {amount}', { amount: money(shareLeft) }) }}
      </p>
      <p v-if="shareError" class="err">{{ shareError }}</p>

      <div class="acts">
        <button type="button" class="btn ghost" @click="sharing = false">{{ t('Отмена') }}</button>
        <button type="button" class="btn pri" :disabled="busy || !shareRows.length" @click="savePeople">
          <Icon name="ph:check" />{{ t('Сохранить') }}
        </button>
      </div>
    </AppDialog>
  </section>
</template>
