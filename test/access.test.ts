import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcStage, operationWarnings, settingsProblems, today, type Op, type Stage } from '../shared/calc.ts'
import { narrowTotals, visibleOp } from '../shared/visibility.ts'
import { csvCell, toCsv } from '../shared/csv.ts'

/** Права и проверки, которые раньше обходились: утечки по ролям, обязательства, CSV. */

const shares = [
  { personId: 'ilhom', percent: 75 },
  { personId: 'ulugbek', percent: 15 },
  { personId: 'dilshod', percent: 10 },
]
const stage: Stage = { id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_800_000, status: 'work', closedAt: null }

let seq = 0
const op = (kind: Op['kind'], amount: number, personId: string | null = null, extra: Partial<Op> = {}): Op => ({
  id: `op${++seq}`, stageId: 's1', objectId: 'o1', date: today(), kind,
  amount, currency: 'USD', rate: 1, amountBase: amount,
  personId, categoryId: kind === 'exp' ? 'x' : null, teamId: null, offObject: false, note: '', status: 'ok', dueDate: null,
  isAuto: false, parentId: null, reversesId: null,
  createdAt: `2026-07-13T00:00:${String(seq).padStart(2, '0')}Z`, createdBy: null, reason: '',
  ...extra,
})

const ops = [
  op('in', 800_000),
  op('exp', 80_000, 'ilhom', { isAuto: true, categoryId: 'bonus' }),
  op('exp', 100_000),
  op('adv', 160_000, 'ilhom'),
  op('adv', 20_000, 'ulugbek'),
]
const full = calcStage(stage, ops, shares)
const member = { role: 'member' as const, personId: 'ulugbek' }
const foreman = { role: 'foreman' as const, personId: null }

test('прораб: предупреждения не выдают приход — подбором суммы его не вычислить', () => {
  for (const amount of [1_000, 500_000, 700_000]) {
    const w = operationWarnings({ kind: 'exp', amountBase: amount, date: today(), personId: null }, stage, ops, full, { revealIncome: false })
    assert.ok(!w.some(x => /освоено|прихода/.test(x.text)), `сумма ${amount}: без предупреждений от прихода`)
  }
  const shown = operationWarnings({ kind: 'exp', amountBase: 700_000, date: today(), personId: null }, stage, ops, full)
  assert.ok(shown.some(x => /освоено/.test(x.text)), 'владельцу освоение показывается')
})

test('обещанный аванс занимает долю: второе обещание сверх доли предупреждает', () => {
  // Доля ulugbek: 15 % от (18 000 − 1 800) = 2 430, выдано 200, осталось 2 230.
  const promised = [...ops, op('adv', 200_000, 'ulugbek', { status: 'promised' })]
  const t = calcStage(stage, promised, shares)
  const w = operationWarnings({ kind: 'adv', amountBase: 50_000, date: today(), personId: 'ulugbek' }, stage, promised, t)
  assert.ok(w.some(x => /Аванс/.test(x.text)), '2 000 обещано + 500 > 2 230')
  const ok = operationWarnings({ kind: 'adv', amountBase: 20_000, date: today(), personId: 'ulugbek' }, stage, promised, t)
  assert.ok(!ok.some(x => /Аванс/.test(x.text)), '2 000 + 200 укладывается')
})

test('проведение обязательства не считает само себя обещанным', () => {
  const pending = op('adv', 200_000, 'ulugbek', { status: 'promised' })
  const rest = [...ops, pending]
  const t = calcStage(stage, rest, shares)
  const w = operationWarnings({ kind: 'adv', amountBase: 200_000, date: today(), personId: 'ulugbek' }, stage, rest, t, { ignoreId: pending.id })
  assert.ok(!w.some(x => /Аванс/.test(x.text)))
})

test('участник: не видит бонус и чужие авансы ни строками, ни суммами', () => {
  const visible = ops.filter(o => visibleOp(o, member))
  assert.ok(!visible.some(o => o.isAuto), 'строки бонуса скрыты')
  assert.ok(!visible.some(o => o.kind === 'adv' && o.personId !== 'ulugbek'), 'чужие авансы скрыты')
  const t = narrowTotals(full, visible, member)
  assert.equal(t.bonus, 0)
  assert.equal(t.adv, 20_000, 'в сумме авансов только свои')
  assert.deepEqual(t.parts.map(p => p.personId), ['ulugbek'])
  assert.equal(t.dueTotal, t.parts[0]!.due)
})

test('прораб: только касса и свои расходы, без прихода, долга и долей', () => {
  const visible = ops.filter(o => visibleOp(o, foreman))
  assert.ok(visible.every(o => o.kind === 'exp' && !o.isAuto))
  const t = narrowTotals(full, visible, foreman)
  assert.equal(t.inc, 0)
  assert.equal(t.debt, 0)
  assert.equal(t.net, 0)
  assert.equal(t.exp, 100_000, 'расходы без бонуса')
  assert.deepEqual(t.parts, [])
})

test('CSV: текст, похожий на формулу, остаётся текстом', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`)
  for (const s of ['+1', '-2+3', '@SUM(A1)', '\t=1']) assert.ok(csvCell(s).startsWith(`"'`), s)
  assert.equal(csvCell('обычный текст'), '"обычный текст"')
  assert.equal(csvCell('-12.50', { numeric: true }), '"-12.50"', 'число со знаком не трогаем')
  const csv = toCsv([['Сумма', 'Комментарий'], ['-5.00', '=1+1']], [0])
  assert.ok(csv.startsWith('﻿'))
  assert.ok(csv.includes(`"-5.00";"'=1+1"`))
})

test('доли: сумма считается в сотых, без ошибки плавающей точки', () => {
  const base = { bonusScale: [] }
  const thirds = [
    { personId: 'a', percent: 33.33 },
    { personId: 'b', percent: 33.33 },
    { personId: 'c', percent: 33.34 },
  ]
  assert.deepEqual(settingsProblems({ ...base, shares: thirds }), [], '33,33 + 33,33 + 33,34 = 100')
  const long = [{ personId: 'a', percent: 33.333 }, { personId: 'b', percent: 66.667 }]
  assert.ok(settingsProblems({ ...base, shares: long }).some(p => /двух знаков/.test(p.text)))
})
