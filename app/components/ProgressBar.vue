<script setup lang="ts">
/** Полоса закрытия: доля 0…1 с подписью. */
const props = defineProps<{ value: number; label?: string; tone?: 'ok' | 'warn' }>()

const width = computed(() => `${Math.max(0, Math.min(1, props.value)) * 100}%`)
const done = computed(() => props.value >= 0.999)
</script>

<template>
  <div class="prog">
    <div class="prog-bar">
      <i :class="{ full: done, warn: tone === 'warn' }" :style="{ width }" />
    </div>
    <span class="prog-txt">
      <Icon v-if="done" name="ph:check-circle" />
      {{ label ?? `${Math.round(value * 100)} %` }}
    </span>
  </div>
</template>

<style scoped>
.prog { display: flex; align-items: center; gap: 8px; min-width: 120px; }
.prog-bar {
  flex: 1; height: 8px; border-radius: var(--shape-full);
  background: var(--surface-highest); overflow: hidden;
}
.prog-bar i {
  display: block; height: 100%; border-radius: var(--shape-full);
  background: var(--primary);
  transition: width var(--motion-long) var(--ease-decelerate), background var(--motion-medium) var(--ease-standard);
}
.prog-bar i.full { background: var(--positive); }
.prog-bar i.warn { background: var(--auto); }
.prog-txt {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 500; white-space: nowrap;
  font-variant-numeric: tabular-nums; color: var(--on-surface-variant);
}
.prog-txt .ic { color: var(--positive); font-size: 15px; }
</style>
