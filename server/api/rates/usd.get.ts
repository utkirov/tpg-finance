import { cbuUsd } from '../../utils/rates'

/** Курс доллара ЦБ РУз на дату: ?date=ГГГГ-ММ-ДД → { date, rate }. Без сети — rate: null. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const date = isoDate(getQuery(event).date, 'дата')
  const found = await cbuUsd(date)
  return found ?? { date, rate: null, source: null }
})
