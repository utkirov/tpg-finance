<script setup lang="ts">
import type { Attachment } from '#shared/calc'

/**
 * Приложенные файлы: миниатюры фото и значок для PDF.
 * Картинки грузятся лениво — в длинной ленте их десятки.
 */
defineProps<{ files: Attachment[]; captions?: boolean }>()
const { t } = useT()
const isImage = (f: Attachment) => f.mime.startsWith('image/') && f.mime !== 'image/heic'
</script>

<template>
  <span v-if="files.length" class="files">
    <a
      v-for="f in files"
      :key="f.id"
      class="file"
      :href="`/api/attachments/${f.id}`"
      target="_blank"
      rel="noopener"
      :title="f.filename"
      @click.stop
    >
      <img v-if="isImage(f)" :src="`/api/attachments/${f.id}`" :alt="t(f.kind)" loading="lazy" decoding="async">
      <Icon v-else name="ph:file-text" />
      <span v-if="captions"><b>{{ t(f.kind) }}</b><br>{{ f.filename }}</span>
      <span v-else>{{ isImage(f) ? t('фото') : t('файл') }}</span>
    </a>
  </span>
</template>
