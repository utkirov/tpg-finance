<script setup lang="ts">
import { money, parseMoney } from '#shared/calc'
import { objectTeams, stageTeams } from '#shared/plan'

/** Сколько из плана команды выделено на этот этап и сколько уже потрачено. */
const props = defineProps<{ stageId: string; objectId: string; editable: boolean }>()

const { state, send } = useFinance()
const { notice } = useAsk()
const { t } = useT()
const { m } = useMoney()
const err = useErr()

const object = computed(() => state.value.objects.find(o => o.id === props.objectId) ?? null)
const objCurrency = computed(() => object.value?.currency ?? 'USD')
const objRate = computed(() => object.value?.rate ?? 0)

const plan = computed(() => objectTeams(state.value, props.objectId))
const rows = computed(() => stageTeams(state.value, props.stageId))
const totals = computed(() => ({
  allocated: rows.value.reduce((a, r) => a + r.allocated, 0),
  spent: rows.value.reduce((a, r) => a + r.spent, 0),
  left: rows.value.reduce((a, r) => a + r.left, 0),
}))

/** Команды, у которых есть план на объект, но ещё нечего выделено на этот этап. */
const addable = computed(() => plan.value.filter(p => !rows.value.some(r => r.teamId === p.teamId)))

const editing = ref(false)
const form = reactive({ teamId: '', amount: '' })
const error = ref('')
const busy = ref(false)

const freeOf = (teamId: string) => plan.value.find(p => p.teamId === teamId)?.unallocated ?? 0

function open(teamId: string) {
  form.teamId = teamId
  const row = rows.value.find(r => r.teamId === teamId)
  form.amount = row?.allocated ? money(row.allocated) : ''
  error.value = ''
  editing.value = true
}

function add() {
  const first = addable.value[0] ?? plan.value[0]
  if (first) open(first.teamId)
}

async function save() {
  error.value = ''
  const amount = parseMoney(form.amount || '0')
  if (amount == null || amount < 0) return (error.value = t('Проверьте сумму'))

  busy.value = true
  try {
    await send('/api/allocations', { method: 'POST', body: { stageId: props.stageId, teamId: form.teamId, amount } })
    editing.value = false
  } catch (e) {
    error.value = err(e)
  } finally {
    busy.value = false
  }
}

async function remove(teamId: string) {
  try {
    await send('/api/allocations', { method: 'POST', body: { stageId: props.stageId, teamId, amount: 0 } })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}
</script>

<template>
  <section v-if="rows.length || (editable && plan.length)" class="sect">
    <div class="sect-head">
      <h2>{{ t('Выделено командам на этап') }}</h2>
      <button v-if="editable && plan.length" type="button" class="btn sm tonal no-print" @click="add">
        <Icon name="ph:plus" />{{ t('Выделить') }}
      </button>
    </div>

    <div v-if="!rows.length" class="empty">
      <Icon name="ph:users-three" />
      <p>{{ t('На этот этап командам ничего не выделено. Выделите часть плана — так видно, что этап должен закрыть.') }}</p>
    </div>

    <div v-else class="tw">
      <table class="stack">
        <thead>
          <tr>
            <th>{{ t('Команда') }}</th>
            <th class="n">{{ t('Выделено') }}</th>
            <th class="n">{{ t('Потрачено') }}</th>
            <th class="n">{{ t('Осталось') }}</th>
            <th>{{ t('Закрытие') }}</th>
            <th class="no-print" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.teamId">
            <td class="desc">
              <b>{{ r.name }}</b>
              <small v-if="!r.allocated && r.spent">{{ t('расход проведён без выделения') }}</small>
            </td>
            <td class="n" :data-label="t('Выделено')">{{ m(r.allocated) }}</td>
            <td class="n" :data-label="t('Потрачено')">{{ m(r.spent) }}</td>
            <td class="n" :data-label="t('Осталось')">{{ m(r.left) }}</td>
            <td :data-label="t('Закрытие')">
              <ProgressBar :value="r.allocated > 0 ? r.spent / r.allocated : 0" />
            </td>
            <td class="act no-print">
              <template v-if="editable">
                <button type="button" class="btn sm" @click="open(r.teamId)">
                  <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
                </button>
                <button
                  v-if="r.allocated > 0"
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
            <td class="n" :data-label="t('Выделено')">{{ m(totals.allocated) }}</td>
            <td class="n" :data-label="t('Потрачено')">{{ m(totals.spent) }}</td>
            <td class="n" :data-label="t('Осталось')">{{ m(totals.left) }}</td>
            <td /><td class="no-print" />
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog :open="editing" :title="t('Выделить команде')" icon="ph:users-three" @close="editing = false">
      <div class="f">
        <label for="sa-team">{{ t('Команда') }}</label>
        <select id="sa-team" v-model="form.teamId">
          <option v-for="p in plan" :key="p.teamId" :value="p.teamId">{{ p.name }}</option>
        </select>
      </div>
      <MoneyField
        id="sa-amount"
        v-model="form.amount"
        :label="t('Сумма на этот этап')"
        :currency="objCurrency"
        :rate="objRate"
      />
      <p class="hint">
        {{ t('Свободно по плану команды: {amount}', { amount: money(freeOf(form.teamId)) }) }}
      </p>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="acts">
        <button type="button" class="btn ghost" @click="editing = false">{{ t('Отмена') }}</button>
        <button type="button" class="btn pri" :disabled="busy" @click="save">
          <Icon name="ph:check" />{{ t('Сохранить') }}
        </button>
      </div>
    </AppDialog>
  </section>
</template>
