<script setup lang="ts">
export interface Kpi {
  label: string
  value: string
  sub?: string
  icon?: string
  tone?: 'acc' | 'warn' | 'bad'
}

defineProps<{ items: Kpi[] }>()
</script>

<template>
  <div class="strip">
    <div v-for="k in items" :key="k.label" :class="k.tone">
      <div class="kpi-l">
        <Icon v-if="k.icon" :name="k.icon" />
        {{ k.label }}
      </div>
      <div class="kpi-v num">{{ k.value }}</div>
      <div v-if="k.sub" class="kpi-s">{{ k.sub }}</div>
    </div>
  </div>
</template>
