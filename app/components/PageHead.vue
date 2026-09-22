<script setup lang="ts">
/**
 * Шапка страницы: заголовок, подзаголовок и действия справа.
 * Одна на все экраны — отступы и перенос кнопок на телефоне одинаковые.
 */
defineProps<{ title: string; sub?: string }>()
</script>

<template>
  <div class="head-row">
    <div class="head-t">
      <h1>{{ title }}<slot name="title" /></h1>
      <p v-if="sub || $slots.sub" class="sub"><slot name="sub">{{ sub }}</slot></p>
    </div>
    <div v-if="$slots.default" class="acts no-print">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.head-t { min-width: 0; }
</style>
