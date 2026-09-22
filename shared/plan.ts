import { calcStage, sharesFor, splitShares, stagesOf, type AppState, type Obj, type Person, type Share, type Stage } from './calc.ts'

/**
 * Команды и планирование расходов.
 *
 * Прямой расход объекта относится к команде: архитекторы, дизайнеры,
 * конструкторы, инженерные сети. Бывает и мультикоманда — один человек
 * закрывает несколько направлений сразу; у неё перечислен состав.
 *
 * С командой на объект договариваются об общей сумме (план), а на каждый
 * этап из этого плана выделяют часть. Факт — проведённые расходы с этой
 * командой. Отсюда три числа: план, выделено, потрачено.
 */

export interface Team {
  id: string
  name: string
  /** Мультикоманда: один исполнитель закрывает несколько направлений. */
  composite: boolean
  /** Состав мультикоманды — идентификаторы направлений. */
  parts: string[]
  archived: boolean
}

/**
 * План по объекту: о какой сумме договорились с командой.
 * Пустой personId — сумма на всю команду; иначе это доля человека внутри неё.
 */
export interface Budget {
  objectId: string
  teamId: string
  personId: string | null
  amount: number
  note: string
}

/** Выделено команде на конкретный этап из плана объекта. */
export interface Allocation {
  stageId: string
  teamId: string
  amount: number
}

/**
 * Кто работает в команде. Выбрали дизайнеров — архитектор в списке
 * не появится. Без команды остаются те, кто ни в одной не состоит;
 * у мультикоманды в списке ещё и люди её направлений.
 */
export function teamMembers(people: Person[], team: Team | null): Person[] {
  if (!team) return people.filter(p => !p.teamId)
  return people.filter(p => p.teamId === team.id || (!!p.teamId && team.parts.includes(p.teamId)))
}

export interface TeamRow {
  teamId: string
  name: string
  /** Договорились на объект. */
  planned: number
  /** Разнесено по этапам. */
  allocated: number
  /** Проведено расходами. */
  spent: number
  /** Ещё не разнесено по этапам. */
  unallocated: number
  /** Расписано по людям команды. */
  assigned: number
  /** Ещё не расписано по людям. */
  unassigned: number
  /** Осталось выплатить по плану. */
  left: number
}

/** Сумма человека внутри плана команды. */
export interface TeamPersonRow {
  personId: string
  name: string
  planned: number
  spent: number
  left: number
}

export interface StageTeamRow {
  teamId: string
  name: string
  allocated: number
  spent: number
  left: number
}

type PlanState = Pick<AppState, 'ops' | 'stages' | 'teams' | 'budgets' | 'allocations'>

const teamName = (state: Pick<AppState, 'teams'>, id: string) =>
  state.teams.find(t => t.id === id)?.name ?? '—'

const base = (o: { amountBase?: number; amount: number }) => o.amountBase ?? o.amount

/** Проведённые расходы объекта по командам. */
function spentByTeam(state: PlanState, objectId: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const op of state.ops) {
    if (op.objectId !== objectId || op.kind !== 'exp' || op.status !== 'ok' || !op.teamId) continue
    out.set(op.teamId, (out.get(op.teamId) ?? 0) + base(op))
  }
  return out
}

/** План, выделение и факт по командам объекта. */
export function objectTeams(state: PlanState, objectId: string): TeamRow[] {
  const spent = spentByTeam(state, objectId)
  const stageIds = new Set(stagesOf(state.stages, objectId).map(s => s.id))

  const allocated = new Map<string, number>()
  for (const a of state.allocations) {
    if (!stageIds.has(a.stageId)) continue
    allocated.set(a.teamId, (allocated.get(a.teamId) ?? 0) + a.amount)
  }

  const ids = new Set<string>([
    ...state.budgets.filter(b => b.objectId === objectId).map(b => b.teamId),
    ...allocated.keys(),
    ...spent.keys(),
  ])

  return [...ids]
    .map((teamId) => {
      const rows = state.budgets.filter(b => b.objectId === objectId && b.teamId === teamId)
      const assigned = rows.filter(b => b.personId).reduce((a, b) => a + b.amount, 0)
      // Договорились с командой в целом; если такой строки нет — план собран из людей.
      const planned = rows.find(b => !b.personId)?.amount ?? assigned
      const done = spent.get(teamId) ?? 0
      const given = allocated.get(teamId) ?? 0
      return {
        teamId,
        name: teamName(state, teamId),
        planned,
        allocated: given,
        spent: done,
        unallocated: Math.max(0, planned - given),
        assigned,
        unassigned: Math.max(0, planned - assigned),
        left: Math.max(0, planned - done),
      }
    })
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name, 'ru'))
}

/**
 * Кто сколько получает внутри команды на этом объекте.
 * В списке все люди команды и все, на кого уже записаны её расходы.
 */
