<script setup lang="ts">
import { ENTITY_NAME, auditExtras, auditTarget, auditWhen, describeAudit, type AuditEntry } from '#shared/journal'

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

const stageOfOperation = (id: string) => state.value.ops.find(o => o.id === id)?.stageId ?? null
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
    <div class="head-row">
      <div>
        <h1>{{ t('Журнал изменений') }}</h1>
        <p class="sub">
          {{ object.name }} · {{ t('кто, когда и что изменил. Записи не редактируются и не удаляются.') }}
        </p>
      </div>
      <div class="acts no-print">
        <NuxtLink class="btn" :to="`/objects/${object.id}`">
          <Icon name="ph:arrow-left" />{{ t('К объекту') }}
        </NuxtLink>
        <button type="button" class="btn" @click="load">
          <Icon name="ph:arrows-clockwise" />{{ t('Обновить') }}
        </button>
      </div>
    </div>

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

    <div v-else-if="!rows.length" class="empty">
      <Icon name="ph:clock-counter-clockwise" />
      <p v-if="entries.length">{{ t('Под фильтр ничего не попало.') }}</p>
      <p v-else>{{ t('Записей пока нет. Журнал наполняется сам при каждом действии.') }}</p>
    </div>

    <div v-else class="tw">
      <table class="stack">
        <thead>
          <tr>
            <th>{{ t('Когда') }}</th>
            <th>{{ t('Кто') }}</th>
            <th>{{ t('Что сделано') }}</th>
            <th>{{ t('Раздел') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in rows" :key="e.id">
            <td class="n" :data-label="t('Когда')">{{ auditWhen(e.at) }}</td>
            <td :data-label="t('Кто')">{{ e.userName }}</td>
            <td class="desc">
              <b>{{ line(e) }}</b>
              <small v-if="auditExtras(e).length">{{ auditExtras(e).join(' · ') }}</small>
            </td>
            <td :data-label="t('Раздел')">
              <NuxtLink v-if="auditTarget(e, stageOfOperation)" :to="auditTarget(e, stageOfOperation)!">
                {{ t(ENTITY_NAME[e.entity] ?? e.entity) }}
              </NuxtLink>
              <span v-else class="dim">{{ t(ENTITY_NAME[e.entity] ?? e.entity) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="rows.length" class="hint" style="margin-top: 10px">
      {{ t('Показаны последние {count} записей, новые сверху.', { count: rows.length }) }}
    </p>
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Объект не найден или вам не открыт доступ.') }}</p>
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </div>
</template>
