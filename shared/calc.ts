/**
 * Расчётное ядро. Чистые функции без обращений к сети и БД —
 * один и тот же код считает на сервере (при записи и закрытии этапа)
 * и на клиенте (мгновенный пересчёт экрана).
 *
 * Деньги везде — целое число центов. Дробных типов для денег нет.
 * У операции две суммы: amount в валюте операции и amountBase
 * в валюте объекта; в расчёт всегда идёт amountBase.
 */

import type { Me, Role } from './roles.ts'
import type { Allocation, Budget, Team } from './plan.ts'

export type Kind = 'in' | 'exp' | 'adv'
/** обещано — договорились, но деньги не выданы; в кассу не входит. */
export type OpStatus = 'ok' | 'void' | 'promised'
export type StageStatus = 'draft' | 'work' | 'check' | 'closed'
export type BasisType = 'договор' | 'расписка' | 'устно'

export const KIND_NAME: Record<Kind, string> = {
  in: 'Приход',
  exp: 'Расход объекта',
  adv: 'Аванс участнику',
}
export const STAGE_NAME: Record<StageStatus, string> = {
  draft: 'черновик',
  work: 'в работе',
  check: 'сверка',
  closed: 'закрыт',
}
export const OP_STATUS_NAME: Record<OpStatus, string> = {
  ok: 'проведено',
  void: 'отменено',
  promised: 'обещано',
}
export const BONUS_CAT = 'bonus'
export const MAX_BONUS_RATE = 40
/** За сколько дней до срока обязательства напоминать. */
export const REMIND_DAYS = 3

export interface Person {
  id: string
  name: string
  role: string
  phone: string
  /** Команда, в которой человек работает: архитекторы, дизайнеры, конструкторы, инженеры. */
  teamId: string | null
  isSharer: boolean
  /** Снят с учёта: в справочниках его нет, в истории имя остаётся. */
  archived?: boolean
}

/** Клиент из CRM: с ним заключают договоры на объекты. */
export interface Client {
  id: string
  name: string
  phone: string
  phone2: string
  email: string
  /** Откуда пришёл: рекомендация, инстаграм, выставка, повторный… */
  source: string
  note: string
  createdAt: string
  archived: boolean
}

export const CLIENT_SOURCES = [
  'рекомендация',
  'повторный',
  'инстаграм',
  'сайт',
  'выставка',
  'прочее',
] as const
export interface Share { personId: string; percent: number }
export interface Category {
  id: string
  name: string
  /** Работы этой команды: категория видна, когда выбрана она. */
  teamId: string | null
  /** Группа расходов не по объекту: офис, личное, транспорт. */
  group: string | null
  system: boolean
  archived: boolean
}

/** Группы расходов не по объекту — собираются из самих категорий. */
export function categoryGroups(categories: Category[]): string[] {
  return [...new Set(categories.filter(c => c.group).map(c => c.group!))].sort((a, b) => a.localeCompare(b, 'ru'))
}

/**
 * Что предложить в «категории»: у прямого расхода — работы выбранной
 * команды и общие по объекту, у расхода не по объекту — категории группы.
 */
export function categoriesFor(
  categories: Category[],
  scope: { teamId?: string | null; group?: string | null; offObject?: boolean },
): Category[] {
  const usable = categories.filter(c => !c.system && !c.archived)
  if (scope.offObject) return usable.filter(c => !!c.group && (!scope.group || c.group === scope.group))
  return usable.filter(c => !c.group && (!c.teamId || c.teamId === scope.teamId))
}
export interface ScaleRow { from: number; to: number | null; rate: number }

export interface Settings {
  currency: string
  people: Person[]
  categories: Category[]
  /** Действующая версия набора долей. */
  shares: Share[]
  sharesVersion: number
  /** Действующая версия шкалы. */
  bonusScale: ScaleRow[]
  scaleVersion: number
  /** Справочный курс для показа сумм: сколько сумов за доллар. */
  displayRate: number
}

export interface Obj {
  id: string
  name: string
  /** Имя заказчика для показа; связь с карточкой — clientId. */
  customer: string
  clientId: string | null
  address: string
  contractAmount: number
  currency: string
  /** Курс объекта: сколько сумов за доллар. Ноль — не задан. */
  rate: number
  basisType: BasisType
  basisNote: string
  bonusPersonId: string | null
  bonusRate: number
  /** Версии справочников, замороженные в объекте при создании. */
  sharesVersion: number
  scaleVersion: number
  status: 'work' | 'closed'
}

