import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bonusOf, calcStage, categoriesFor, categoryGroups, categoryReport, closingProblems, obligations,
  otherCurrency, parseMoney, periodRange, periodReport, settingsProblems, splitShares, toBase,
  toObjectCurrency,
  type Category, type Op, type Settings, type Stage,
} from '../shared/calc.ts'
import { abilities } from '../shared/roles.ts'

/** Контрольный пример из раздела 14 ТЗ: «Ресторан, Конибодом», договор 18 000, ставка 10 %. */

const shares = [
  { personId: 'ilhom', percent: 75 },
  { personId: 'ulugbek', percent: 15 },
  { personId: 'dilshod', percent: 10 },
]

const stage: Stage = {
  id: 's1', objectId: 'o1', number: 1, name: '', amount: 1_800_000, status: 'work', closedAt: null,
}

let seq = 0
const op = (
  kind: Op['kind'],
  amount: number,
  personId: string | null = null,
  extra: Partial<Op> = {},
): Op => ({
  id: `op${++seq}`, stageId: 's1', objectId: 'o1', date: '2026-07-13', kind,
  amount, currency: 'USD', rate: 1, amountBase: amount,
  personId, categoryId: kind === 'exp' ? 'x' : null, note: '', status: 'ok', dueDate: null,
  isAuto: false, parentId: null, reversesId: null,
  createdAt: `2026-07-13T00:00:${String(seq).padStart(2, '0')}Z`, createdBy: null, reason: '',
  ...extra,
})

const expenses = () => [
  op('exp', 20_000), op('exp', 20_000), op('exp', 200_000), op('exp', 120_000),
  op('exp', 40_000), op('exp', 20_000), op('exp', 50_000), op('exp', 15_000),
]
const advances = () => [
  op('adv', 160_000, 'ilhom'), op('adv', 20_000, 'ulugbek'), op('adv', 50_000, 'dilshod'),
]

test('после первого прихода 8 000', () => {
  const ops = [
    op('in', 800_000),
    op('exp', bonusOf(800_000, 10), 'ilhom', { isAuto: true, categoryId: 'bonus' }),
    ...expenses(), ...advances(),
  ]
  const t = calcStage(stage, ops, shares)

  assert.equal(bonusOf(800_000, 10), 80_000, 'бонус 800')
  assert.equal(t.exp, 565_000, 'расходы этапа 5 650')
  assert.equal(t.adv, 230_000, 'авансы участникам 2 300')
  assert.equal(t.cash, 5_000, 'касса объекта 50')
  assert.equal(t.debt, 1_000_000, 'дебиторка 10 000')
})

test('после второго прихода 10 000 — итог этапа', () => {
  const ops = [
    op('in', 800_000), op('exp', bonusOf(800_000, 10), 'ilhom', { isAuto: true, categoryId: 'bonus' }),
    op('in', 1_000_000), op('exp', bonusOf(1_000_000, 10), 'ilhom', { isAuto: true, categoryId: 'bonus' }),
    ...expenses(), ...advances(),
  ]
  const t = calcStage(stage, ops, shares)

  assert.equal(t.bonus, 180_000, 'суммарный бонус 1 800 = 10 % от 18 000')
  assert.equal(t.exp, 665_000, 'расходы этапа 6 650')
  assert.equal(t.net, 1_135_000, 'чистая доля 11 350')

  const [a, b, c] = t.parts
  assert.deepEqual([a!.amount, b!.amount, c!.amount], [851_250, 170_250, 113_500], 'доли 8 512,50 / 1 702,50 / 1 135,00')
  assert.deepEqual([a!.due, b!.due, c!.due], [691_250, 150_250, 63_500], 'к доплате 6 912,50 / 1 502,50 / 635,00')
  assert.equal(t.dueTotal, 905_000, 'итого к доплате 9 050')

  // Проверка сходимости: касса 50 + приход 10 000 = бонус 1 000 + доплаты 9 050.
  assert.equal(5_000 + 1_000_000, 100_000 + t.dueTotal)
})

test('сумма долей всегда точно равна чистой доле — остаток уходит в 75 %', () => {
  for (const net of [1_000_001, 999_999, 7, -13, 0, 123_456_789]) {
    const parts = splitShares(net, shares)
    assert.equal(parts.reduce((s, p) => s + p.amount, 0), net, `нет расхождения при ${net}`)
  }
  assert.equal(splitShares(1_000_001, shares)[0]!.amount, 750_001, 'остаток в наибольшей доле')
})

test('отменённые операции в расчёт не входят', () => {
  const income = op('in', 800_000, null, { status: 'void' })
  const bonus = op('exp', 80_000, 'ilhom', { status: 'void', isAuto: true })
  const t = calcStage(stage, [income, bonus], shares)
  assert.equal(t.inc, 0)
  assert.equal(t.exp, 0)
  assert.equal(t.net, stage.amount)
})

