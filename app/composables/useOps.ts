import { KIND_NAME, currencyLabel, dmy, formatMoney, type Op } from '#shared/calc'

/**
 * Операция на экране: подпись, пояснения и действия с ней.
 * Этап, обязательства и карточка человека показывают одни и те же строки —
 * подписи и подтверждения живут здесь, чтобы не расходиться.
 */
export function useOps() {
  const { personName, categoryName, teamName, objectById, stageById, can, send } = useFinance()
  const { ask, notice } = useAsk()
  const { t } = useT()
  const err = useErr()

  /** Валюта объекта операции: суммы хранятся в ней. */
  const currencyOf = (op: Op) => objectById(op.objectId)?.currency

  function label(op: Op): string {
    if (op.kind === 'in') return t('Приход от заказчика')
    if (op.kind === 'adv') {
      const who = personName(op.personId)
      return op.offObject ? `${t('Расход не по объекту')} · ${who}` : `${t('Аванс')} · ${who}`
    }
    if (op.isAuto) return `${t('Бонус')} · ${personName(op.personId)}`
    const team = op.teamId ? `${teamName(op.teamId)} · ` : ''
    return team + t(categoryName(op.categoryId)) + (op.personId ? ` · ${personName(op.personId)}` : '')
  }

  function notes(op: Op): string[] {
    const out: string[] = []
    if (op.isAuto && !op.reversesId) out.push(t('создано автоматически с прихода'))
    if (op.note) out.push(op.note)
    if (op.currency !== currencyOf(op)) {
      // Здесь показываем ровно то, что записали: сумму в валюте операции.
      out.push(t('{amount} {currency} по курсу {rate}', {
        amount: formatMoney(op.amount, op.currency),
        currency: currencyLabel(op.currency),
        rate: op.rate,
      }))
    }
    if (op.reversesId) out.push(t('сторно') + (op.reason ? `: ${op.reason}` : ''))
    else if (op.status === 'void') out.push(t('отменено') + (op.reason ? `: ${op.reason}` : ''))
    return out
  }

  /** Провести обязательство может роль, которая вносит такие операции, пока этап открыт. */
  function canSettle(op: Op): boolean {
    const status = stageById(op.stageId)?.status
    return can.value.write && can.value.kinds.includes(op.kind) && status !== 'check' && status !== 'closed'
  }

  /** «Выплачено»: обязательство становится проведённой операцией сегодняшней датой. */
  async function settle(op: Op, amount: string) {
    const go = await ask({
      title: t('Выплата произведена'),
      body: t('{label} — {amount}. Запись станет проведённой сегодняшней датой и уйдёт из обязательств.', {
        label: label(op),
        amount,
      }),
    })
    if (!go) return
    try {
      await send(`/api/ops/${op.id}/settle`, { method: 'POST', body: {} })
    } catch (e) {
      await notice(t('Не получилось'), err(e))
    }
  }

  /** Сторно: запись не удаляется, рядом появляется обратная. */
  async function reverse(op: Op, amount: string) {
    const reason = await ask({
      title: t('Сторнировать операцию'),
      body: t('{kind} {amount} от {date}. Запись не удаляется — создаётся обратная, обе видны в ленте.', {
        kind: t(KIND_NAME[op.kind]),
        amount,
        date: dmy(op.date),
      }),
      label: t('Причина'),
    })
    if (!reason) return
    try {
      await send(`/api/ops/${op.id}/void`, { method: 'POST', body: { reason } })
    } catch (e) {
      await notice(t('Не получилось'), err(e))
    }
  }

  return { label, notes, settle, reverse, currencyOf, canSettle }
}
