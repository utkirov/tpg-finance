import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AppState, Op } from '../shared/calc.ts'
import { inCurrency, opIn } from '../shared/display.ts'

/** Показ в другой валюте: каждая операция — по своему курсу на свою дату. */

const op = (id: string, kind: Op['kind'], amount: number, extra: Partial<Op> = {}): Op => ({
  id, stageId: 's1', objectId: 'o1', date: '2026-03-01', kind,
  amount, currency: 'USD', rate: 1, fx: 12_000, amountBase: amount,
  personId: null, categoryId: kind === 'exp' ? 'x' : null, teamId: null, offObject: false,
  note: '', status: 'ok', isAuto: false, received: false, receivedAt: null,
  parentId: null, reversesId: null, createdAt: id, createdBy: null, reason: '',
  ...extra,
})

const state = (ops: Op[]): AppState => ({
  me: null,
  settings: { currency: 'USD', displayRate: 12_000, people: [], categories: [], shares: [{ personId: 'a', percent: 100 }], sharesVersion: 1, bonusScale: [], scaleVersion: 1 },
  archived: { people: [], categories: [] },
  clients: [], teams: [], budgets: [], allocations: [], sharesByVersion: {},
  objects: [{ id: 'o1', name: 'Объект', customer: '', clientId: null, address: '', contractAmount: 1_000_000, currency: 'USD', rate: 12_500, basisType: 'договор', basisNote: '', bonusPersonId: null, bonusRate: 0, sharesVersion: 1, scaleVersion: 1, status: 'work' }],
  stages: [{ id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_000_000, status: 'work', closedAt: null }],
  ops, attachments: [], users: [], totals: {},
})

test('два прихода по 1 000 $ по разным курсам — в сумах это разные деньги', () => {
  const s = inCurrency(state([
    op('a', 'in', 100_000, { fx: 12_000, date: '2026-03-01' }),
    op('b', 'in', 100_000, { fx: 12_800, date: '2026-09-01' }),
  ]), 'UZS')
  assert.deepEqual(s.ops.map(o => o.amountBase), [1_200_000_000, 1_280_000_000], '12 000 000 и 12 800 000 сум')
  assert.equal(s.totals.s1!.inc, 2_480_000_000, 'итог — сумма пересчитанных строк, а не 2 000 $ × один курс')
  assert.equal(s.objects[0]!.currency, 'UZS')
  assert.equal(s.objects[0]!.bookCurrency, 'USD', 'валюта учёта сохранена')
  assert.equal(s.objects[0]!.contractAmount, 12_500_000_000, 'договор 10 000 $ — по курсу объекта 12 500')
})

test('операция, записанная в сумах, в сумах показывается ровно как введена', () => {
  const uzs = op('c', 'exp', 1_234_500_00, { currency: 'UZS', rate: 1 / 12_345, fx: 12_345, amountBase: 1_000_000 })
  assert.equal(opIn(uzs, 'UZS', 'USD', 12_000), 1_234_500_00, 'без пересчёта туда-обратно')
  assert.equal(opIn(uzs, 'USD', 'USD', 12_000), 1_000_000, 'в долларах — сумма в валюте объекта')
})

test('в валюте учёта ничего не меняется', () => {
  const raw = state([op('a', 'in', 100_000, { fx: 13_000 })])
  const s = inCurrency(raw, 'USD')
  assert.equal(s.ops[0]!.amountBase, 100_000)
  assert.equal(s.totals.s1!.inc, 100_000)
  assert.equal(s.stages[0]!.amount, 1_000_000)
})

test('полностью оплаченный этап в сумах: долг ноль, разница кассы — курсовая', () => {
  // Этап 10 000 $, заказчик заплатил двумя частями по разным курсам, всё раздали.
  const s = inCurrency(state([
    op('a', 'in', 500_000, { fx: 12_000 }),
    op('b', 'in', 500_000, { fx: 13_000 }),
    op('c', 'adv', 1_000_000, { personId: 'a', fx: 12_500 }),
  ]), 'UZS')
  const t = s.totals.s1!
  assert.equal(t.debt, 0, 'долг считается из валюты учёта — оплачено всё')
  assert.equal(t.cash, 6_000_000_000 + 6_500_000_000 - 12_500_000_000, 'касса по строкам: 0')
  assert.equal(t.fxDiff, t.cash, 'в учёте касса 0 — всё, что есть в сумах, курсовая разница')

  const t2 = inCurrency(state([op('a', 'in', 500_000, { fx: 12_000 }), op('c', 'adv', 500_000, { personId: 'a', fx: 13_000 })]), 'UZS').totals.s1!
  assert.equal(t2.cash, -500_000_000, 'приход по 12 000, аванс по 13 000: −5 000 000 сум')
  assert.equal(t2.fxDiff, -500_000_000, 'и это целиком курсовая разница, в долларах касса 0')
})
