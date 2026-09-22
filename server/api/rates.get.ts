import { ratesFor } from '../utils/rates'

/** Подсказка курса для ручного ввода: ?base=USD → сколько единиц валюты за 1 USD. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const base = text(getQuery(event).base, 'валюта', { required: true, max: 3 })
  const snapshot = await ratesFor(base)
  if (!snapshot) return { base: base.toUpperCase(), date: null, rates: {}, stale: true }
  return snapshot
})