export function teamPeople(
  state: PlanState & Pick<AppState, 'settings'>,
  objectId: string,
  teamId: string,
): TeamPersonRow[] {
  const team = state.teams.find(t => t.id === teamId) ?? null
  const spent = new Map<string, number>()
  for (const op of state.ops) {
    if (op.objectId !== objectId || op.kind !== 'exp' || op.status !== 'ok') continue
    if (op.teamId !== teamId || !op.personId) continue
    spent.set(op.personId, (spent.get(op.personId) ?? 0) + base(op))
  }

  const planned = new Map<string, number>()
  for (const b of state.budgets) {
    if (b.objectId !== objectId || b.teamId !== teamId || !b.personId) continue
    planned.set(b.personId, b.amount)
  }

  const ids = new Set<string>([
    ...teamMembers(state.settings.people, team).map(p => p.id),
    ...planned.keys(),
    ...spent.keys(),
  ])

  return [...ids]
    .map((personId) => {
      const plan = planned.get(personId) ?? 0
      const done = spent.get(personId) ?? 0
      return {
        personId,
        name: state.settings.people.find(p => p.id === personId)?.name ?? '—',
        planned: plan,
        spent: done,
        left: Math.max(0, plan - done),
      }
    })
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name, 'ru'))
}

/** То же самое в разрезе одного этапа. */
export function stageTeams(state: PlanState, stageId: string): StageTeamRow[] {
  const spent = new Map<string, number>()
  for (const op of state.ops) {
    if (op.stageId !== stageId || op.kind !== 'exp' || op.status !== 'ok' || !op.teamId) continue
    spent.set(op.teamId, (spent.get(op.teamId) ?? 0) + base(op))
  }

  const allocated = new Map<string, number>()
  for (const a of state.allocations) {
    if (a.stageId !== stageId) continue
    allocated.set(a.teamId, (allocated.get(a.teamId) ?? 0) + a.amount)
  }

  const ids = new Set<string>([...allocated.keys(), ...spent.keys()])
  return [...ids]
    .map(teamId => ({
      teamId,
      name: teamName(state, teamId),
      allocated: allocated.get(teamId) ?? 0,
      spent: spent.get(teamId) ?? 0,
      left: Math.max(0, (allocated.get(teamId) ?? 0) - (spent.get(teamId) ?? 0)),
    }))
    .sort((a, b) => b.allocated - a.allocated || a.name.localeCompare(b.name, 'ru'))
}

export interface ForecastPart {
  personId: string
  percent: number
  /** Доля от прогнозной чистой доли всего договора. */
  amount: number
  /** Выдано по всем этапам объекта. */
  paid: number
  due: number
}

export interface Forecast {
  contract: number
  spent: number
  /** Остаток планов, который ещё предстоит потратить. */
  planLeft: number
  /** Договор минус факт минус остаток плана. */
  net: number
  parts: ForecastPart[]
}

/**
 * Что участники получат со всего договора, если планы исполнятся.
 * Считается по факту расходов плюс неизрасходованный остаток планов —
 * это ответ на вопрос «сколько выйдет в итоге».
 */
export function objectForecast(state: PlanState, obj: Obj, shares: Share[]): Forecast {
  const stageIds = new Set(stagesOf(state.stages, obj.id).map(s => s.id))

  let spent = 0
  const paid = new Map<string, number>()
  for (const op of state.ops) {
    if (!stageIds.has(op.stageId) || op.status !== 'ok') continue
    if (op.kind === 'exp') spent += base(op)
    if (op.kind === 'adv' && op.personId) paid.set(op.personId, (paid.get(op.personId) ?? 0) + base(op))
  }

  const planLeft = objectTeams(state, obj.id).reduce((a, r) => a + r.left, 0)
  const net = obj.contractAmount - spent - planLeft

  const parts = splitShares(net, shares).map(p => ({
    ...p,
    paid: paid.get(p.personId) ?? 0,
    due: p.amount - (paid.get(p.personId) ?? 0),
  }))

  return { contract: obj.contractAmount, spent, planLeft, net, parts }
}

export interface StageProgress {
  /** Получено от заказчика: 0…1. */
  received: number
  /** Выплачено участникам от начисленного: 0…1. */
  settled: number
  /** Общее закрытие этапа: 0…1. */
  overall: number
  done: boolean
}

/**
 * Закрытие этапа. Этап доведён до конца, когда заказчик рассчитался
 * и деньги разошлись: дебиторка ноль и касса ноль.
 */
