<script setup lang="ts">
/** Пустой список или ненайденная запись: значок, объяснение и что делать дальше. */
defineProps<{ icon?: string; text: string }>()
</script>

<template>
  <div class="empty">
    <Icon :name="icon ?? 'ph:tray'" />
    <p>{{ text }}</p>
    <slot />
  </div>
</template>
