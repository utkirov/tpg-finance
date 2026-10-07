import { markRaw } from 'vue'
import { emptyAppState, toObjectCurrency, type AppState } from '#shared/calc'
import { abilities, type Abilities } from '#shared/roles'

export type ClientState = AppState & { mustChange?: boolean }

export const emptyState = (): ClientState => emptyAppState()

/**
 * Одно состояние на всё приложение. Показатели приходят с сервера уже
 * урезанными под роль — экран их только показывает.
 *
 * ponytail: обычный useState, а не useAsyncData — состояние читают
 * и route middleware, и плагины, а там lifecycle-композаблы не работают.
 *
 * Состояние помечено markRaw: оно не правится на месте, а заменяется
 * целиком после каждой записи. Глубокая реактивность на тысячах операций
 * только замедляла каждый проход по ленте — перерисовку и так вызывает
 * замена самого значения.
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
      const next = await request<ClientState | null>('/api/state')
      // 304 без тела — данные не менялись, оставляем то, что есть.
      if (next) data.value = markRaw({ ...emptyState(), ...next })
    } catch (e) {
      // Сессия кончилась — показываем вход. Сеть моргнула — оставляем последнее.
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 401 || !loaded.value) data.value = markRaw(emptyState())
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
  const mustChange = computed(() => !!data.value.mustChange)

  // Справочники — в словари: имя по id ищется на каждой строке ленты.
  const index = computed(() => {
    const s = data.value
    const map = <T extends { id: string }>(...lists: T[][]) => {
      const out = new Map<string, T>()
      for (const list of lists) for (const x of list) if (!out.has(x.id)) out.set(x.id, x)
      return out
    }
    const files = new Map<string, typeof s.attachments>()
    for (const a of s.attachments) {
      if (!a.operationId) continue
      const list = files.get(a.operationId)
      if (list) list.push(a)
      else files.set(a.operationId, [a])
    }
    return {
      // Человека могли снять с учёта — его записи в ленте остались, имя ищем и в архиве.
      people: map(s.settings.people, s.archived?.people ?? []),
      categories: map(s.settings.categories, s.archived?.categories ?? []),
      objects: map(s.objects),
      stages: map(s.stages),
      teams: map(s.teams),
      clients: map(s.clients),
      files,
    }
  })

  const personName = (id: string | null) => (id && index.value.people.get(id)?.name) || '—'
  const categoryName = (id: string | null) => (id && index.value.categories.get(id)?.name) || '—'
  const objectById = (id: string) => index.value.objects.get(id) ?? null
  const stageById = (id: string) => index.value.stages.get(id) ?? null
  const filesOf = (opId: string) => index.value.files.get(opId) ?? []
  const teamName = (id: string | null) => (id && index.value.teams.get(id)?.name) || '—'
  const clientById = (id: string | null) => (id && index.value.clients.get(id)) || null

  /** Основная валюта справочников: в ней сводятся суммы по разным объектам. */
  const mainCurrency = computed(() => (settings.value.currency || 'USD').toUpperCase())

  /**
   * Сумма объекта в основной валюте. Складывать доллары одного объекта
   * с сумами другого без пересчёта — красивое и неверное число.
   */
  const toMain = (cents: number, objectId: string) => {
    const obj = objectById(objectId)
    if (!obj) return cents
    return toObjectCurrency(cents, obj.currency, mainCurrency.value, obj.rate || Number(settings.value.displayRate) || 0)
  }

  /** Любая запись на сервере — и сразу перечитанное состояние. */
  async function send<T>(url: string, options: { method: 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
    const result = await $fetch<T>(url, options as never)
    await refresh()
    return result as T
  }

  /** Выход: сессия на сервере, состояние в памяти и всё, что браузер успел сохранить. */
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    if (import.meta.client && 'caches' in window) {
      const keys = await caches.keys().catch(() => [] as string[])
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    data.value = markRaw(emptyState())
    await navigateTo('/login')
  }

  return {
    state, me, settings, can, loading, loaded, mustChange, mainCurrency,
    refresh, send, logout, toMain,
    personName, categoryName, teamName, objectById, stageById, clientById, filesOf,
  }
}

/** Текст ошибки из ответа сервера — там лежит человеческая формулировка запрета. */
export function errText(e: unknown): string {
  const any = e as { data?: { message?: string; statusMessage?: string }; statusMessage?: string; message?: string }
  return any?.data?.message || any?.data?.statusMessage || any?.statusMessage || any?.message || 'Не удалось сохранить'
}
