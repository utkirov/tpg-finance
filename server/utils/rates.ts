import { today } from '#shared/calc'
import { useDb } from './db'

/**
 * Курсы валют на сегодня — только подсказка в поле ввода.
 * Курс операции всё равно вводит человек: в ТЗ это «курс к валюте
 * объекта на дату», и он может отличаться от биржевого.
 *
 * Источник открытый и без ключа; ответ кэшируется на сутки.
 * Нет интернета — отдаём вчерашний кэш с его датой либо ничего,
 * и поле просто остаётся пустым.
 */
const ENDPOINT = 'https://open.er-api.com/v6/latest/'
const TIMEOUT_MS = 5000

export interface RateSnapshot {
  base: string
  date: string
  rates: Record<string, number>
  /** Курс не сегодняшний: сеть не ответила, показываем что было. */
  stale: boolean
}

export async function ratesFor(base: string): Promise<RateSnapshot | null> {
  const code = base.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return null

  const db = useDb()
  const cached = db.prepare('SELECT date, payload FROM rates_cache WHERE base = ?').get(code) as
    | { date: string; payload: string }
    | undefined

  const day = today()
  if (cached?.date === day) {
    return { base: code, date: cached.date, rates: JSON.parse(cached.payload), stale: false }
  }

  try {
    const res = await $fetch<{ result?: string; rates?: Record<string, number>; time_last_update_utc?: string }>(
      ENDPOINT + code,
      { signal: AbortSignal.timeout(TIMEOUT_MS), retry: 0 },
    )
    if (res?.result !== 'success' || !res.rates) throw new Error('bad payload')

    db.prepare(
      `INSERT INTO rates_cache (base, date, payload, saved_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(base) DO UPDATE SET date = excluded.date, payload = excluded.payload, saved_at = excluded.saved_at`,
    ).run(code, day, JSON.stringify(res.rates), new Date().toISOString())

    return { base: code, date: day, rates: res.rates, stale: false }
  } catch {
    if (cached) return { base: code, date: cached.date, rates: JSON.parse(cached.payload), stale: true }
    return null
  }
}