export interface Stage {
  id: string
  objectId: string
  number: number
  name: string
  amount: number
  status: StageStatus
  closedAt: string | null
}

export interface Op {
  id: string
  stageId: string
  objectId: string
  date: string
  kind: Kind
  /** Сумма в валюте операции. */
  amount: number
  currency: string
  /** Курс к валюте объекта на дату операции. */
  rate: number
  /** Сумма в валюте объекта — то, чем считают. */
  amountBase: number
  personId: string | null
  categoryId: string | null
  /** Команда, которая израсходовала деньги объекта. */
  teamId: string | null
  /** Расход не по объекту: по сути аванс участнику с понятным назначением. */
  offObject: boolean
  note: string
  status: OpStatus
  dueDate: string | null
  isAuto: boolean
  parentId: string | null
  reversesId: string | null
  createdAt: string
  createdBy: string | null
  reason: string
}

export interface Attachment {
  id: string
  kind: 'договор' | 'расписка' | 'чек' | 'фото' | 'прочее'
  objectId: string | null
  operationId: string | null
  filename: string
  mime: string
  size: number
  createdAt: string
}

export interface AppState {
  me: Me | null
  settings: Settings
  /** Снятые с учёта люди и категории — только чтобы история не теряла имена. */
  archived: { people: Person[]; categories: Category[] }
  clients: Client[]
  teams: Team[]
  budgets: Budget[]
  allocations: Allocation[]
  /** Наборы долей по версиям: объект считается своей замороженной версией. */
  sharesByVersion: Record<string, Share[]>
  objects: Obj[]
  stages: Stage[]
  ops: Op[]
  attachments: Attachment[]
  users: Array<{ id: string; login: string; name: string; role: Role; personId: string | null; objectIds: string[] }>
  /**
   * Показатели этапов считает сервер — он же и урезает их по роли.
   * Прораб получает только кассу и свои расходы: по его данным
   * доход на объекте не восстанавливается.
   */
  totals: Record<string, StageTotals>
}

/** Сообщение с подстановками: интерфейс покажет его на своём языке. */
export interface Note {
  text: string
  params?: Record<string, string | number>
}

export interface SharePart {
  personId: string
  percent: number
  amount: number
  paid: number
  due: number
}

export interface StageTotals {
  inc: number
  exp: number
  adv: number
  bonus: number
  net: number
  cash: number
  debt: number
  usage: number
  /** Обязательства: обещано, но не выдано. В кассу не входит. */
  promised: number
  parts: SharePart[]
  dueTotal: number
}

/* ---------- деньги ---------- */

