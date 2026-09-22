import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  objectForecast, objectTeams, personPlan, stageProgress, stageTeams, teamMembers, teamPeople,
} from '../shared/plan.ts'
import { calcStage, type Obj, type Op, type Share, type Stage } from '../shared/calc.ts'

/** Пример из постановки: договор 18 000, архитекторы 2 000, конструкторы 3 000, дизайнеры 5 000. */

const shares: Share[] = [
  { personId: 'ilhom', percent: 75 },
  { personId: 'ulugbek', percent: 15 },
  { personId: 'dilshod', percent: 10 },
]

const stage: Stage = {
  id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_800_000, status: 'work', closedAt: null,
}

const obj = { id: 'o1', contractAmount: 1_800_000 } as Obj

let seq = 0
const op = (kind: Op['kind'], amount: number, extra: Partial<Op> = {}): Op => ({
  id: `op${++seq}`, stageId: 's1', objectId: 'o1', date: '2026-07-13', kind,
  amount, currency: 'USD', rate: 1, amountBase: amount,
  personId: null, categoryId: kind === 'exp' ? 'x' : null, teamId: null, offObject: false,
  note: '', status: 'ok', dueDate: null, isAuto: false, parentId: null, reversesId: null,
  createdAt: `2026-07-13T00:00:${String(seq).padStart(2, '0')}Z`, createdBy: null, reason: '',
  ...extra,
})

const teams = [
  { id: 'arch', name: 'Архитекторы', composite: false, parts: [], archived: false },
  { id: 'struct', name: 'Конструкторы', composite: false, parts: [], archived: false },
  { id: 'design', name: 'Дизайнеры', composite: false, parts: [], archived: false },
]

const budgets = [
  { objectId: 'o1', teamId: 'arch', personId: null, amount: 200_000, note: '' },
  { objectId: 'o1', teamId: 'struct', personId: null, amount: 300_000, note: '' },
  { objectId: 'o1', teamId: 'design', personId: null, amount: 500_000, note: '' },
]

test('план команды: договорились, выделили на этап, потратили', () => {
  const state = {
    stages: [stage],
    teams,
    budgets,
    // с первого этапа архитекторам выделили 2 000 из 5 000 — пример из постановки
    allocations: [{ stageId: 's1', teamId: 'design', amount: 200_000 }],
    ops: [op('exp', 120_000, { teamId: 'struct' })],
  }

  const rows = objectTeams(state, 'o1')
  const design = rows.find(r => r.teamId === 'design')!
  assert.equal(design.planned, 500_000, 'договорились на 5 000')
  assert.equal(design.allocated, 200_000, 'выделено на этап 2 000')
  assert.equal(design.unallocated, 300_000, 'ещё не разнесено 3 000')
  assert.equal(design.spent, 0)
  assert.equal(design.left, 500_000, 'по плану осталось выплатить всё')

  const struct = rows.find(r => r.teamId === 'struct')!
  assert.equal(struct.spent, 120_000, 'конструкторам уже заплатили 1 200')
  assert.equal(struct.left, 180_000, 'по плану осталось 1 800')

  const onStage = stageTeams(state, 's1').find(r => r.teamId === 'design')!
  assert.equal(onStage.allocated, 200_000)
  assert.equal(onStage.left, 200_000, 'на этапе ещё ничего не выплачено')
})

test('прогноз доли учитывает и факт, и остаток плана', () => {
  const state = {
    stages: [stage],
    teams,
    budgets,
    allocations: [],
    ops: [
      op('in', 800_000),
      op('exp', 120_000, { teamId: 'struct' }),
      op('exp', 20_000, { teamId: 'arch' }),
      op('adv', 160_000, { personId: 'ilhom' }),
    ],
  }

  const f = objectForecast(state, obj, shares)
  assert.equal(f.spent, 140_000, 'потрачено 1 400')
  // осталось по планам: арх 1 800 + констр 1 800 + диз 5 000 = 8 600
  assert.equal(f.planLeft, 860_000)
  assert.equal(f.net, 1_800_000 - 140_000 - 860_000, 'прогнозная чистая доля 8 000')
  assert.equal(f.net, 800_000)

  const ilhom = f.parts.find(p => p.personId === 'ilhom')!
  assert.equal(ilhom.amount, 600_000, '75 % от 8 000')
  assert.equal(ilhom.paid, 160_000)
  assert.equal(ilhom.due, 440_000)
  assert.equal(f.parts.reduce((a, p) => a + p.amount, 0), f.net, 'доли сходятся к чистой доле')
})

test('расход не по объекту не уменьшает чистую долю', () => {
  const ops = [
    op('in', 800_000),
    op('exp', 100_000, { teamId: 'arch' }),
    op('adv', 50_000, { personId: 'ulugbek', offObject: true, categoryId: 'trn' }),
  ]
  const t = calcStage(stage, ops, shares)
  assert.equal(t.exp, 100_000, 'в расходы этапа попал только прямой расход')
  assert.equal(t.adv, 50_000, 'расход не по объекту учтён авансом участнику')
  assert.equal(t.net, 1_700_000, 'чистая доля уменьшилась только на прямой расход')
  assert.equal(t.cash, 650_000, 'а касса — на оба')
})

