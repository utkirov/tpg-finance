import { CURRENCIES, currencyLabel, formatMoney } from '#shared/calc'

/**
 * Показ сумм. Всё, что берётся из useFinance().state, уже пересчитано в валюту
 * экрана по курсу каждой операции (shared/display.ts), поэтому здесь только формат.
 *
 * mb — сумма в явно названной валюте: для форм и исходных данных (useFinance().raw).
 */
export function useMoney() {
  const { settings } = useFinance()
  const shown = useShown()

  const code = computed(() => shown.value)
  const label = computed(() => currencyLabel(code.value))
  const rate = computed(() => Number(settings.value.displayRate) || 0)

  /** Сумма с копейками (в сумах — без них). */
  const m = (cents: number) => formatMoney(cents, code.value)
  /** Без дробной части — для крупных цифр вроде суммы договора. */
  const m0 = (cents: number) => formatMoney(cents, code.value, true)
  /** Сумма в своей валюте, без пересчёта. */
  const mb = (cents: number, currency: string) => formatMoney(cents, currency)

  return { m, m0, mb, shown, code, label, rate, CURRENCIES }
}