export function money(cents: number): string {
  return (cents / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function money0(cents: number): string {
  return Math.round(cents / 100).toLocaleString('ru-RU')
}

/* ---------- валюты показа ---------- */

/** Валюты, между которыми работает переключатель показа. */
export const CURRENCIES = ['USD', 'UZS'] as const
export type CurrencyCode = (typeof CURRENCIES)[number] | string

/** Сколько знаков после запятой показывать: в сумах тийины не ходят. */
const DECIMALS: Record<string, number> = { UZS: 0 }

/** Подпись валюты на экране: код UZS люди читают как «сум». */
const LABELS: Record<string, string> = { UZS: 'SUM' }

export const decimalsOf = (code: string) => DECIMALS[code] ?? 2
export const currencyLabel = (code: string) => LABELS[code] ?? code

/** Валюта значком: доллар и наличные сумы. */
export const currencyIcon = (code: string) =>
  (code.toUpperCase() === 'USD' ? 'ph:currency-dollar' : 'ph:money')

/**
 * Перевод суммы в валюту объекта по курсу «сумов за доллар».
 * Курс один на объект, поэтому направление задаёт валюта объекта.
 */
export function toObjectCurrency(cents: number, from: string, objCurrency: string, sumPerUsd: number): number {
  const a = from.toUpperCase()
  const b = objCurrency.toUpperCase()
  if (a === b || !sumPerUsd) return cents
  if (a === 'UZS' && b === 'USD') return Math.round(cents / sumPerUsd)
  if (a === 'USD' && b === 'UZS') return Math.round(cents * sumPerUsd)
  return cents
}

/** Та же сумма в другой валюте — для подписи «≈ столько-то». */
export function otherCurrency(objCurrency: string): string {
  return objCurrency.toUpperCase() === 'USD' ? 'UZS' : 'USD'
}

/** Курс показа по умолчанию: сколько сумов за доллар. */
export const DEFAULT_DISPLAY_RATE = 12_000

/**
 * Пересчёт для показа. Хранение не трогает — это справочная величина,
 * учёт по-прежнему ведётся в валюте объекта.
 */
export function convertCents(cents: number, from: string, to: string, sumPerUsd: number): number {
  if (from === to || !sumPerUsd) return cents
  if (from === 'USD' && to === 'UZS') return Math.round(cents * sumPerUsd)
  if (from === 'UZS' && to === 'USD') return Math.round(cents / sumPerUsd)
  return cents
}

/** Сумма в центах → строка с разрядами и нужным числом знаков. */
export function formatMoney(cents: number, code: string, whole = false): string {
  const digits = whole ? 0 : decimalsOf(code)
  return (cents / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Доля 0…1 как процент в русской записи: 14,2 %. */
export function percent(share: number, digits = 0): string {
  const value = (share * 100).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${value} %`
}

/** Строка от пользователя → центы. null, если это не сумма. */
export function parseMoney(v: unknown): number | null {
  const s = String(v ?? '').replace(/[\s ]/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(parseFloat(s) * 100)
}

export function parseRate(v: unknown): number | null {
  const s = String(v ?? '').replace(/[\s %]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,8})?$/.test(s)) return null
  return parseFloat(s)
}

/** Сумма в валюте объекта по курсу на дату операции. */
export function toBase(amount: number, rate: number): number {
  return Math.round(amount * rate)
}

export function dmy(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Сегодня в Asia/Tashkent: дата операции не зависит от часового пояса браузера. */
export function today(): string {
  return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 864e5)
}

/* ---------- доли ---------- */

/**
 * Доли считаются в центах с округлением вниз; остаток от деления
 * целиком уходит в наибольшую долю (75 %). Сумма долей всегда точно
 * равна чистой доле — расхождения в один цент не существует.
 */
export function splitShares(net: number, shares: Share[]): Array<{ personId: string; percent: number; amount: number }> {
  const parts = (shares ?? []).map(s => ({
    personId: s.personId,
    percent: Number(s.percent),
    amount: Math.floor((net * Number(s.percent)) / 100),
  }))
  if (!parts.length) return parts
  const rest = net - parts.reduce((a, p) => a + p.amount, 0)
  const top = parts.reduce((a, b) => (b.percent > a.percent ? b : a), parts[0]!)
  top.amount += rest
  return parts
}

/** Бонус с одного прихода по ставке, зафиксированной в объекте. */
export function bonusOf(income: number, rate: number): number {
  return Math.round((income * Number(rate)) / 100)
}

/* ---------- этап и объект ---------- */

const base = (o: Op) => o.amountBase ?? o.amount

export function stageOps(ops: Op[], stageId: string): Op[] {
  return ops.filter(o => o.stageId === stageId)
}

export function calcStage(stage: Stage, ops: Op[], shares: Share[]): StageTotals {
  const all = stageOps(ops, stage.id)
  const live = all.filter(o => o.status === 'ok')
  const sum = (k: Kind) => live.reduce((a, o) => a + (o.kind === k ? base(o) : 0), 0)
  const inc = sum('in')
  const exp = sum('exp')
  const adv = sum('adv')
  const net = stage.amount - exp

  const parts: SharePart[] = splitShares(net, shares).map(p => {
    const paid = live.reduce((a, o) => a + (o.kind === 'adv' && o.personId === p.personId ? base(o) : 0), 0)
    return { ...p, paid, due: p.amount - paid }
  })

  return {
    inc,
    exp,
    adv,
    bonus: live.reduce((a, o) => a + (o.isAuto ? base(o) : 0), 0),
    net,
    cash: inc - exp - adv,
    debt: stage.amount - inc,
    usage: inc > 0 ? (exp + adv) / inc : 0,
    promised: all.reduce((a, o) => a + (o.status === 'promised' ? base(o) : 0), 0),
    parts,
    dueTotal: parts.reduce((a, p) => a + p.due, 0),
  }
}

export function stagesOf(stages: Stage[], objectId: string): Stage[] {
  return stages.filter(s => s.objectId === objectId).sort((a, b) => a.number - b.number)
}

/** Доли той версии, что заморожена в объекте. */
export function sharesFor(state: Pick<AppState, 'settings' | 'sharesByVersion'>, obj: Obj | null): Share[] {
  if (!obj) return state.settings.shares
  return state.sharesByVersion[String(obj.sharesVersion)] ?? state.settings.shares
}

export const EMPTY_TOTALS: StageTotals = {
  inc: 0, exp: 0, adv: 0, bonus: 0, net: 0, cash: 0, debt: 0,
  usage: 0, promised: 0, parts: [], dueTotal: 0,
}

/** Показатели этапа — из того, что прислал сервер с учётом роли. */
export function totalsOf(state: Pick<AppState, 'totals'>, stageId: string): StageTotals {
  return state.totals?.[stageId] ?? EMPTY_TOTALS
}

/** Сводка по объекту — сумма его этапов, уже урезанных по роли. */
export function objectTotals(state: Pick<AppState, 'totals' | 'stages'>, objectId: string) {
  const list = stagesOf(state.stages, objectId)
  const t = { inc: 0, exp: 0, adv: 0, cash: 0, debt: 0, planned: 0, promised: 0, usage: 0, stages: list }
  for (const st of list) {
    const c = totalsOf(state, st.id)
    t.inc += c.inc
    t.exp += c.exp
    t.adv += c.adv
    t.cash += c.cash
    t.debt += c.debt
    t.planned += st.amount
    t.promised += c.promised
  }
  t.usage = t.inc > 0 ? (t.exp + t.adv) / t.inc : 0
  return t
}

export function calcObject(obj: Obj, stages: Stage[], ops: Op[], shares: Share[]) {
  const list = stagesOf(stages, obj.id)
  const t = { inc: 0, exp: 0, adv: 0, cash: 0, debt: 0, planned: 0, promised: 0, usage: 0, stages: list }
  for (const st of list) {
    const c = calcStage(st, ops, shares)
    t.inc += c.inc
    t.exp += c.exp
    t.adv += c.adv
    t.cash += c.cash
    t.debt += c.debt
    t.planned += st.amount
    t.promised += c.promised
  }
  t.usage = t.inc > 0 ? (t.exp + t.adv) / t.inc : 0
  return t
}

/**
 * Контроль закрытия этапа: сумма этапа = расходы + три доли,
 * при этом заказчик рассчитался и касса этапа пуста.
 * Возвращает список расхождений — пустой, если этап можно закрыть.
 */
export function closingProblems(stage: Stage, totals: StageTotals): Note[] {
  const out: Note[] = []
  const identity = stage.amount - (totals.exp + totals.parts.reduce((a, p) => a + p.amount, 0))
  if (identity !== 0) out.push({ text: 'Равенство закрытия не сходится на {amount}.', params: { amount: money(identity) } })
  if (totals.debt !== 0) out.push({ text: 'Заказчик ещё должен {amount}.', params: { amount: money(totals.debt) } })
  if (totals.cash !== 0) {
    out.push({
      text: 'В кассе этапа {amount} — к доплате участникам {due}.',
      params: { amount: money(totals.cash), due: money(totals.dueTotal) },
    })
  }
  if (totals.promised !== 0) out.push({ text: 'Не закрыто обязательств на {amount}.', params: { amount: money(totals.promised) } })
  return out
}

/* ---------- обязательства ---------- */

export interface Obligation {
  op: Op
  objectName: string
  stageNumber: number
  daysLeft: number | null
  overdue: boolean
  soon: boolean
}

/** Предстоящие выплаты: всё, о чём договорились, но не выдали. */
export function obligations(state: Pick<AppState, 'ops' | 'objects' | 'stages'>, from = today()): Obligation[] {
  return state.ops
    .filter(o => o.status === 'promised')
    .map((op) => {
      const daysLeft = op.dueDate ? daysBetween(from, op.dueDate) : null
      return {
        op,
        objectName: state.objects.find(o => o.id === op.objectId)?.name ?? '',
        stageNumber: state.stages.find(s => s.id === op.stageId)?.number ?? 0,
        daysLeft,
        overdue: daysLeft != null && daysLeft < 0,
        soon: daysLeft != null && daysLeft >= 0 && daysLeft <= REMIND_DAYS,
      }
    })
    .sort((a, b) => (a.op.dueDate ?? '9999').localeCompare(b.op.dueDate ?? '9999'))
}

/* ---------- отчёты ---------- */

export interface CategoryRow { categoryId: string; name: string; amount: number; count: number; share: number }

/** Расходы по категориям за период, по одному объекту или по всем. */
export function categoryReport(
  state: Pick<AppState, 'ops' | 'settings'> & Partial<Pick<AppState, 'archived'>>,
  filter: { objectId?: string; from?: string; to?: string } = {},
): { rows: CategoryRow[]; total: number; bonus: number } {
  const picked = state.ops.filter(o =>
    o.kind === 'exp'
    && o.status === 'ok'
    && (!filter.objectId || o.objectId === filter.objectId)
    && (!filter.from || o.date >= filter.from)
    && (!filter.to || o.date <= filter.to))

  const bucket = new Map<string, CategoryRow>()
  for (const op of picked) {
    const id = op.categoryId ?? 'oth'
    const row = bucket.get(id) ?? {
      categoryId: id,
      name: (state.settings.categories.find(c => c.id === id)
        ?? state.archived?.categories.find(c => c.id === id))?.name ?? 'Прочее',
      amount: 0,
      count: 0,
      share: 0,
    }
    row.amount += base(op)
    row.count += 1
    bucket.set(id, row)
  }

  const total = [...bucket.values()].reduce((a, r) => a + r.amount, 0)
  const rows = [...bucket.values()].sort((a, b) => b.amount - a.amount)
  for (const r of rows) r.share = total > 0 ? r.amount / total : 0

  return { rows, total, bonus: bucket.get(BONUS_CAT)?.amount ?? 0 }
}

export interface PersonObjectRow {
  objectId: string
  objectName: string
  bonuses: number
  advances: number
  accrued: number
  due: number
  payouts: number
}

export interface PersonSummary {
  bonuses: number
  advances: number
  accrued: number
  due: number
  payouts: number
  rows: PersonObjectRow[]
}

/** Карточка человека: все объекты, где он встречается, и суммы по типам. */
export function personSummary(state: Pick<AppState, 'ops' | 'objects' | 'stages' | 'settings' | 'sharesByVersion'>, personId: string): PersonSummary {
  const rows: PersonObjectRow[] = []

  for (const obj of state.objects) {
    const shares = sharesFor(state, obj)
    const row: PersonObjectRow = {
      objectId: obj.id,
      objectName: obj.name,
      bonuses: 0,
      advances: 0,
      accrued: 0,
      due: 0,
      payouts: 0,
    }

    for (const op of state.ops) {
      if (op.objectId !== obj.id || op.status !== 'ok' || op.personId !== personId) continue
      if (op.isAuto) row.bonuses += base(op)
      else if (op.kind === 'adv') row.advances += base(op)
      else if (op.kind === 'exp') row.payouts += base(op)
    }

    for (const stage of stagesOf(state.stages, obj.id)) {
      const part = calcStage(stage, state.ops, shares).parts.find(p => p.personId === personId)
      if (part) {
        row.accrued += part.amount
        row.due += part.due
      }
    }

    if (row.bonuses || row.advances || row.accrued || row.payouts) rows.push(row)
  }

  const total = (pick: keyof PersonObjectRow) => rows.reduce((a, r) => a + (r[pick] as number), 0)
  return {
    bonuses: total('bonuses'),
    advances: total('advances'),
    accrued: total('accrued'),
    due: total('due'),
    payouts: total('payouts'),
    rows,
  }
}

/** Авансы, выданные участнику внутри этапа — строки для акта сверки. */
export function advancesOf(ops: Op[], stageId: string, personId: string): Op[] {
  return stageOps(ops, stageId)
    .filter(o => o.kind === 'adv' && o.status === 'ok' && o.personId === personId)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/* ---------- справочники ---------- */

export function rateFor(scale: ScaleRow[], contractAmount: number): number {
  const row = (scale ?? []).find(r => contractAmount >= r.from && (r.to == null || contractAmount < r.to))
  return row ? row.rate : 0
}

/** Проверки справочника. Пустой массив — можно сохранять. */
export function settingsProblems(s: Pick<Settings, 'shares' | 'bonusScale'>): Note[] {
  const out: Note[] = []
  const sum = (s.shares ?? []).reduce((a, x) => a + Number(x.percent), 0)
  if (s.shares?.length && Math.abs(sum - 100) > 1e-9) {
    out.push({ text: 'Сумма долей {sum} % — должно быть ровно 100.', params: { sum } })
  }
  if (s.shares?.some(x => !x.personId)) out.push({ text: 'В долях есть строка без участника.' })
  if (s.bonusScale?.some(r => r.rate > MAX_BONUS_RATE)) {
    out.push({ text: 'Ставка бонуса выше {max} % не сохраняется.', params: { max: MAX_BONUS_RATE } })
  }
  if (s.bonusScale?.some(r => r.to != null && r.to <= r.from)) {
    out.push({ text: 'В шкале есть диапазон с верхней границей ниже нижней.' })
  }

  const scale = [...(s.bonusScale ?? [])].sort((a, b) => a.from - b.from)
  for (let i = 1; i < scale.length; i++) {
    if (scale[i - 1]!.to == null || scale[i - 1]!.to !== scale[i]!.from) {
      out.push({ text: 'Диапазоны шкалы пересекаются или имеют разрыв.' })
      break
    }
  }
  return out
}

/** Предупреждения при вводе операции: не запрещают, но требуют подтверждения. */
export function operationWarnings(
  draft: { kind: Kind; amountBase: number; date: string; personId: string | null },
  stage: Stage,
  ops: Op[],
  totals: StageTotals,
): Note[] {
  const out: Note[] = []
  if (draft.kind === 'adv') {
    const part = totals.parts.find(p => p.personId === draft.personId)
    if (part && draft.amountBase > part.due) {
      out.push({
        text: 'Аванс {amount} больше, чем причитается участнику ({due}).',
        params: { amount: money(draft.amountBase), due: money(part.due) },
      })
    }
  }
  if (draft.kind === 'exp' && totals.inc === 0) {
    out.push({ text: 'У этапа ещё нет ни одного прихода.' })
  }
  if (
    draft.personId
    && stageOps(ops, stage.id).some(
      o => o.status === 'ok' && o.date === draft.date && base(o) === draft.amountBase && o.personId === draft.personId,
    )
  ) {
    out.push({ text: 'Такая же сумма этому человеку за эту дату уже есть — не дубль?' })
  }
  if (daysBetween(draft.date, today()) > 30) {
    out.push({ text: 'Дата операции старше 30 дней.' })
  }
  const after = totals.inc > 0 ? (totals.exp + totals.adv + draft.amountBase) / totals.inc : 0
  if (draft.kind !== 'in' && after > 0.8) {
    out.push({ text: 'После этой записи освоено {percent} поступивших денег.', params: { percent: percent(after) } })
  }
  return out
}

/* ---------- сводная аналитика за период по всем объектам ---------- */

export interface PeriodRow {
  id: string
  name: string
  inc: number
  exp: number
  adv: number
  /** Приход минус расход минус аванс — движение денег за период. */
  flow: number
}

export interface PeriodMonth {
  /** ГГГГ-ММ. */
  month: string
  inc: number
  out: number
}

export interface PeriodReport {
  from: string
  to: string
  /** Валюта, в которую всё сведено. */
  currency: string
  inc: number
  exp: number
  adv: number
  bonus: number
  flow: number
  /** Сколько операций легло в отчёт. */
  count: number
  objects: PeriodRow[]
  categories: PeriodRow[]
  teams: PeriodRow[]
  people: PeriodRow[]
  months: PeriodMonth[]
}

type PeriodState = Pick<AppState, 'ops' | 'objects' | 'settings' | 'teams'> & Partial<Pick<AppState, 'archived'>>

/**
 * Что происходило за период по всем объектам сразу — раздел 13 ТЗ, версия 3.
 *
 * Объекты бывают в разных валютах, поэтому всё сводится в основную валюту
 * справочников по курсу объекта (а если он не задан — по справочному).
 * Складывать доллары с сумами без пересчёта — самый простой способ
 * получить красивое и неверное число.
 */
export function periodReport(
  state: PeriodState,
  range: { from?: string; to?: string; objectId?: string } = {},
): PeriodReport {
  const main = (state.settings.currency || 'USD').toUpperCase()
  const fallback = Number(state.settings.displayRate) || 0
  const from = range.from || ''
  const to = range.to || ''

  const objects = new Map(state.objects.map(o => [o.id, o]))
  const add = (map: Map<string, PeriodRow>, id: string, name: string, kind: Kind, value: number) => {
    const row = map.get(id) ?? { id, name, inc: 0, exp: 0, adv: 0, flow: 0 }
    if (kind === 'in') { row.inc += value; row.flow += value }
    else if (kind === 'exp') { row.exp += value; row.flow -= value }
    else { row.adv += value; row.flow -= value }
    map.set(id, row)
    return row
  }

  const byObject = new Map<string, PeriodRow>()
  const byCategory = new Map<string, PeriodRow>()
  const byTeam = new Map<string, PeriodRow>()
  const byPerson = new Map<string, PeriodRow>()
  const byMonth = new Map<string, PeriodMonth>()

  let inc = 0
  let exp = 0
  let adv = 0
  let bonus = 0
  let count = 0

  for (const op of state.ops) {
    if (op.status !== 'ok') continue
    if (range.objectId && op.objectId !== range.objectId) continue
    if (from && op.date < from) continue
    if (to && op.date > to) continue

    const obj = objects.get(op.objectId)
    if (!obj) continue

    // Всё в одну валюту: иначе итог по разным объектам не имеет смысла.
    const value = toObjectCurrency(base(op), obj.currency, main, obj.rate || fallback)
    count++

    if (op.kind === 'in') inc += value
    else if (op.kind === 'exp') { exp += value; if (op.isAuto) bonus += value }
    else adv += value

    add(byObject, obj.id, obj.name, op.kind, value)

    if (op.kind === 'exp' || op.offObject) {
      const cat = state.settings.categories.find(c => c.id === op.categoryId)
        ?? state.archived?.categories.find(c => c.id === op.categoryId)
      add(byCategory, op.categoryId ?? '—', cat?.name ?? '—', op.kind, value)
    }
    if (op.teamId) {
      const team = state.teams.find(x => x.id === op.teamId)
      add(byTeam, op.teamId, team?.name ?? '—', op.kind, value)
    }
    if (op.personId && op.kind !== 'in') {
      const person = state.settings.people.find(p => p.id === op.personId)
        ?? state.archived?.people.find(p => p.id === op.personId)
      add(byPerson, op.personId, person?.name ?? '—', op.kind, value)
    }

    const month = op.date.slice(0, 7)
    const row = byMonth.get(month) ?? { month, inc: 0, out: 0 }
    if (op.kind === 'in') row.inc += value
    else row.out += value
    byMonth.set(month, row)
  }

  const byFlow = (a: PeriodRow, b: PeriodRow) => Math.abs(b.flow) - Math.abs(a.flow) || a.name.localeCompare(b.name, 'ru')
  const spent = (a: PeriodRow, b: PeriodRow) => b.exp + b.adv - (a.exp + a.adv) || a.name.localeCompare(b.name, 'ru')

  return {
    from,
    to,
    currency: main,
    inc,
    exp,
    adv,
    bonus,
    flow: inc - exp - adv,
    count,
    objects: [...byObject.values()].sort(byFlow),
    categories: [...byCategory.values()].sort(spent),
    teams: [...byTeam.values()].sort(spent),
    people: [...byPerson.values()].sort(spent),
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

/** Границы периода: месяц, квартал, год или всё время. */
export function periodRange(kind: 'month' | 'quarter' | 'year' | 'all', now = today()): { from: string; to: string } {
  if (kind === 'all') return { from: '', to: '' }
  const [y, m] = now.split('-').map(Number) as [number, number, number]
  const pad = (v: number) => String(v).padStart(2, '0')
  const last = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}` }
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` }

  const start = m - ((m - 1) % 3)
  const end = start + 2
  return { from: `${y}-${pad(start)}-01`, to: `${y}-${pad(end)}-${pad(last(y, end))}` }
}
