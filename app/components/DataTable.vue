<script setup lang="ts" generic="Row">
/**
 * Таблица денег. На широком экране — таблица, на телефоне — список карточек:
 * у каждой ячейки подпись из заголовка колонки (см. table.stack в стилях).
 *
 * Ячейка по умолчанию показывает row[key]; своё содержимое — слотом
 * #cell-<key>="{ row }". Строка итогов — объектом total { key: текст }.
 */
export interface Column {
  key: string
  label: string
  /** Число: выравнивание вправо, моноширинные цифры. */
  num?: boolean
  /** Главная колонка: на телефоне становится заголовком карточки. */
  desc?: boolean
  /** Колонка кнопок: не печатается. */
  act?: boolean
  class?: string
}

const props = defineProps<{
  columns: Column[]
  rows: Row[]
  rowKey: (row: Row) => string | number
  rowClass?: (row: Row) => string | Record<string, boolean> | undefined
  /** Строка итогов: подписи по ключам колонок. */
  total?: Record<string, string | number> | null
  clickable?: boolean
}>()

const emit = defineEmits<{ open: [row: Row] }>()

const cellClass = (c: Column) => [c.class, { n: c.num, desc: c.desc, act: c.act, 'no-print': c.act }]
const value = (row: Row, key: string) => (row as Record<string, unknown>)[key] as string | number | undefined

function click(row: Row) {
  if (props.clickable) emit('open', row)
}
</script>

<template>
  <div class="tw">
    <table class="stack">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key" :class="cellClass(c)">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="rowKey(row)"
          :class="[rowClass?.(row), { click: clickable }]"
          :tabindex="clickable ? 0 : undefined"
          @click="click(row)"
          @keydown.enter="click(row)"
        >
          <td v-for="c in columns" :key="c.key" :class="cellClass(c)" :data-label="c.desc || c.act ? undefined : c.label">
            <slot :name="`cell-${c.key}`" :row="row">{{ value(row, c.key) }}</slot>
          </td>
        </tr>
        <tr v-if="total" class="tot">
          <td v-for="(c, i) in columns" :key="c.key" :class="{ n: c.num, 'no-print': c.act }" :data-label="i ? c.label : undefined">
            {{ total[c.key] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
