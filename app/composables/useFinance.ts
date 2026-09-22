import { DEFAULT_DISPLAY_RATE, type AppState, type Settings } from '#shared/calc'
import { abilities, type Abilities } from '#shared/roles'

const emptySettings = (): Settings => ({
  currency: 'USD', people: [], categories: [],
  shares: [], sharesVersion: 1, bonusScale: [], scaleVersion: 1,
  displayRate: DEFAULT_DISPLAY_RATE,
})

export type ClientState = AppState & { mustChange?: boolean }

export const emptyState = (): ClientState => ({
  me: null, settings: emptySettings(), sharesByVersion: {},
  clients: [], teams: [], budgets: [], allocations: [],
  objects: [], stages: [], ops: [], attachments: [], users: [], totals: {},
})

/**
 * Одно состояние на всё приложение. Показатели приходят с сервера уже
 * урезанными под роль — экран их только показывает.
 *
 * ponytail: обычный useState, а не useAsyncData — состояние читают
 * и route middleware, и плагины, а там lifecycle-композаблы не работают.
 */
export function useFinance() {
  const data = useState<ClientState>('finance', emptyState)
  const pending = useState<boolean>('finance-pending', () => false)
  const loaded = useState<boolean>('finance-loaded', () => false)

  async function refresh() {
    // На сервере нужны куки входящего запроса — иначе сессия не видна.
    const request = import.meta.server ? useRequestFetch() : $fetch
    pending.value = true
    try {
      data.value = await request<ClientState>('/api/state')
    } catch {
      data.value = emptyState()
    } finally {
      pending.value = false
      loaded.value = true
    }
  }

  const state = computed(() => data.value)
  const me = computed(() => data.value.me)
  const settings = computed(() => data.value.settings)
  const can = computed<Abilities>(() => abilities(me.value?.role ?? 'foreman'))
  const loading = computed(() => pending.value)

  // Человека могли снять с учёта — его записи в ленте остались, имя ищем и в архиве.
  const personName = (id: string | null) =>
    (settings.value.people.find(p => p.id === id)
      ?? data.value.archived?.people.find(p => p.id === id))?.name ?? '—'
  const categoryName = (id: string | null) =>
    (settings.value.categories.find(c => c.id === id)
      ?? data.value.archived?.categories.find(c => c.id === id))?.name ?? '—'
  const objectById = (id: string) => data.value.objects.find(o => o.id === id) ?? null
  const stageById = (id: string) => data.value.stages.find(s => s.id === id) ?? null
  const filesOf = (opId: string) => data.value.attachments.filter(a => a.operationId === opId)
  const teamName = (id: string | null) => data.value.teams.find(x => x.id === id)?.name ?? '—'
  const clientById = (id: string | null) => data.value.clients.find(c => c.id === id) ?? null

  /** Любая запись на сервере — и сразу перечитанное состояние. */
  async function send<T>(url: string, options: { method: 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
    const result = await $fetch<T>(url, options as never)
    await refresh()
    return result
  }

  return {
    state, me, settings, can, loading, loaded,
    refresh, send, personName, categoryName, teamName, objectById, stageById, clientById, filesOf,
  }
}

/** Текст ошибки из ответа сервера — там лежит человеческая формулировка запрета. */
export function errText(e: unknown): string {
  const any = e as { data?: { message?: string; statusMessage?: string }; statusMessage?: string; message?: string }
  return any?.data?.message || any?.data?.statusMessage || any?.statusMessage || any?.message || 'Не удалось сохранить'
}
