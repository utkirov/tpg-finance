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

/* ---------- курс Центробанка Узбекистана на дату ---------- */

/**
 * Официальный курс доллара ЦБ РУз на дату операции (сумов за 1 USD).
 * Операции вносят и задним числом, поэтому нужен курс именно на её дату,
 * а не сегодняшний биржевой. ЦБ устанавливает курс на день, и он
 * не меняется — поэтому кэш по дате вечный. Дата из будущего — берём сегодняшний.
 */
const CBU = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/'

export interface UsdRate { date: string; rate: number; source: 'cbu' | 'cache' }

export async function cbuUsd(date: string): Promise<UsdRate | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const day = date > today() ? today() : date
  const key = `CBU:USD:${day}`
  const db = useDb()
  const cached = db.prepare('SELECT payload FROM rates_cache WHERE base = ?').get(key) as { payload: string } | undefined
  if (cached) return { date: day, rate: Number(cached.payload), source: 'cache' }

  try {
    const res = await $fetch<Array<{ Rate?: string; Date?: string }>>(`${CBU}${day}/`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      retry: 0,
    })
    const rate = Number(res?.[0]?.Rate)
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('bad payload')
    db.prepare(
      `INSERT INTO rates_cache (base, date, payload, saved_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(base) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`,
    ).run(key, day, String(rate), new Date().toISOString())
    return { date: day, rate, source: 'cbu' }
  } catch {
    return null
  }
}
