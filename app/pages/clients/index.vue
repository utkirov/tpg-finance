<script setup lang="ts">
import { objectTotals } from '#shared/calc'
import type { Client } from '#shared/calc'

/** CRM: список клиентов с поиском. Отсюда попадают в объекты клиента. */
const { state, can } = useFinance()
const { t } = useT()
const { m } = useMoney()
const router = useRouter()

const query = ref('')
const editing = ref<Client | null>(null)
const showForm = ref(false)

const objectsOf = (id: string) => state.value.objects.filter(o => o.clientId === id)

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return state.value.clients
    .filter(c => !q || `${c.name} ${c.phone} ${c.phone2} ${c.email} ${c.source}`.toLowerCase().includes(q))
    .map(c => ({
      c,
      objects: objectsOf(c.id),
      contract: objectsOf(c.id).reduce((a, o) => a + o.contractAmount, 0),
      debt: objectsOf(c.id).reduce((a, o) => a + objectTotals(state.value, o.id).debt, 0),
    }))
    .sort((a, b) => b.contract - a.contract || a.c.name.localeCompare(b.c.name, 'ru'))
})

function open(client: Client | null) {
  editing.value = client
  showForm.value = true
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Клиенты') }}</h1>
        <p class="sub">{{ t('Кто заказывает работы, как с ним связаться и какие у него объекты.') }}</p>
      </div>
      <button v-if="can.manage" type="button" class="btn pri no-print" @click="open(null)">
        <Icon name="ph:plus" />{{ t('Новый клиент') }}
      </button>
    </div>

    <div class="filters no-print">
      <div class="f" style="flex: 1 1 280px">
        <label for="cl-search">{{ t('Поиск') }}</label>
        <input id="cl-search" v-model="query" :placeholder="t('Поиск по имени или телефону')" autocomplete="off">
      </div>
    </div>

    <div v-if="!rows.length" class="empty">
      <Icon name="ph:identification-card" />
      <p v-if="state.clients.length">{{ t('Под поиск никто не попал.') }}</p>
      <p v-else>{{ t('Клиентов пока нет. Заведите первого — объекты привязываются к нему.') }}</p>
      <button v-if="can.manage" type="button" class="btn pri" @click="open(null)">
        <Icon name="ph:plus" />{{ t('Новый клиент') }}
      </button>
    </div>

    <div v-else class="tw">
      <table class="stack">
        <thead>
          <tr>
            <th>{{ t('Клиент') }}</th>
            <th>{{ t('Связь') }}</th>
            <th>{{ t('Откуда пришёл') }}</th>
            <th class="n">{{ t('Объектов') }}</th>
            <th class="n">{{ t('Сумма договоров') }}</th>
            <th class="n">{{ t('Дебиторка') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.c.id" class="click" @click="router.push(`/clients/${row.c.id}`)">
            <td class="desc">
              <b>{{ row.c.name }}</b>
              <small v-if="row.c.note">{{ row.c.note }}</small>
            </td>
            <td :data-label="t('Связь')" class="mono">{{ row.c.phone || '—' }}</td>
            <td :data-label="t('Откуда пришёл')">{{ row.c.source ? t(row.c.source) : '—' }}</td>
            <td class="n" :data-label="t('Объектов')">{{ row.objects.length }}</td>
            <td class="n" :data-label="t('Сумма договоров')">{{ m(row.contract) }}</td>
            <td class="n" :data-label="t('Дебиторка')">{{ m(row.debt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ClientForm :open="showForm" :client="editing" @close="showForm = false" />
  </div>
</template>
