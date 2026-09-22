import { CURRENCIES, convertCents, currencyLabel, formatMoney, type CurrencyCode } from '#shared/calc'

/**
 * Показ сумм. Учёт ведётся в валюте объекта, а на экране их можно
 * посмотреть в долларах или в сумах по справочному курсу из справочников.
 *
 * Пересчёт только для глаз: в базе ничего не меняется, курс операции
 * (раздел 12 ТЗ) — отдельная величина и вводится руками.
 */
export function useMoney(source?: () => string | undefined) {
  const { settings } = useFinance()

  const shown = useCookie<CurrencyCode>('money', {
    default: () => 'USD',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 86400,
  })

  /** Валюта, в которой лежит сумма: валюта объекта, иначе основная. */
  const from = computed(() => source?.() || settings.value.currency || 'USD')
  const rate = computed(() => Number(settings.value.displayRate) || 0)
  const code = computed(() => shown.value)
  const label = computed(() => currencyLabel(code.value))
  /** Показ отличается от того, в чём ведётся учёт — об этом честно говорим. */
  const converted = computed(() => code.value !== from.value)

  const to = (cents: number, override?: string) =>
    convertCents(cents, override || from.value, code.value, rate.value)

  /** Сумма с копейками (в сумах — без них). */
  const m = (cents: number, override?: string) => formatMoney(to(cents, override), code.value)

  /** Сумма без дробной части — для крупных цифр вроде суммы договора. */
  const m0 = (cents: number, override?: string) => formatMoney(to(cents, override), code.value, true)

  return { m, m0, shown, code, label, rate, from, converted, CURRENCIES }
}
