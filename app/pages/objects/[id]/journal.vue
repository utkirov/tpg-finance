<script setup lang="ts">
import { ENTITY_NAME, auditExtras, auditTarget, auditWhen, describeAudit, type AuditEntry } from '#shared/journal'
import type { Column } from '~/components/DataTable.vue'

/** Журнал изменений объекта: кто, когда и что сделал. */
const route = useRoute()
const { state, objectById } = useFinance()
const { t } = useT()
const err = useErr()

const objectId = computed(() => String(route.params.id))
const object = computed(() => objectById(objectId.value))
const { m } = useMoney(() => object.value?.currency)

const entries = ref<AuditEntry[]>([])
const loading = ref(true)
const error = ref('')
const filter = reactive({ entity: '', userId: '' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<{ entries: AuditEntry[] }>(`/api/objects/${objectId.value}/journal`)
    entries.value = res.entries
  } catch (e) {
    error.value = err(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(objectId, load)

const people = computed(() => {
  const seen = new Map<string, string>()
  for (const e of entries.value) if (e.userId) seen.set(e.userId, e.userName)
  return [...seen].map(([id, name]) => ({ id, name }))
})

const kinds = computed(() => [...new Set(entries.value.map(e => e.entity))])

const rows = computed(() =>
  entries.value.filter(e =>
    (!filter.entity || e.entity === filter.entity)
    && (!filter.userId || e.userId === filter.userId)))

// Этап операции по её номеру — словарём, а не поиском по всей ленте на каждой строке.
const stageByOp = computed(() => new Map(state.value.ops.map(o => [o.id, o.stageId])))
const stageOfOperation = (id: string) => stageByOp.value.get(id) ?? null

const columns = computed<Column[]>(() => [
  { key: 'at', label: t('Когда'), num: true },
  { key: 'who', label: t('Кто') },
  { key: 'what', label: t('Что сделано'), desc: true },
  { key: 'entity', label: t('Раздел') },
])
// Суммы в журнале подчиняются переключателю USD / SUM, поэтому подпись берём оттуда же.
const describe = (e: AuditEntry) => describeAudit(e, m)

/** Подстановки вроде «Аванс участнику» тоже переводим; суммы и даты проходят как есть. */
function line(e: AuditEntry): string {
  const note = describe(e)
  const params = Object.fromEntries(
    Object.entries(note.params ?? {}).map(([k, v]) => [k, typeof v === 'string' ? t(v) : v]),
  )
  return t(note.text, params)
}

function reset() {
  filter.entity = ''
  filter.userId = ''
}
</script>

<template>
  <div v-if="object">
    <PageHead :title="t('Журнал изменений')" :sub="`${object.name} · ${t('кто, когда и что изменил. Записи не редактируются и не удаляются.')}`">
      <NuxtLink class="btn" :to="`/objects/${object.id}`">
        <Icon name="ph:arrow-left" />{{ t('К объекту') }}
      </NuxtLink>
      <button type="button" class="btn" @click="load">
        <Icon name="ph:arrows-clockwise" />{{ t('Обновить') }}
      </button>
    </PageHead>

    <div class="filters no-print">
      <div class="f">
        <label for="j-entity">{{ t('Раздел') }}</label>
        <select id="j-entity" v-model="filter.entity">
          <option value="">{{ t('Все') }}</option>
          <option v-for="k in kinds" :key="k" :value="k">{{ t(ENTITY_NAME[k] ?? k) }}</option>
        </select>
      </div>
      <div class="f">
        <label for="j-user">{{ t('Кто') }}</label>
        <select id="j-user" v-model="filter.userId">
          <option value="">{{ t('Все') }}</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <button type="button" class="btn ghost" @click="reset"><Icon name="ph:funnel" />{{ t('Сбросить') }}</button>
    </div>

    <div v-if="error" class="note r">
      <Icon name="ph:warning" />
      <div><b>{{ t('Не получилось') }}</b>{{ error }}</div>
    </div>

    <div v-else-if="loading" class="skel"><i /><i /><i /></div>

    <EmptyState
      v-else-if="!rows.length"
      icon="ph:clock-counter-clockwise"
      :text="entries.length ? t('Под фильтр ничего не попало.') : t('Записей пока нет. Журнал наполняется сам при каждом действии.')"
    />

    <DataTable v-else :columns="columns" :rows="rows" :row-key="e => e.id">
      <template #cell-at="{ row }">{{ auditWhen(row.at) }}</template>
      <template #cell-who="{ row }">{{ row.userName }}</template>
      <template #cell-what="{ row }">
        <b>{{ line(row) }}</b>
        <small v-if="auditExtras(row).length">{{ auditExtras(row).join(' · ') }}</small>
      </template>
      <template #cell-entity="{ row }">
        <NuxtLink v-if="auditTarget(row, stageOfOperation)" :to="auditTarget(row, stageOfOperation)!">
          {{ t(ENTITY_NAME[row.entity] ?? row.entity) }}
        </NuxtLink>
        <span v-else class="dim">{{ t(ENTITY_NAME[row.entity] ?? row.entity) }}</span>
      </template>
    </DataTable>

    <p v-if="rows.length" class="hint" style="margin-top: 10px">
      {{ t('Показаны последние {count} записей, новые сверху.', { count: rows.length }) }}
    </p>
  </div>

  <EmptyState v-else :text="t('Объект не найден или вам не открыт доступ.')">
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </EmptyState>
</template>
