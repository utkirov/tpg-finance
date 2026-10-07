import {
  daysBetween, obligations, periodReport, stagesOf, toObjectCurrency, today,
  type AppState, type PeriodReport, type PeriodRow,
} from './calc.ts'
import { objectTeams } from './plan.ts'

/**
 * Подробная статистика за период: всё, что показывает раздел «Отчёты».
 *
 * Основа — periodReport (движение денег за период в одной валюте).
 * Здесь к нему добавлено то, чего из одной ленты не видно: сравнение
 * с прошлым таким же периодом, остаток нарастающим итогом, план и факт
 * команд, договоры и дебиторка по объектам, обязательства по срокам.
 */

export type StatsState = Pick<
  AppState,
  'ops' | 'objects' | 'stages' | 'settings' | 'teams' | 'budgets' | 'allocations' | 'totals'
> & Partial<Pick<AppState, 'archived'>>

export interface Delta {
  now: number
  before: number
  /** Изменение к прошлому периоду: 0.12 = +12 %. null — сравнивать не с чем. */
  change: number | null
}

export interface MonthPoint {
  month: string
  inc: number
  out: number
  flow: number
  /** Остаток нарастающим итогом с начала периода. */
  balance: number
}

export interface ObjectPoint {
  id: string
  name: string
  contract: number
  received: number
  debt: number
  cash: number
}

export interface TeamPoint {
  id: string
  name: string
  planned: number
  spent: number
}

export interface Stats {
  report: PeriodReport
  /** Прошлый период той же длины; пусто, если выбрано «всё время». */
  previous: { from: string; to: string } | null
  inc: Delta
  exp: Delta
  adv: Delta
  flow: Delta
  /** Средний приход и число приходов за период. */
  avgIncome: number
  incomeCount: number
  /** Самый крупный расход за период. */
  biggestExpense: number
  /** Доля бонуса в расходах за период (0…1). */
  bonusShare: number
  months: MonthPoint[]
  /** Категории: первые семь, остальное — одной строкой «Прочее». */
  categories: PeriodRow[]
  objects: ObjectPoint[]
  teams: TeamPoint[]
  /** Договоры, получено, дебиторка — за всё время, в основной валюте. */
  portfolio: { contract: number; received: number; debt: number; cash: number; collected: number }
  /** Обязательства: всего, просрочено, в ближайшие дни. */
  promised: { total: number; overdue: number; soon: number; count: number }
}

/** Прошлый период той же длины, вплотную к выбранному. */
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  if (!from || !to) return null
  const days = daysBetween(from, to) + 1
  if (days <= 0) return null
  const shift = (iso: string, d: number) => new Date(Date.parse(iso) + d * 864e5).toISOString().slice(0, 10)
  return { from: shift(from, -days), to: shift(from, -1) }
}

function delta(now: number, before: number | null): Delta {
  if (before === null) return { now, before: 0, change: null }
  return { now, before, change: before !== 0 ? (now - before) / Math.abs(before) : null }
}