export function stageProgress(
  stage: Stage,
  totals: { inc: number; cash: number; debt: number; parts: Array<{ amount: number; paid: number }> },
): StageProgress {
  const accrued = totals.parts.reduce((a, p) => a + p.amount, 0)
  const paid = totals.parts.reduce((a, p) => a + p.paid, 0)

  const received = stage.amount > 0 ? clamp(totals.inc / stage.amount) : 0
  const settled = accrued > 0 ? clamp(paid / accrued) : (totals.inc > 0 ? 1 : 0)

  const whole = stage.amount + Math.max(0, accrued)
  const overall = whole > 0 ? clamp((totals.inc + paid) / whole) : 0

  return {
    received,
    settled,
    overall,
    done: totals.debt === 0 && totals.cash === 0 && stage.amount > 0,
  }
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/* ---------- человек: по каким объектам он работает и когда его платёж ---------- */

export interface PersonRow {
  objectId: string
  objectName: string
  /** Причитается: план его команды на объект либо начисленная доля. */
  expected: number
  /** Уже получено на руки. */
  paid: number
  /** Ещё не получено. */
  left: number
  /** Обещано с названным сроком. */
  promised: number
  /** Ближайший названный срок. */
  dueDate: string | null
  /** Номер этапа, из которого пойдут следующие деньги. */
  stageNumber: number | null
  /** Сумма назначена лично ему, а не всей команде. */
  personal: boolean
}

export interface PersonPlan {
  /** Чем меряем: планом команды или долей в договоре. */
  basis: 'team' | 'share'
  teamId: string | null
  teamName: string
  /** Сколько человек в команде: план общий на всех. */
  teamSize: number
  /** Везде, где есть сумма, она назначена лично ему. */
  personal: boolean
  expected: number
  paid: number
  left: number
  /** Ближайший платёж: срок, сумма и откуда. */
  next: { dueDate: string | null; amount: number; objectName: string; stageNumber: number | null } | null
  rows: PersonRow[]
}

type PersonState = PlanState & Pick<AppState, 'objects' | 'settings' | 'sharesByVersion'>

/**
 * Карточка человека в деньгах: в каких объектах он занят, сколько получил,
 * сколько ещё нет и когда ждать следующий платёж.
 *
 * Срок берётся из обещанного платежа, если он назван. Если нет —
 * из ближайшего незакрытого этапа, где команде ещё выделены деньги:
 * точной даты у этапа нет, но понятно, чего ждать.
 */
export function personPlan(state: PersonState, personId: string): PersonPlan {
  const person = state.settings.people.find(p => p.id === personId)
  const teamId = person?.teamId ?? null
  const basis: PersonPlan['basis'] = person?.isSharer ? 'share' : 'team'
  // Дольщик получает авансами в счёт доли, человек команды — расходами объекта.
  const payment = (op: { kind: string }) => (basis === 'share' ? op.kind === 'adv' : op.kind === 'exp')
  const rows: PersonRow[] = []

  for (const obj of state.objects) {
    const stages = stagesOf(state.stages, obj.id)
    const stageIds = new Set(stages.map(s => s.id))

    let paid = 0
    let promised = 0
    let dueDate: string | null = null
    for (const op of state.ops) {
      if (op.personId !== personId || !stageIds.has(op.stageId) || !payment(op)) continue
      if (op.status === 'ok') paid += base(op)
      else if (op.status === 'promised') {
        promised += base(op)
        if (op.dueDate && (!dueDate || op.dueDate < dueDate)) dueDate = op.dueDate
      }
    }

    // Причитается и с какого этапа ждать денег.
    let expected = 0
    let stageNumber: number | null = null
    let personal = basis === 'share'
    if (basis === 'share') {
      const shares = sharesFor(state, obj)
      for (const stage of stages) {
        const part = calcStage(stage, state.ops, shares).parts.find(p => p.personId === personId)
        if (!part) continue
        expected += part.amount
        if (stageNumber === null && stage.status !== 'closed' && part.due > 0) stageNumber = stage.number
      }
    } else if (teamId) {
      // Своя сумма внутри команды важнее общей: она и есть его деньги.
      const own = state.budgets.find(
        b => b.objectId === obj.id && b.teamId === teamId && b.personId === personId,
      )
      personal = !!own
      expected = own ? own.amount : (objectTeams(state, obj.id).find(r => r.teamId === teamId)?.planned ?? 0)
      for (const stage of stages) {
        if (stage.status === 'closed') continue
        const row = stageTeams(state, stage.id).find(r => r.teamId === teamId)
        if (row && row.left > 0) { stageNumber = stage.number; break }
      }
    }

    if (!expected && !paid && !promised) continue
    rows.push({
      objectId: obj.id,
      objectName: obj.name,
      expected,
      paid,
      left: Math.max(0, expected - paid),
      promised,
      dueDate,
      stageNumber,
      personal,
    })
  }

  const sum = (pick: 'expected' | 'paid' | 'left') => rows.reduce((a, r) => a + r[pick], 0)

  // Ближайший платёж: сперва названный срок, иначе ближайший незакрытый этап.
  const dated = rows.filter(r => r.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
  const staged = rows.find(r => r.stageNumber !== null && r.left > 0)
  const owed = rows.find(r => r.left > 0)
  const source = dated ?? staged ?? owed ?? null

  return {
    basis,
    teamId,
    teamName: teamId ? teamName(state, teamId) : '',
    teamSize: teamId ? state.settings.people.filter(p => p.teamId === teamId).length : 0,
    personal: rows.every(r => r.personal || !r.expected),
    expected: sum('expected'),
    paid: sum('paid'),
    left: sum('left'),
    next: source
      ? {
          dueDate: source.dueDate,
          amount: source.promised || source.left,
          objectName: source.objectName,
          stageNumber: source.stageNumber,
        }
      : null,
    rows,
  }
}
