<script setup lang="ts">
import { objectTotals, percent, stagesOf } from '#shared/calc'
import type { Column } from '~/components/DataTable.vue'

/** Карточка клиента: контакты и его объекты. Отсюда переходят в этапы и расходы. */
const route = useRoute()
const router = useRouter()
const { state, can, clientById, toMain } = useFinance()
const { t } = useT()
const { m, m0 } = useMoney()

const client = computed(() => clientById(String(route.params.id)))
const editing = ref(false)

const objects = computed(() =>
  state.value.objects
    .filter(o => o.clientId === client.value?.id)
    .map(o => ({ id: o.id, o, c: objectTotals(state.value, o.id), stages: stagesOf(state.value.stages, o.id) })))

const columns = computed<Column[]>(() => [
  { key: 'name', label: t('Объект'), desc: true },
  { key: 'contract', label: t('Договор'), num: true },
  { key: 'inc', label: t('Получено'), num: true },
  { key: 'cash', label: t('Касса'), num: true },
  { key: 'debt', label: t('Дебиторка'), num: true },
  { key: 'stages', label: t('Этапов'), num: true },
])

const phoneHref = (p: string) => `tel:${p.replace(/[^+\d]/g, '')}`

const kpis = computed(() => {
  const list = objects.value
  // Объекты клиента могут быть в разных валютах — итог в основной.
  const contract = list.reduce((a, x) => a + toMain(x.o.contractAmount, x.o.id), 0)
  const cash = list.reduce((a, x) => a + toMain(x.c.cash, x.o.id), 0)
  const debt = list.reduce((a, x) => a + toMain(x.c.debt, x.o.id), 0)
  return [
    { label: t('Объектов'), icon: 'ph:buildings', value: String(list.length), sub: t('за всё время') },
    { label: t('Сумма договоров'), icon: 'ph:handshake', value: m0(contract), sub: t('по всем объектам') },
    { label: t('Дебиторка'), icon: 'ph:hand-coins', value: m(debt), sub: t('заказчик ещё должен') },
    { label: t('Касса'), icon: 'ph:wallet', value: m(cash), sub: t('наличные на руках'), tone: 'acc' as const },
  ]
})
</script>

<template>
  <div v-if="client">
    <PageHead :title="client.name">
      <template #sub>
        <a v-if="client.phone" :href="phoneHref(client.phone)">{{ client.phone }}</a>
        <template v-else>{{ t('телефон не указан') }}</template>
        <template v-if="client.phone2"> · <a :href="phoneHref(client.phone2)">{{ client.phone2 }}</a></template>
        <template v-if="client.email"> · <a :href="`mailto:${client.email}`">{{ client.email }}</a></template>
        <template v-if="client.source"> · {{ t('пришёл: {source}', { source: t(client.source) }) }}</template>
      </template>
      <NuxtLink class="btn" to="/clients"><Icon name="ph:arrow-left" />{{ t('К клиентам') }}</NuxtLink>
      <button v-if="can.manage" type="button" class="btn" @click="editing = true">
        <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
      </button>
    </PageHead>

    <KpiStrip :items="kpis" />

    <div v-if="client.note" class="note">
      <Icon name="ph:info" />
      <div>{{ client.note }}</div>
    </div>

    <section class="sect">
      <h2>{{ t('Объекты клиента') }}</h2>

      <EmptyState
        v-if="!objects.length"
        icon="ph:buildings"
        :text="t('У клиента пока нет объектов. Создайте объект и выберите его в поиске клиента.')"
      >
        <NuxtLink to="/" class="btn"><Icon name="ph:plus" />{{ t('К списку объектов') }}</NuxtLink>
      </EmptyState>

      <DataTable v-else :columns="columns" :rows="objects" :row-key="r => r.id" clickable @open="r => router.push(`/objects/${r.id}`)">
        <template #cell-name="{ row }">
          <b>{{ row.o.name }}</b>
          <small>
            {{ row.o.address || '—' }} ·
            {{ t('Освоено {percent} поступивших', { percent: percent(row.c.usage) }) }}
          </small>
        </template>
        <template #cell-contract="{ row }">{{ m0(row.o.contractAmount, row.o.currency) }}</template>
        <template #cell-inc="{ row }">{{ m(row.c.inc, row.o.currency) }}</template>
        <template #cell-cash="{ row }">{{ m(row.c.cash, row.o.currency) }}</template>
        <template #cell-debt="{ row }">{{ m(row.c.debt, row.o.currency) }}</template>
        <template #cell-stages="{ row }">{{ row.stages.length }}</template>
      </DataTable>
    </section>

    <ClientForm :open="editing" :client="client" @close="editing = false" />
  </div>

  <EmptyState v-else :text="t('Клиент не найден.')">
    <NuxtLink to="/clients" class="btn"><Icon name="ph:arrow-left" />{{ t('К клиентам') }}</NuxtLink>
  </EmptyState>
</template>
