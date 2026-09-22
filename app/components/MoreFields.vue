<script setup lang="ts">
/** Редкие поля формы: свёрнуты, пока не понадобятся. */
const { t } = useT()
</script>

<template>
  <details class="more">
    <summary>
      <Icon name="ph:caret-down" />
      {{ t('Ещё') }}
    </summary>
    <div class="more-b"><slot /></div>
  </details>
</template>
