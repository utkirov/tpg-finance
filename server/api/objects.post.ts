import { MAX_BONUS_RATE, money, rateFor, type BasisType } from '#shared/calc'

/**
 * Создание и правка объекта. Ставка бонуса подставляется из шкалы
 * и вместе с версиями справочников замораживается в объекте:
 * дальнейшие правки шкалы и долей на него не влияют.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')

  const body = await readBody<{
    id?: string
    name: string
    clientId?: string | null
    customer?: string
    address?: string
    contractAmount: number
    currency?: string
    rate?: number
    basisType?: BasisType
    basisNote?: string
    bonusPersonId?: string | null
    bonusRate?: number
    rateReason?: string
  }>(event)

  const name = text(body.name, 'название', { required: true, max: 120 })
  const contractAmount = cents(body.contractAmount, 'сумма договора', { positive: false })
  must(contractAmount >= 0, 'Сумма договора не может быть отрицательной')
  const currency = (text(body.currency, 'валюта', { max: 3 }) || 'USD').toUpperCase()
  // Курс объекта: сколько сумов за доллар. Ноль — не задан, тогда берётся справочный.
  const rate = Number(body.rate) > 0 ? Number(body.rate) : 0
  must(Number.isFinite(rate) && rate >= 0 && rate < 1e9, 'Проверьте курс объекта')
  const basisType = oneOf(body.basisType ?? 'договор', ['договор', 'расписка', 'устно'] as const, 'основание')

  return tx(() => {
    const settings = readSettings()
    // Заказчик берётся из CRM; имя дублируем в объект для показа и выгрузок.
    const clientId = body.clientId ? text(body.clientId, 'клиент') : null
    const client = clientId ? (getClient(clientId) ?? notFound('Клиент')) : null
    const customer = client ? client.name : text(body.customer, 'заказчик')
    const bonusPersonId = body.bonusPersonId ? text(body.bonusPersonId, 'получатель бонуса') : null
    if (bonusPersonId) must(settings.people.some(p => p.id === bonusPersonId), 'Получатель бонуса не найден в справочнике')

    const suggested = rateFor(settings.bonusScale, contractAmount)
    const bonusRate = Number(body.bonusRate ?? suggested)
    must(Number.isFinite(bonusRate) && bonusRate >= 0, 'Ставка бонуса указана неверно')
    must(bonusRate <= MAX_BONUS_RATE, `Ставка бонуса выше ${MAX_BONUS_RATE} % не сохраняется`)

    const db = useDb()
    const id = body.id ? text(body.id, 'объект') : null

    if (id) {
      const existing = getObject(id) ?? notFound('Объект')
      // Суммы операций хранятся в валюте объекта. Сменить её задним числом —
      // значит молча переназвать все записанные деньги, поэтому не даём.
      if (currency !== existing.currency) {
        const used = useDb()
          .prepare('SELECT COUNT(*) AS n FROM operations WHERE object_id = ?')
          .get(id) as { n: number }
        must(used.n === 0, 'По объекту уже есть операции — валюту учёта сменить нельзя')
      }
      const planned = stagesOfObject(id).reduce((a, s) => a + s.amount, 0)
      must(contractAmount >= planned, `Сумма этапов (${money(planned)}) больше новой суммы договора`)
      db.prepare(
        `UPDATE objects SET name = ?, customer = ?, client_id = ?, address = ?, contract_amount = ?, currency = ?,
         rate = ?, basis_type = ?, basis_note = ?, bonus_person_id = ?, bonus_rate = ? WHERE id = ?`,
      ).run(
        name, customer, clientId, text(body.address, 'адрес'), contractAmount, currency, rate,
        basisType, text(body.basisNote, 'условия'), bonusPersonId, bonusRate, id,
      )
      audit('object', id, 'update', {
        name, contractAmount, bonusRate,
        wasRate: existing.bonusRate,
        wasAmount: existing.contractAmount,
        reason: text(body.rateReason, 'причина', { max: 300 }),
      }, user.id)
      return { id, suggestedRate: rateFor(settings.bonusScale, contractAmount) }
    }

    const fresh = uid()
    db.prepare(
      `INSERT INTO objects (id, name, customer, client_id, address, contract_amount, currency, rate, basis_type,
        basis_note, bonus_person_id, bonus_rate, shares_version, scale_version, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'work', ?)`,
    ).run(
      fresh, name, customer, clientId, text(body.address, 'адрес'), contractAmount, currency, rate,
      basisType, text(body.basisNote, 'условия'), bonusPersonId, bonusRate,
      settings.sharesVersion, settings.scaleVersion, new Date().toISOString(),
    )
    audit('object', fresh, 'create', {
      name, contractAmount, bonusRate, suggested,
      sharesVersion: settings.sharesVersion, scaleVersion: settings.scaleVersion,
      reason: bonusRate !== suggested ? text(body.rateReason, 'причина', { max: 300 }) : '',
    }, user.id)
    return { id: fresh, suggestedRate: suggested }
  })
})
