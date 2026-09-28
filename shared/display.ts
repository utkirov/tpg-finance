import { calcStage, convertCents, sharesFor, type AppState, type Obj, type Op, type StageTotals } from './calc.ts'

/**
 * Состояние в валюте экрана.
 *
 * Учёт ведётся в валюте объекта, а на экране суммы можно смотреть в долларах
 * или в сумах. Пересчитывать итог одним справочным курсом неверно: приход
 * марта и приход сентября пришли по разным курсам. Поэтому каждая операция
 * пересчитывается по своему курсу на свою дату (Op.fx), а итоги, доли и отчёты
 * считаются уже из пересчитанных строк — теми же функциями, что и в валюте учёта.
 *
 * Что пересчитывается курсом объекта (у него нет даты операции):
 * сумма договора, суммы этапов, планы команд и выделения на этапы.
 *
 * Результат — копия состояния; в базе ничего не меняется. Формы редактирования
 * работают с исходным состоянием, а не с этой копией.
 */

/** Курс «сумов за доллар» для пересчёта объекта: свой, иначе справочный. */
export function objectFx(obj: Pick<Obj, 'rate'>, fallback: number): number {
  return obj.rate > 0 ? obj.rate : fallback
}

/**
 * Сумма операции в валюте экрана.
 * Операция в той же валюте — ровно то, что ввели, без пересчёта туда-обратно.
 */
export function opIn(op: Op, cur: string, bookCurrency: string, fallbackFx: number): number {
  if (op.currency.toUpperCase() === cur) return op.amount
  if (bookCurrency.toUpperCase() === cur) return op.amountBase
  return convertCents(op.amountBase, bookCurrency.toUpperCase(), cur, op.fx > 0 ? op.fx : fallbackFx)
}

export function inCurrency(state: AppState, currency: string): AppState {
  const cur = currency.toUpperCase()
  const fallback = Number(state.settings.displayRate) || 0
  const objects = new Map(state.objects.map(o => [o.id, o]))
  const book = (objectId: string) => (objects.get(objectId)?.currency ?? state.settings.currency).toUpperCase()
  const byObject = (objectId: string, cents: number) => {
    const o = objects.get(objectId)
    return o ? convertCents(cents, o.currency.toUpperCase(), cur, objectFx(o, fallback)) : cents
  }
  const stageObject = new Map(state.stages.map(s => [s.id, s.objectId]))

  const fxOf = (objectId: string) => {
    const o = objects.get(objectId)
    return o ? objectFx(o, fallback) : fallback
  }
  const ops = state.ops.map(op => ({ ...op, amountBase: opIn(op, cur, book(op.objectId), fxOf(op.objectId)) }))
  const stages = state.stages.map(s => ({ ...s, amount: byObject(s.objectId, s.amount) }))
  const shown: AppState = {
    ...state,
    settings: { ...state.settings, currency: cur },
    objects: state.objects.map(o => ({
      ...o,
      bookCurrency: o.currency,
      currency: cur,
      contractAmount: byObject(o.id, o.contractAmount),
    })),
    stages,
    ops,
    budgets: state.budgets.map(b => ({ ...b, amount: byObject(b.objectId, b.amount) })),
    allocations: state.allocations.map(a => ({ ...a, amount: byObject(stageObject.get(a.stageId) ?? '', a.amount) })),
    totals: {},
  }

  // Показатели заново из пересчитанных строк: сумма пересчитанных — не то же,
  // что пересчитанная сумма, когда курсы у операций разные.
  // Строки раскладываются по этапам один раз: иначе каждый этап фильтровал бы всю ленту.
  const byStage = new Map<string, Op[]>()
  for (const op of ops) {
    const list = byStage.get(op.stageId)
    if (list) list.push(op)
    else byStage.set(op.stageId, [op])
  }
  const shownObjects = new Map(shown.objects.map(o => [o.id, o]))
  const totals: Record<string, StageTotals> = {}
  for (const stage of stages) {
    totals[stage.id] = calcStage(stage, byStage.get(stage.id) ?? [], sharesFor(shown, shownObjects.get(stage.objectId) ?? null))
  }
  shown.totals = totals
  return shown
}