test('закрытие этапа: получено и выплачено', () => {
  const empty = calcStage(stage, [], shares)
  assert.equal(stageProgress(stage, empty).overall, 0, 'ничего не двигалось')

  const half = calcStage(stage, [op('in', 900_000)], shares)
  const p = stageProgress(stage, half)
  assert.equal(p.received, 0.5, 'получена половина суммы этапа')
  assert.equal(p.settled, 0, 'участникам ещё не выплачено')
  assert.ok(p.overall > 0 && p.overall < 1)
  assert.equal(p.done, false)

  const closed = calcStage(
    stage,
    [op('in', 1_800_000), ...shares.map(s => op('adv', Math.floor(1_800_000 * s.percent / 100), { personId: s.personId }))],
    shares,
  )
  const full = stageProgress(stage, closed)
  assert.equal(full.received, 1)
  assert.equal(full.settled, 1)
  assert.equal(full.overall, 1, 'этап закрыт на сто процентов')
  assert.equal(full.done, true, 'дебиторка и касса по нулям')
})

/* ---------- люди по командам ---------- */

const person = (id: string, name: string, teamId: string | null, isSharer = false) =>
  ({ id, name, role: '', phone: '', teamId, isSharer })

const people = [
  person('shuhrat', 'Шухрат ака', 'arch'),
  person('parhayot', 'Пархаёт ака', 'struct'),
  person('nozir', 'Дилмурод ака', null),
  person('ilhom', 'Илхом', null, true),
]

test('выбрали команду — видно только её людей', () => {
  const design = { id: 'design', name: 'Дизайнеры', composite: false, parts: [], archived: false }
  assert.deepEqual(teamMembers(people, design).map(p => p.id), [], 'в дизайнерах пока никого')

  const arch = { id: 'arch', name: 'Архитекторы', composite: false, parts: [], archived: false }
  assert.deepEqual(teamMembers(people, arch).map(p => p.id), ['shuhrat'])

  const multi = { id: 'multi', name: 'Мультикоманда', composite: true, parts: ['arch', 'struct'], archived: false }
  assert.deepEqual(teamMembers(people, multi).map(p => p.id), ['shuhrat', 'parhayot'], 'мультикоманда собирает направления')

  assert.deepEqual(teamMembers(people, null).map(p => p.id), ['nozir', 'ilhom'], 'без команды — внештатные')
})

test('карточка человека: сколько получил, сколько ещё нет и когда', () => {
  const state = {
    objects: [{ id: 'o1', name: 'Ресторан' } as Obj],
    settings: { people, shares, categories: [], currency: 'USD', displayRate: 12000, bonusScale: [] },
    sharesByVersion: {},
    stages: [stage],
    teams,
    budgets,
    allocations: [{ stageId: 's1', teamId: 'arch', amount: 200_000 }],
    ops: [
      op('exp', 120_000, { personId: 'shuhrat', teamId: 'arch' }),
      op('exp', 80_000, { personId: 'shuhrat', teamId: 'arch', status: 'promised', dueDate: '2026-10-05' }),
    ],
  } as never

  const plan = personPlan(state, 'shuhrat')
  assert.equal(plan.basis, 'team')
  assert.equal(plan.expected, 200_000, 'с архитекторами договорились на 2 000')
  assert.equal(plan.paid, 120_000, 'выплачено 1 200')
  assert.equal(plan.left, 80_000, 'не получено 800')
  assert.equal(plan.next?.dueDate, '2026-10-05', 'срок взят из обязательства')
  assert.equal(plan.rows[0]!.objectName, 'Ресторан')

  // Дольщик считается по доле, а не по плану команды.
  const ilhom = personPlan(state, 'ilhom')
  assert.equal(ilhom.basis, 'share')
  assert.equal(ilhom.paid, 0, 'авансов не выдавали')
})

test('план команды делится на людей', () => {
  const state = {
    objects: [{ id: 'o1', name: 'Ресторан' } as Obj],
    settings: { people, shares, categories: [], currency: 'USD', displayRate: 12000, bonusScale: [] },
    sharesByVersion: {},
    stages: [stage],
    teams: [...teams, { id: 'arch2', name: 'Архитекторы', composite: false, parts: [], archived: false }],
    budgets: [
      ...budgets,
      // из 3 000 конструкторам 2 000 записаны на Пархаёта, 1 000 ещё не расписаны
      { objectId: 'o1', teamId: 'struct', personId: 'parhayot', amount: 200_000, note: '' },
    ],
    allocations: [],
    ops: [op('exp', 80_000, { personId: 'parhayot', teamId: 'struct' })],
  } as never

  const struct = objectTeams(state, 'o1').find(r => r.teamId === 'struct')!
  assert.equal(struct.planned, 300_000, 'с командой договорились на 3 000')
  assert.equal(struct.assigned, 200_000, 'на человека записаны 2 000')
  assert.equal(struct.unassigned, 100_000, 'ещё не расписана 1 000')

  const inside = teamPeople(state, 'o1', 'struct')
  assert.deepEqual(inside.map(r => r.personId), ['parhayot'])
  assert.equal(inside[0]!.planned, 200_000)
  assert.equal(inside[0]!.spent, 80_000, 'ему уже выплатили 800')
  assert.equal(inside[0]!.left, 120_000)

  // В карточке человека теперь его сумма, а не весь план команды.
  const plan = personPlan(state, 'parhayot')
  assert.equal(plan.personal, true)
  assert.equal(plan.expected, 200_000, 'причитается его 2 000, а не 3 000 команды')
  assert.equal(plan.paid, 80_000)
  assert.equal(plan.left, 120_000)

  // Своей суммы нет — остаётся общий план команды, и об этом честно сказано.
  const shuhrat = personPlan(state, 'shuhrat')
  assert.equal(shuhrat.personal, false)
  assert.equal(shuhrat.expected, 200_000, 'весь план архитекторов')
})