test('обязательства не входят в кассу, но видны отдельно', () => {
  const ops = [
    op('in', 800_000),
    op('exp', 50_000, null, { status: 'promised', dueDate: '2026-08-01' }),
    op('exp', 30_000),
  ]
  const t = calcStage(stage, ops, shares)
  assert.equal(t.exp, 30_000, 'обещанный расход не уменьшает чистую долю')
  assert.equal(t.cash, 770_000, 'и не трогает кассу')
  assert.equal(t.promised, 50_000, 'но показан строкой «предстоит выплатить»')

  const list = obligations({ ops, objects: [], stages: [stage] }, '2026-08-05')
  assert.equal(list.length, 1)
  assert.ok(list[0]!.overdue, 'срок 01.08 при сегодняшнем 05.08 — просрочено')
})

test('операция в другой валюте пересчитывается по курсу на дату', () => {
  assert.equal(toBase(1_000_000, 0.000_079), 79, 'сумы в доллары')
  const ops = [op('in', 800_000), op('exp', 12_600_000, null, { currency: 'UZS', rate: 0.0079, amountBase: 99_540 })]
  const t = calcStage(stage, ops, shares)
  assert.equal(t.exp, 99_540, 'в расчёт идёт сумма в валюте объекта')
})

test('этап не закрывается при расхождении', () => {
  const partial = calcStage(stage, [op('in', 800_000)], shares)
  assert.ok(closingProblems(stage, partial).length > 0, 'дебиторка и касса не нулевые')

  const paid = [
    op('in', 1_800_000),
    ...splitShares(1_800_000, shares).map(p => op('adv', p.amount, p.personId)),
  ]
  assert.deepEqual(closingProblems(stage, calcStage(stage, paid, shares)), [], 'всё сошлось — можно закрывать')
})

test('справочники: доли 100 %, ставка до 40 %, шкала без разрывов', () => {
  const base: Pick<Settings, 'shares' | 'bonusScale'> = { shares: [], bonusScale: [] }

  assert.ok(settingsProblems({ ...base, shares: [{ personId: 'a', percent: 95 }] }).length, 'сумма 95 % не проходит')
  assert.deepEqual(settingsProblems({ ...base, shares }), [], 'сумма 100 % проходит')
  assert.ok(settingsProblems({ ...base, bonusScale: [{ from: 0, to: null, rate: 41 }] }).length, 'ставка 41 % не проходит')
  assert.ok(
    settingsProblems({ ...base, bonusScale: [{ from: 0, to: 100, rate: 10 }, { from: 500, to: null, rate: 15 }] }).length,
    'разрыв в шкале не проходит',
  )
})

test('отчёт по категориям считает долю бонуса в расходах', () => {
  const ops = [
    op('exp', 80_000, 'ilhom', { isAuto: true, categoryId: 'bonus' }),
    op('exp', 200_000, null, { categoryId: 'rent' }),
    op('exp', 20_000, null, { categoryId: 'rent' }),
    op('adv', 50_000, 'ilhom'),
  ]
  const settings = { categories: [
    { id: 'bonus', name: 'Бонус', system: true, archived: false },
    { id: 'rent', name: 'Аренда', system: false, archived: false },
  ] } as Settings

  const report = categoryReport({ ops, settings })
  assert.equal(report.total, 300_000, 'авансы в расходы не попадают')
  assert.equal(report.bonus, 80_000)
  assert.equal(report.rows[0]!.name, 'Аренда', 'сортировка по убыванию суммы')
  assert.equal(report.rows[0]!.count, 2)
})

test('права ролей: прораб не видит договор, бонус и доли', () => {
  const foreman = abilities('foreman')
  assert.equal(foreman.seeContract, false)
  assert.equal(foreman.seeBonus, false)
  assert.equal(foreman.seeAllShares, false)
  assert.deepEqual(foreman.kinds, ['exp'], 'вносит только расходы')

  const member = abilities('member')
  assert.equal(member.seeBonus, false, 'участник не видит ставку бонуса')
  assert.equal(member.seeAllShares, false, 'и чужие доли')
  assert.equal(member.seeOwnShare, true, 'но видит свою')

  assert.equal(abilities('accountant').write, false, 'бухгалтер только читает')
  assert.equal(abilities('owner').manage, true)
})

test('разбор сумм: только целые центы', () => {
  assert.equal(parseMoney('8 000'), 800_000)
  assert.equal(parseMoney('1 135,00'), 113_500)
  assert.equal(parseMoney('0.05'), 5)
  assert.equal(parseMoney('8000.123'), null)
  assert.equal(parseMoney('восемь'), null)
  assert.equal(parseMoney(''), null)
})

