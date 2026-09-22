<script setup lang="ts">
import type { Chart, ChartConfiguration } from 'chart.js'

/**
 * График на Chart.js. Библиотека грузится только на экране, где график
 * есть, — в общий бандл приложения она не попадает.
 *
 * Цвета серий — из токенов --viz-1…3 в main.css, проверенных на различимость
 * при дальтонизме в светлой и тёмной теме. Цвет закреплён за серией
 * по её номеру (slot), а не по порядку в списке: фильтр не перекрашивает.
 * Одна ось всегда; два разных масштаба — два графика.
 */
export interface Series {
  label: string
  data: number[]
  /** Цвет: 1, 2 или 3. */
  slot?: 1 | 2 | 3
}

const props = defineProps<{
  kind: 'bar' | 'line'
  labels: string[]
  series: Series[]
  /** Подпись для читалки экрана: что показывает график. */
  label: string
  format?: (value: number) => string
  horizontal?: boolean
  stacked?: boolean
  height?: number
}>()

const canvas = ref<HTMLCanvasElement>()
const box = ref<HTMLDivElement>()
let chart: Chart | null = null
let media: MediaQueryList | null = null

function tokens() {
  const css = getComputedStyle(box.value ?? document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    series: [v('--viz-1'), v('--viz-2'), v('--viz-3')],
    grid: v('--outline-variant'),
    text: v('--on-surface-variant'),
    surface: v('--surface-container'),
    font: getComputedStyle(document.body).fontFamily,
  }
}

function config(): ChartConfiguration {
  const c = tokens()
  const fmt = props.format ?? ((x: number) => x.toLocaleString('ru-RU'))
  const many = props.series.length > 1
  const valueAxis = {
    stacked: props.stacked,
    beginAtZero: true,
    grid: { color: c.grid, lineWidth: 1, drawTicks: false },
    border: { display: false },
    ticks: { color: c.text, padding: 8, maxTicksLimit: 6, callback: (x: string | number) => fmt(Number(x)) },
  }
  const categoryAxis = {
    stacked: props.stacked,
    grid: { display: false },
    border: { color: c.grid },
    ticks: { color: c.text, autoSkip: true, maxRotation: 0 },
  }

  return {
    type: props.kind,
    data: {
      labels: props.labels,
      datasets: props.series.map((s, i) => {
        const color = c.series[(s.slot ?? i + 1) - 1] ?? c.series[0]!
        return props.kind === 'line'
          ? {
              label: s.label, data: s.data, borderColor: color, backgroundColor: color,
              borderWidth: 2, tension: 0.25, pointRadius: 0, pointHoverRadius: 5,
              pointHoverBorderColor: c.surface, pointHoverBorderWidth: 2, fill: false,
            }
          : {
              label: s.label, data: s.data, backgroundColor: color,
              // Скруглён только конец столбика, основание стоит на оси.
              borderRadius: 4, borderSkipped: 'start',
              // Зазор в 2 px цвета поверхности между соседними столбиками и сегментами.
              borderColor: c.surface, borderWidth: props.stacked ? { top: 0, bottom: 0, left: 2, right: 2 } : 0,
              maxBarThickness: 28, categoryPercentage: 0.7, barPercentage: 0.9,
            }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      indexAxis: props.horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false, axis: props.horizontal ? 'y' : 'x' },
      font: { family: c.font },
      plugins: {
        legend: {
          display: many,
          position: 'top',
          align: 'start',
          labels: { color: c.text, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3, font: { family: c.font } },
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(Number(ctx.parsed[props.horizontal ? 'x' : 'y']))}` },
        },
      },
      scales: props.horizontal
        ? { x: valueAxis, y: categoryAxis }
        : { x: categoryAxis, y: valueAxis },
    } as ChartConfiguration['options'],
  } as ChartConfiguration
}

async function draw() {
  if (!canvas.value) return
  const lib = await import('chart.js')
  lib.Chart.register(
    lib.BarController, lib.BarElement, lib.LineController, lib.LineElement, lib.PointElement,
    lib.CategoryScale, lib.LinearScale, lib.Tooltip, lib.Legend,
  )
  chart?.destroy()
  chart = new lib.Chart(canvas.value, config())
}

function redraw() {
  if (!chart) return draw()
  const next = config()
  chart.data = next.data
  chart.options = next.options!
  chart.update()
}

onMounted(() => {
  draw()
  // Тема сменилась — цвета берутся заново из токенов.
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', draw)
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', draw)
  chart?.destroy()
  chart = null
})

watch(() => [props.labels, props.series, props.kind, props.stacked, props.horizontal], redraw, { deep: true })
</script>

<template>
  <div ref="box" class="chart" :style="{ height: `${height ?? 260}px` }">
    <canvas ref="canvas" role="img" :aria-label="label" />
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
</style>
