<script setup lang="ts">
import { objectTotals } from '#shared/calc'
import type { Client } from '#shared/calc'
import type { Column } from '~/components/DataTable.vue'

/** CRM: список клиентов с поиском. Отсюда попадают в объекты клиента. */
const { state, can, toMain } = useFinance()
const { t } = useT()
const { m } = useMoney()
const router = useRouter()

const query = ref('')
const editing = ref<Client | null>(null)
const showForm = ref(false)

// Суммы по объектам клиента — в основной валюте: у него могут быть объекты в разных.
const all = computed(() => state.value.clients.map((c) => {
  const objects = state.value.objects.filter(o => o.clientId === c.id)
  return {
    id: c.id,
    c,
    objects,
    contract: objects.reduce((a, o) => a + toMain(o.contractAmount, o.id), 0),
    debt: objects.reduce((a, o) => a + toMain(objectTotals(state.value, o.id).debt, o.id), 0),
  }
}))

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return all.value
    .filter(({ c }) => !q || `${c.name} ${c.phone} ${c.phone2} ${c.email} ${c.source}`.toLowerCase().includes(q))
    .sort((a, b) => b.contract - a.contract || a.c.name.localeCompare(b.c.name, 'ru'))
})

const kpis = computed(() => [
  { label: t('Клиентов'), icon: 'ph:identification-card', value: String(all.value.length), sub: t('в CRM') },
  { label: t('С объектами'), icon: 'ph:buildings', value: String(all.value.filter(r => r.objects.length).length), sub: t('заключены договоры') },
  { label: t('Сумма договоров'), icon: 'ph:handshake', value: m(all.value.reduce((a, r) => a + r.contract, 0)), sub: t('по всем клиентам') },
  { label: t('Дебиторка'), icon: 'ph:hand-coins', value: m(all.value.reduce((a, r) => a + r.debt, 0)), sub: t('клиенты ещё должны') },
])

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('Клиент'), desc: true },
  { key: 'phone', label: t('Связь') },
  { key: 'source', label: t('Откуда пришёл') },
  { key: 'count', label: t('Объектов'), num: true },
  { key: 'contract', label: t('Сумма договоров'), num: true },
  { key: 'debt', label: t('Дебиторка'), num: true },
])

function open(client: Client | null) {
  editing.value = client
  showForm.value = true
}
</script>

<template>
  <div>
    <PageHead :title="t('Клиенты')" :sub="t('Кто заказывает работы, как с ним связаться и какие у него объекты.')">
      <button v-if="can.manage" type="button" class="btn pri" @click="open(null)">
        <Icon name="ph:plus" />{{ t('Новый клиент') }}
      </button>
    </PageHead>

    <KpiStrip v-if="all.length" :items="kpis" />

    <div class="filters no-print">
      <div class="f" style="flex: 1 1 280px">
        <label for="cl-search">{{ t('Поиск') }}</label>
        <input id="cl-search" v-model="query" :placeholder="t('Поиск по имени или телефону')" autocomplete="off">
      </div>
    </div>

    <EmptyState
      v-if="!rows.length"
      icon="ph:identification-card"
      :text="state.clients.length ? t('Под поиск никто не попал.') : t('Клиентов пока нет. Заведите первого — объекты привязываются к нему.')"
    >
      <button v-if="can.manage" type="button" class="btn pri" @click="open(null)">
        <Icon name="ph:plus" />{{ t('Новый клиент') }}
      </button>
    </EmptyState>

    <DataTable v-else :columns="columns" :rows="rows" :row-key="r => r.id" clickable @open="r => router.push(`/clients/${r.id}`)">
      <template #cell-name="{ row }">
        <b>{{ row.c.name }}</b>
        <small v-if="row.c.note">{{ row.c.note }}</small>
      </template>
      <template #cell-phone="{ row }"><span class="mono">{{ row.c.phone || '—' }}</span></template>
      <template #cell-source="{ row }">{{ row.c.source ? t(row.c.source) : '—' }}</template>
      <template #cell-count="{ row }">{{ row.objects.length }}</template>
      <template #cell-contract="{ row }">{{ m(row.contract) }}</template>
      <template #cell-debt="{ row }">{{ m(row.debt) }}</template>
    </DataTable>

    <ClientForm :open="showForm" :client="editing" @close="showForm = false" />
  </div>
</template>
