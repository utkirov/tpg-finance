<script setup lang="ts">
import { percent, type Obj } from '#shared/calc'

/** Карточка объекта в списке: договор, касса, дебиторка и освоение денег. */
const props = defineProps<{
  object: Obj
  totals: { cash: number; debt: number; usage: number; stages: unknown[] }
}>()

const { can } = useFinance()
const { t } = useT()
const { m, m0 } = useMoney(() => props.object.currency)

const width = computed(() => `${Math.max(0, Math.min(1, props.totals.usage)) * 100}%`)
const tone = computed(() => (props.totals.usage > 1 ? 'over' : props.totals.usage > 0.8 ? 'hot' : ''))
</script>

<template>
  <NuxtLink class="ocard" :to="`/objects/${object.id}`">
    <div class="t">
      <Icon name="ph:buildings" />
      {{ object.name }}
      <span v-if="object.status === 'closed'" class="pill m">{{ t('закрыт') }}</span>
    </div>
    <div class="c">{{ object.customer || '—' }}<template v-if="object.address"> · {{ object.address }}</template></div>
    <dl>
      <template v-if="can.seeContract">
        <dt>{{ t('Договор') }}</dt>
        <dd>{{ m0(object.contractAmount) }}</dd>
      </template>
      <dt>{{ t('Касса') }}</dt>
      <dd :class="{ neg: totals.cash < 0 }">{{ m(totals.cash) }}</dd>
      <template v-if="can.seeContract">
        <dt>{{ t('Дебиторка') }}</dt>
        <dd>{{ m(totals.debt) }}</dd>
      </template>
      <dt>{{ t('Этапов') }}</dt>
      <dd>{{ totals.stages.length }}</dd>
    </dl>
    <template v-if="can.seeContract">
      <div class="bar"><i :class="tone" :style="{ width }" /></div>
      <div class="kpi-s">{{ t('Освоено {percent} поступивших', { percent: percent(totals.usage) }) }}</div>
    </template>
  </NuxtLink>
</template>