test('категории показываются там, где нужны', () => {
  const cat = (id: string, name: string, teamId: string | null, group: string | null): Category =>
    ({ id, name, teamId, group, system: false, archived: false })

  const list = [
    cat('bonus', 'Бонус', null, null),
    cat('mat', 'Материалы', null, null),
    cat('sketch', 'Эскизный проект', 'arch', null),
    cat('concept', 'Концепция интерьера', 'design', null),
    cat('util', 'Коммунальные', null, 'Офис'),
    cat('fuel', 'Топливо', null, 'Транспорт'),
  ]
  list[0]!.system = true

  const arch = categoriesFor(list, { teamId: 'arch' }).map(c => c.id)
  assert.deepEqual(arch, ['mat', 'sketch'], 'архитектору — его работы и общие по объекту')
  assert.ok(!arch.includes('concept'), 'чужие работы не предлагаются')
  assert.ok(!arch.includes('bonus'), 'системная категория руками не ставится')
  assert.ok(!arch.includes('util'), 'офисные расходы к объекту не относятся')

  const office = categoriesFor(list, { offObject: true, group: 'Офис' }).map(c => c.id)
  assert.deepEqual(office, ['util'], 'вне объекта — только категории выбранной группы')

  assert.deepEqual(categoryGroups(list), ['Офис', 'Транспорт'])
})

test('курс объекта переводит суммы в обе стороны', () => {
  // 120 000 сум по курсу 12 000 — это 10 долларов
  assert.equal(toObjectCurrency(12_000_000, 'UZS', 'USD', 12_000), 1_000)
  // и наоборот: объект в сумах, сумма набрана в долларах
  assert.equal(toObjectCurrency(1_000, 'USD', 'UZS', 12_000), 12_000_000)
  assert.equal(toObjectCurrency(1_000, 'USD', 'USD', 12_000), 1_000, 'своя валюта не пересчитывается')
  assert.equal(toObjectCurrency(1_000, 'UZS', 'USD', 0), 1_000, 'без курса сумма идёт как есть')
  assert.equal(otherCurrency('USD'), 'UZS')
  assert.equal(otherCurrency('UZS'), 'USD')
})

test('сводка за период: разные валюты сводятся в одну', () => {
  const obj = (id: string, name: string, currency: string, rate: number) =>
    ({ id, name, currency, rate, contractAmount: 0 }) as never

  const line = (id: string, objectId: string, date: string, kind: Op['kind'], amount: number, extra = {}) => ({
    id, stageId: 's', objectId, date, kind, amount, currency: 'USD', rate: 1, amountBase: amount,
    personId: null, categoryId: kind === 'exp' ? 'mat' : null, teamId: null, offObject: false,
    note: '', status: 'ok', dueDate: null, isAuto: false, parentId: null, reversesId: null,
    createdAt: date, createdBy: null, reason: '', ...extra,
  }) as Op

  const state = {
    objects: [obj('o1', 'Долларовый', 'USD', 12_000), obj('o2', 'Сумовой', 'UZS', 12_000)],
    teams: [],
    settings: {
      currency: 'USD', displayRate: 12_000, people: [], categories: [{ id: 'mat', name: 'Материалы' }],
      shares: [], bonusScale: [],
    },
    ops: [
      line('a', 'o1', '2026-03-10', 'in', 100_000),          // 1 000 USD
      line('b', 'o2', '2026-03-12', 'in', 1_200_000_000),    // 12 000 000 сум = 1 000 USD
      line('c', 'o1', '2026-03-15', 'exp', 20_000),          // 200 USD
      line('d', 'o1', '2026-08-01', 'exp', 50_000),          // вне периода
      line('e', 'o1', '2026-03-20', 'exp', 10_000, { status: 'void' }), // отменённая не считается
    ],
  } as never

  const r = periodReport(state, { from: '2026-03-01', to: '2026-03-31' })
  assert.equal(r.currency, 'USD')
  assert.equal(r.count, 3, 'взяты три операции марта')
  assert.equal(r.inc, 200_000, 'сумовой приход пересчитан в доллары и сложился с долларовым')
  assert.equal(r.exp, 20_000)
  assert.equal(r.flow, 180_000, 'приход минус расход')
  assert.equal(r.objects.length, 2)
  assert.equal(r.objects.find(x => x.id === 'o2')!.inc, 100_000, 'объект в сумах показан в долларах')
  assert.equal(r.months.length, 1, 'весь период уместился в один месяц')
  assert.equal(r.categories[0]!.exp, 20_000)
})

test('границы периода', () => {
  assert.deepEqual(periodRange('month', '2026-02-11'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(periodRange('quarter', '2026-05-30'), { from: '2026-04-01', to: '2026-06-30' })
  assert.deepEqual(periodRange('year', '2026-05-30'), { from: '2026-01-01', to: '2026-12-31' })
  assert.deepEqual(periodRange('all'), { from: '', to: '' })
})
