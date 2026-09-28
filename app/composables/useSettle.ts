import type { Note, Op } from '#shared/calc'

/**
 * «Выплата произведена»: обязательство становится проведённой записью.
 * Сервер может вернуть предупреждения (аванс сверх доли, освоение) —
 * тогда спрашиваем ещё раз и повторяем с force.
 */
export function useSettle() {
  const { send } = useFinance()
  const { ask, notice } = useAsk()
  const { t } = useT()
  const { m } = useMoney()
  const err = useErr()

  return async function settle(op: Op, label: string) {
    const go = await ask({
      title: t('Выплата произведена'),
      body: t('{label} — {amount}. Запись станет проведённой сегодняшней датой и уйдёт из обязательств.', {
        label,
        amount: m(op.amountBase),
      }),
    })
    if (!go) return
    try {
      const url = `/api/ops/${op.id}/settle`
      const res = await send<{ ok: boolean; warnings: Note[] }>(url, { method: 'POST', body: {} })
      if (res.ok) return
      const text = res.warnings.map(w => t(w.text, w.params)).join(' ')
      const again = await ask({ title: t('Проверьте'), body: `${text} ${t('Всё равно сохранить?')}` })
      if (again) await send(url, { method: 'POST', body: { force: true } })
    } catch (e) {
      await notice(t('Не получилось'), err(e))
    }
  }
}
