<script setup lang="ts">
import { periodRange } from '#shared/calc'

/**
 * Период и объект — одной строкой над отчётами.
 * Кнопки ставят месяц, квартал, год или всё время; даты можно поправить руками.
 */
export interface PeriodValue { from: string; to: string; objectId: string }

const model = defineModel<PeriodValue>({ required: true })
defineProps<{ objects?: Array<{ id: string; name: string }> }>()
const { t } = useT()

const ranges = [
  { key: 'month' as const, label: 'Месяц' },
  { key: 'quarter' as const, label: 'Квартал' },
  { key: 'year' as const, label: 'Год' },
  { key: 'all' as const, label: 'Всё время' },
]

const active = computed(() => ranges.find((r) => {
  const range = periodRange(r.key)
  return range.from === model.value.from && range.to === model.value.to
})?.key ?? '')

const set = (patch: Partial<PeriodValue>) => (model.value = { ...model.value, ...patch })
</script>

<template>
  <div class="filters no-print">
    <div class="f">
      <label>{{ t('Период') }}</label>
      <div class="seg">
        <button
          v-for="r in ranges"
          :key="r.key"
          type="button"
          :aria-pressed="active === r.key"
          @click="set(periodRange(r.key))"
        >
          {{ t(r.label) }}
        </button>
      </div>
    </div>
    <div class="f">
      <label for="pf-from">{{ t('С') }}</label>
      <input id="pf-from" :value="model.from" type="date" @change="set({ from: ($event.target as HTMLInputElement).value })">
    </div>
    <div class="f">
      <label for="pf-to">{{ t('По') }}</label>
      <input id="pf-to" :value="model.to" type="date" @change="set({ to: ($event.target as HTMLInputElement).value })">
    </div>
    <div v-if="objects" class="f">
      <label for="pf-obj">{{ t('Объект') }}</label>
      <select id="pf-obj" :value="model.objectId" @change="set({ objectId: ($event.target as HTMLSelectElement).value })">
        <option value="">{{ t('все объекты') }}</option>
        <option v-for="o in objects" :key="o.id" :value="o.id">{{ o.name }}</option>
      </select>
    </div>
  </div>
</template>
