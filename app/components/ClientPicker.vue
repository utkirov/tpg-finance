<script setup lang="ts">
import type { Client } from '#shared/calc'

/** Поиск клиента с возможностью завести нового прямо отсюда. */
const model = defineModel<string>({ default: '' })

const { state } = useFinance()
const { t } = useT()

const query = ref('')
const creating = ref(false)

const chosen = computed<Client | null>(() => state.value.clients.find(c => c.id === model.value) ?? null)

const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = state.value.clients
  if (!q) return list.slice(0, 6)
  return list
    .filter(c => `${c.name} ${c.phone} ${c.phone2} ${c.source}`.toLowerCase().includes(q))
    .slice(0, 8)
})

const objectsOf = (clientId: string) => state.value.objects.filter(o => o.clientId === clientId)

function pick(id: string) {
  model.value = id
  query.value = ''
}
</script>

<template>
  <div class="f">
    <label for="client-search">{{ t('Клиент') }}</label>

    <div v-if="chosen" class="picked">
      <Icon name="ph:identification-card" />
      <span>
        <b>{{ chosen.name }}</b>
        <small>
          {{ chosen.phone || t('телефон не указан') }}
          <template v-if="chosen.source"> · {{ t(chosen.source) }}</template>
          · {{ t('объектов: {count}', { count: objectsOf(chosen.id).length }) }}
        </small>
      </span>
      <button type="button" class="icon-btn" :title="t('Убрать')" @click="model = ''">
        <Icon name="ph:x" />
      </button>
    </div>

    <template v-else>
      <input
        id="client-search"
        v-model="query"
        autocomplete="off"
        :placeholder="t('Поиск по имени или телефону')"
      >
      <div class="chips" style="margin-top: 10px">
        <button v-for="c in found" :key="c.id" type="button" @click="pick(c.id)">
          <Icon name="ph:identification-card" />
          {{ c.name }}
        </button>
        <span v-if="!found.length" class="hint">{{ t('Не нашлось — заведите нового.') }}</span>
        <button type="button" class="btn sm tonal" @click="creating = true">
          <Icon name="ph:plus" />{{ t('Новый клиент') }}
        </button>
      </div>
    </template>

    <ClientForm :open="creating" @close="creating = false" @saved="pick" />
  </div>
</template>

<style scoped>
.picked {
  display: flex; align-items: center; gap: 12px;
  background: var(--secondary-container); color: var(--on-secondary-container);
  border-radius: var(--shape-md); padding: 10px 10px 10px 14px;
}
.picked > .ic { font-size: 24px; }
.picked span { flex: 1; min-width: 0; }
.picked b { display: block; font-size: 14px; font-weight: 500; }
.picked small { font-size: 12px; opacity: 0.8; }
</style>
