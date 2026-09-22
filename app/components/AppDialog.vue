<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; icon?: string }>()
const emit = defineEmits<{ close: [] }>()

const el = ref<HTMLDialogElement>()

watch(
  () => props.open,
  (isOpen) => {
    if (!el.value) return
    if (isOpen && !el.value.open) el.value.showModal()
    if (!isOpen && el.value.open) el.value.close()
  },
)

onMounted(() => {
  if (props.open && el.value && !el.value.open) el.value.showModal()
})
</script>

<template>
  <dialog ref="el" @close="emit('close')" @cancel.prevent="emit('close')">
    <div class="dlg-h">
      <Icon v-if="icon" :name="icon" />
      {{ title }}
    </div>
    <div class="dlg">
      <slot />
    </div>
  </dialog>
</template>
