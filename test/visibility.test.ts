import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bonusOf, calcStage, type Op, type Stage } from '../shared/calc.ts'
import { narrowTotals, visibleOp, type Viewer } from '../shared/visibility.ts'

/**
 * Главное правило проекции: итог, отданный роли, складывается из строк,
 * которые она видит. Иначе скрытое (бонус, чужие авансы) находится вычитанием.
 */

const shares = [
  { personId: 'ilhom', percent: 75 },
  { personId: 'ulugbek', percent: 15 },
  { personId: 'dilshod', percent: 10 },
]

const stage: Stage = {
  id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_800_000, status: 'work', closedAt: null,
}

let seq = 0
const op = (kind: Op['kind'], amount: number, extra: Partial<Op> = {}): Op => ({
  id: `op${++seq}`, stageId: 's1', objectId: 'o1', date: '2026-07-13', kind,
  amount, currency: 'USD', rate: 1, amountBase: amount,
  personId: null, categoryId: kind === 'exp' ? 'x' : null, teamId: null, offObject: false,
  note: '', status: 'ok', dueDate: null, isAuto: false, parentId: null, reversesId: null,
  createdAt: `2026-07-13T00:00:${String(seq).padStart(2, '0')}Z`, createdBy: null, reason: '',
  ...extra,
})

const income = op('in', 800_000)
const ops: Op[] = [
  income,
  op('exp', bonusOf(800_000, 10), { isAuto: true, categoryId: 'bonus', personId: 'nozir', parentId: income.id }),
  op('exp', 200_000, { personId: 'shuhrat' }),
  op('adv', 100_000, { personId: 'ilhom' }),
  op('adv', 50_000, { personId: 'ulugbek' }),
  op('exp', 30_000, { status: 'promised' }),
]

const full = calcStage(stage, ops, shares)
const seen = (viewer: Viewer) => {
  const visible = ops.filter(o => visibleOp(o, viewer))
  return { visible, totals: narrowTotals(full, visible, viewer) }
}
const sum = (list: Op[], kind: Op['kind']) =>
  list.reduce((a, o) => a + (o.kind === kind && o.status === 'ok' ? o.amountBase : 0), 0)

test('участник: расходы и авансы в итогах равны видимым строкам — бонус не вычесть', () => {
  const { visible, totals } = seen({ role: 'member', personId: 'ilhom' })
  assert.equal(totals.exp, sum(visible, 'exp'))
  assert.equal(totals.adv, sum(visible, 'adv'))
  assert.equal(totals.bonus, 0)
  assert.ok(visible.every(o => !o.isAuto))
  assert.ok(visible.filter(o => o.kind === 'adv').every(o => o.personId === 'ilhom'))
  assert.deepEqual(totals.parts.map(p => p.personId), ['ilhom'])
  assert.equal(totals.dueTotal, totals.parts[0]!.due)
})

test('участник без карточки человека не видит ни одного аванса', () => {
  const { visible, totals } = seen({ role: 'member', personId: null })
  assert.equal(visible.filter(o => o.kind === 'adv').length, 0)
  assert.equal(totals.adv, 0)
  assert.deepEqual(totals.parts, [])
})

test('прораб: только расходы без бонуса и касса', () => {
  const { visible, totals } = seen({ role: 'foreman', personId: null })
  assert.ok(visible.every(o => o.kind === 'exp' && !o.isAuto))
  assert.equal(totals.exp, sum(visible, 'exp'))
  assert.equal(totals.inc, 0)
  assert.equal(totals.net, 0)
  assert.equal(totals.cash, full.cash)
  assert.equal(totals.promised, 30_000)
})

test('владелец и бухгалтер видят всё как есть', () => {
  for (const role of ['owner', 'accountant'] as const) {
    const { visible, totals } = seen({ role, personId: null })
    assert.equal(visible.length, ops.length)
    assert.deepEqual(totals, full)
  }
})
