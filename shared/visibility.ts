import { EMPTY_TOTALS, type Op, type StageTotals } from './calc.ts'
import { abilities, type Role } from './roles.ts'

/**
 * Что роль видит в ленте и в показателях — раздел 3 ТЗ.
 *
 * Чистые функции: их вызывает проекция состояния на сервере,
 * а тесты проверяют главное правило — итог, отданный роли, равен
 * сумме строк, которые она видит. Иначе скрытое находится вычитанием.
 */

export interface Viewer {
  role: Role
  personId: string | null
}

/** Какие строки ленты роль вправе видеть. */
export function visibleOp(op: Op, viewer: Viewer): boolean {
  const ab = abilities(viewer.role)
  if (ab.seeBonus && ab.seeAllShares) return true
  if (op.isAuto) return false // строки бонуса
  if (!ab.seeContract) return op.kind === 'exp' // прораб: только расходы
  if (op.kind === 'adv') return !!viewer.personId && op.personId === viewer.personId // участник: свои авансы
  return true
}

const base = (o: Op) => o.amountBase ?? o.amount

/**
 * Урезание показателей этапа. Важно не «обнулить лишнее», а не отдать
 * слагаемых, по которым скрытое вычисляется вычитанием: расходы и авансы
 * считаются только по видимым строкам.
 *
 * Касса и чистая доля остаются общими — это деньги этапа, на них
 * держится доля участника. Сумму всех удержаний из них можно получить
 * (доля ÷ процент = чистая доля), но не разложить на бонус и чужие авансы.
 */
export function narrowTotals(full: StageTotals, visible: Op[], viewer: Viewer): StageTotals {
  const ab = abilities(viewer.role)
  if (ab.seeBonus && ab.seeAllShares) return full

  const sum = (pick: (o: Op) => boolean) => visible.reduce((a, o) => a + (pick(o) ? base(o) : 0), 0)
  const exp = sum(o => o.status === 'ok' && o.kind === 'exp')
  const promised = sum(o => o.status === 'promised')

  // Прораб: касса объекта и расходы, которые он и так видит построчно.
  if (!ab.seeContract) return { ...EMPTY_TOTALS, cash: full.cash, exp, promised }

  const adv = sum(o => o.status === 'ok' && o.kind === 'adv')
  const own = ab.seeOwnShare ? full.parts.filter(p => p.personId === viewer.personId) : []
  return {
    ...full,
    exp,
    adv,
    bonus: 0,
    promised,
    usage: full.inc > 0 ? (exp + adv) / full.inc : 0,
    parts: own,
    dueTotal: own.reduce((a, p) => a + p.due, 0),
  }
}
