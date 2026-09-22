import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcStage, emptyAppState, type Obj, type Op, type Stage } from '../shared/calc.ts'
import { buildStats, previousRange } from '../shared/stats.ts'

let seq = 0
const op = (kind: Op['kind'], amount: number, date: string, extra: Partial<Op> = {}): Op => ({
  id: `op${++seq}`, stageId: 's1', objectId: 'o1', date, kind,
  amount, currency: 'USD', rate: 1, amountBase: amount,
  personId: null, categoryId: kind === 'exp' ? 'c1' : null, teamId: null, offObject: false,
  note: '', status: 'ok', dueDate: null, isAuto: false, parentId: null, reversesId: null,
  createdAt: `${date}T00:00:00Z`, createdBy: null, reason: '',
  ...extra,
})

const obj: Obj = {
  id: 'o1', name: 'Ресторан', customer: '', clientId: null, address: '', contractAmount: 2_000_000,
  currency: 'USD', rate: 0, basisType: 'договор', basisNote: '', bonusPersonId: null, bonusRate: 10,
  sharesVersion: 1, scaleVersion: 1, status: 'work',
}
const stage: Stage = { id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_000_000, status: 'work', closedAt: null }

function state(ops: Op[]) {
  const s = emptyAppState()
  s.objects = [obj]
  s.stages = [stage]
  s.ops = ops
  s.settings.categories = [{ id: 'c1', name: 'Материалы', teamId: null, group: null, system: false, archived: false }]
  s.teams = [{ id: 't1', name: 'Архитекторы', composite: false, parts: [], archived: false }]
  s.budgets = [{ objectId: 'o1', teamId: 't1', personId: null, amount: 300_000, note: '' }]
  s.totals = { s1: calcStage(stage, ops, []) }
  return s
}

test('прошлый период той же длины идёт вплотную', () => {
  assert.deepEqual(previousRange('2026-07-01', '2026-07-31'), { from: '2026-05-31', to: '2026-06-30' })
  assert.deepEqual(previousRange('2026-01-01', '2026-12-31'), { from: '2025-01-01', to: '2025-12-31' })
  assert.equal(previousRange('', ''), null)
})

test('сравнение с прошлым периодом и остаток нарастающим итогом', () => {
  const s = state([
    op('in', 100_000, '2026-06-10'),
    op('in', 300_000, '2026-07-05'),
    op('exp', 50_000, '2026-07-06', { teamId: 't1' }),
    op('exp', 20_000, '2026-09-01'),
  ])
  const st = buildStats(s, { from: '2026-07-01', to: '2026-09-30' }, '2026-09-22')
  assert.equal(st.inc.now, 300_000)
  assert.equal(st.inc.before, 100_000)
  assert.equal(st.inc.change, 2)
  // Август без операций всё равно есть на оси — с нулями.
  assert.deepEqual(st.months.map(m => m.month), ['2026-07', '2026-08', '2026-09'])
  assert.deepEqual(st.months.map(m => m.balance), [250_000, 250_000, 230_000])
  assert.equal(st.biggestExpense, 50_000)
  assert.equal(st.avgIncome, 300_000)
  assert.deepEqual(st.teams, [{ id: 't1', name: 'Архитекторы', planned: 300_000, spent: 50_000 }])
  assert.equal(st.portfolio.contract, 2_000_000)
  assert.equal(st.portfolio.received, 400_000)
  assert.equal(st.portfolio.debt, 600_000)
})

test('длинный хвост категорий сворачивается в «Прочее»', () => {
  const s = state([])
  s.settings.categories = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`, name: `К${i}`, teamId: null, group: null, system: false, archived: false,
  }))
  s.ops = s.settings.categories.map((c, i) => op('exp', (i + 1) * 1000, '2026-07-01', { categoryId: c.id }))
  const st = buildStats(s, {})
  assert.equal(st.categories.length, 8)
  assert.equal(st.categories.at(-1)!.name, 'Прочее')
  assert.equal(st.categories.reduce((a, r) => a + r.exp, 0), 55_000)
})

test('обязательства делятся на просроченные и ближайшие', () => {
  const s = state([
    op('exp', 10_000, '2026-09-01', { status: 'promised', dueDate: '2026-09-10' }),
    op('exp', 20_000, '2026-09-01', { status: 'promised', dueDate: '2026-09-23' }),
    op('exp', 40_000, '2026-09-01', { status: 'promised' }),
  ])
  const st = buildStats(s, {}, '2026-09-22')
  assert.deepEqual(st.promised, { total: 70_000, overdue: 10_000, soon: 20_000, count: 3 })
})