/** Все месяцы между первым и последним, с нулями в пустых — иначе линия врёт о времени. */
function fillMonths(months: Array<{ month: string; inc: number; out: number }>): MonthPoint[] {
  if (!months.length) return []
  const byMonth = new Map(months.map(m => [m.month, m]))
  const out: MonthPoint[] = []
  let [y, m] = months[0]!.month.split('-').map(Number) as [number, number]
  const last = months[months.length - 1]!.month
  let balance = 0
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const row = byMonth.get(key) ?? { inc: 0, out: 0 }
    balance += row.inc - row.out
    out.push({ month: key, inc: row.inc, out: row.out, flow: row.inc - row.out, balance })
    if (key === last) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export function buildStats(
  state: StatsState,
  range: { from?: string; to?: string; objectId?: string } = {},
  now = today(),
): Stats {
  const report = periodReport(state, range)
  const prev = previousRange(range.from ?? '', range.to ?? '')
  const before = prev ? periodReport(state, { ...range, ...prev }) : null

  const main = report.currency
  const fallback = Number(state.settings.displayRate) || 0
  const objects = state.objects.filter(o => !range.objectId || o.id === range.objectId)
  const conv = (cents: number, objectId: string) => {
    const obj = state.objects.find(o => o.id === objectId)
    return obj ? toObjectCurrency(cents, obj.currency, main, obj.rate || fallback) : cents
  }

  // Приходы и расходы за период — поштучно, для среднего и крупнейшего.
  let incomeCount = 0
  let biggestExpense = 0
  for (const op of state.ops) {
    if (op.status !== 'ok') continue
    if (range.objectId && op.objectId !== range.objectId) continue
    if (range.from && op.date < range.from) continue
    if (range.to && op.date > range.to) continue
    const value = conv(op.amountBase ?? op.amount, op.objectId)
    if (op.kind === 'in') incomeCount++
    else if (op.kind === 'exp' && value > biggestExpense) biggestExpense = value
  }

  // Категории: длинный хвост сворачиваем, чтобы график оставался читаемым.
  const TOP = 7
  const cats = report.categories.filter(r => r.exp > 0)
  const categories = cats.length > TOP + 1
    ? [
        ...cats.slice(0, TOP),
        cats.slice(TOP).reduce<PeriodRow>(
          (a, r) => ({ ...a, inc: a.inc + r.inc, exp: a.exp + r.exp, adv: a.adv + r.adv, flow: a.flow + r.flow }),
          { id: 'other', name: 'Прочее', inc: 0, exp: 0, adv: 0, flow: 0 },
        ),
      ]
    : cats

  // Объекты: договор, получено, долг и касса — за всё время, по показателям этапов.
  const objectPoints: ObjectPoint[] = objects.map((o) => {
    let received = 0
    let debt = 0
    let cash = 0
    for (const st of stagesOf(state.stages, o.id)) {
      const t = state.totals[st.id]
      if (!t) continue
      received += t.inc
      debt += t.debt
      cash += t.cash
    }
    return {
      id: o.id,
      name: o.name,
      contract: conv(o.contractAmount, o.id),
      received: conv(received, o.id),
      debt: conv(debt, o.id),
      cash: conv(cash, o.id),
    }
  }).sort((a, b) => b.contract - a.contract || a.name.localeCompare(b.name, 'ru'))

  const portfolio = objectPoints.reduce(
    (a, o) => ({
      contract: a.contract + o.contract,
      received: a.received + o.received,
      debt: a.debt + o.debt,
      cash: a.cash + o.cash,
      collected: 0,
    }),
    { contract: 0, received: 0, debt: 0, cash: 0, collected: 0 },
  )
  const billed = portfolio.received + portfolio.debt
  portfolio.collected = billed > 0 ? portfolio.received / billed : 0

  // Команды: план и факт по всем объектам, в одной валюте.
  const teamMap = new Map<string, TeamPoint>()
  for (const o of objects) {
    for (const row of objectTeams(state, o.id)) {
      const t = teamMap.get(row.teamId) ?? { id: row.teamId, name: row.name, planned: 0, spent: 0 }
      t.planned += conv(row.planned, o.id)
      t.spent += conv(row.spent, o.id)
      teamMap.set(row.teamId, t)
    }
  }
  const teams = [...teamMap.values()]
    .filter(t => t.planned || t.spent)
    .sort((a, b) => Math.max(b.planned, b.spent) - Math.max(a.planned, a.spent))

  // Обязательства — на сегодня, независимо от периода.
  const promised = { total: 0, overdue: 0, soon: 0, count: 0 }
  for (const row of obligations(state, now)) {
    if (range.objectId && row.op.objectId !== range.objectId) continue
    const value = conv(row.op.amountBase, row.op.objectId)
    promised.total += value
    promised.count++
    if (row.overdue) promised.overdue += value
    else if (row.soon) promised.soon += value
  }

  return {
    report,
    previous: prev,
    inc: delta(report.inc, before?.inc ?? null),
    exp: delta(report.exp, before?.exp ?? null),
    adv: delta(report.adv, before?.adv ?? null),
    flow: delta(report.flow, before?.flow ?? null),
    avgIncome: incomeCount ? Math.round(report.inc / incomeCount) : 0,
    incomeCount,
    biggestExpense,
    bonusShare: report.exp > 0 ? report.bonus / report.exp : 0,
    months: fillMonths(report.months),
    categories,
    objects: objectPoints,
    teams,
    portfolio,
    promised,
  }
}
