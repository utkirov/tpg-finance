import { EMPTY_TOTALS, type Op, type StageTotals } from './calc.ts'
import { abilities, type Role } from './roles.ts'

/**
 * Что роль вправе видеть из ленты и показателей — раздел 3 ТЗ.
 * Чистые функции: сервер режет по ним ответ, тесты проверяют их без базы.
 */

export interface Viewer { role: Role; personId: string | null }

/** Какие строки ленты роль вправе видеть. */
export function visibleOp(op: Op, user: Viewer): boolean {
  const ab = abilities(user.role)
  if (ab.seeBonus && ab.seeAllShares) return true
  if (op.isAuto) return false                       // строки бонуса
  if (!ab.seeContract) return op.kind === 'exp'     // прораб: только расходы
  if (op.kind === 'adv') return op.personId === user.personId // участник: свои авансы
  return true
}

/**
 * Урезание показателей. Важно не «обнулить лишнее», а не отдать слагаемых,
 * по которым скрытое вычисляется вычитанием.
 *
 * visible — строки этапа, которые роль и так видит (см. visibleOp).
 */
export function narrowTotals(full: StageTotals, visible: Op[], user: Viewer): StageTotals {
  const ab = abilities(user.role)
  if (ab.seeBonus && ab.seeAllShares) return full

  const sum = (pick: (o: Op) => boolean) =>
    visible.reduce((a, o) => a + (pick(o) ? (o.amountBase ?? o.amount) : 0), 0)

  // Прораб: касса объекта и сумма расходов, которые он и так видит построчно.
  if (!ab.seeContract) {
    return {
      ...EMPTY_TOTALS,
      cash: full.cash,
      exp: sum(o => o.status === 'ok'),
      promised: sum(o => o.status === 'promised'),
    }
  }

  // Участник: без бонуса, чужих долей и чужих авансов.
  const mine = ab.seeOwnShare ? full.parts.filter(p => p.personId === user.personId) : []
  return {
    ...full,
    bonus: 0,
    adv: sum(o => o.status === 'ok' && o.kind === 'adv'),
    promised: sum(o => o.status === 'promised'),
    parts: mine,
    dueTotal: mine.reduce((a, p) => a + p.due, 0),
  }
}
