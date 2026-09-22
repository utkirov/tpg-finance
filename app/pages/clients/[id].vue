<script setup lang="ts">
import { objectTotals, percent, stagesOf } from '#shared/calc'

/** Карточка клиента: контакты и его объекты. Отсюда переходят в этапы и расходы. */
const route = useRoute()
const router = useRouter()
const { state, can, clientById } = useFinance()
const { t } = useT()
const { m, m0 } = useMoney()

const client = computed(() => clientById(String(route.params.id)))
const editing = ref(false)

const objects = computed(() =>
  state.value.objects
    .filter(o => o.clientId === client.value?.id)
    .map(o => ({ o, c: objectTotals(state.value, o.id), stages: stagesOf(state.value.stages, o.id) })))

const kpis = computed(() => {
  const list = objects.value
  const contract = list.reduce((a, x) => a + x.o.contractAmount, 0)
  const cash = list.reduce((a, x) => a + x.c.cash, 0)
  const debt = list.reduce((a, x) => a + x.c.debt, 0)
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
    <div class="head-row">
      <div>
        <h1>{{ client.name }}</h1>
        <p class="sub">
          {{ client.phone || t('телефон не указан') }}
          <template v-if="client.phone2"> · {{ client.phone2 }}</template>
          <template v-if="client.email"> · {{ client.email }}</template>
          <template v-if="client.source"> · {{ t('пришёл: {source}', { source: t(client.source) }) }}</template>
        </p>
      </div>
      <div class="acts no-print">
        <NuxtLink class="btn" to="/clients"><Icon name="ph:arrow-left" />{{ t('К клиентам') }}</NuxtLink>
        <button v-if="can.manage" type="button" class="btn" @click="editing = true">
          <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
        </button>
      </div>
    </div>

    <KpiStrip :items="kpis" />

    <div v-if="client.note" class="note">
      <Icon name="ph:info" />
      <div>{{ client.note }}</div>
    </div>

    <section class="sect">
      <h2>{{ t('Объекты клиента') }}</h2>

      <div v-if="!objects.length" class="empty">
        <Icon name="ph:buildings" />
        <p>{{ t('У клиента пока нет объектов. Создайте объект и выберите его в поиске клиента.') }}</p>
        <NuxtLink to="/" class="btn"><Icon name="ph:plus" />{{ t('К списку объектов') }}</NuxtLink>
      </div>

      <div v-else class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Объект') }}</th>
              <th class="n">{{ t('Договор') }}</th>
              <th class="n">{{ t('Получено') }}</th>
              <th class="n">{{ t('Касса') }}</th>
              <th class="n">{{ t('Дебиторка') }}</th>
              <th class="n">{{ t('Этапов') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in objects" :key="row.o.id" class="click" @click="router.push(`/objects/${row.o.id}`)">
              <td class="desc">
                <b>{{ row.o.name }}</b>
                <small>
                  {{ row.o.address || '—' }} ·
                  {{ t('Освоено {percent} поступивших', { percent: percent(row.c.usage) }) }}
                </small>
              </td>
              <td class="n" :data-label="t('Договор')">{{ m0(row.o.contractAmount, row.o.currency) }}</td>
              <td class="n" :data-label="t('Получено')">{{ m(row.c.inc, row.o.currency) }}</td>
              <td class="n" :data-label="t('Касса')">{{ m(row.c.cash, row.o.currency) }}</td>
              <td class="n" :data-label="t('Дебиторка')">{{ m(row.c.debt, row.o.currency) }}</td>
              <td class="n" :data-label="t('Этапов')">{{ row.stages.length }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ClientForm :open="editing" :client="client" @close="editing = false" />
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Клиент не найден.') }}</p>
    <NuxtLink to="/clients" class="btn"><Icon name="ph:arrow-left" />{{ t('К клиентам') }}</NuxtLink>
  </div>
</template>
