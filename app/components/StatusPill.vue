<script setup lang="ts">
import { STAGE_NAME, type StageStatus } from '#shared/calc'

const props = defineProps<{ status: StageStatus }>()

const { t } = useT()

const tone = computed(() => (props.status === 'check' ? 'g' : props.status === 'work' ? '' : 'm'))
</script>

<template>
  <span class="pill" :class="tone">{{ t(STAGE_NAME[status]) }}</span>
</template>
