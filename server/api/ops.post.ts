import {
  BONUS_CAT, bonusOf, calcStage, categoriesFor, money, operationWarnings, toBase,
  type Kind, type Note, type Op, type OpStatus,
} from '#shared/calc'
import { abilities } from '#shared/roles'
import { teamMembers } from '#shared/plan'

/**
 * Новая операция: приход, расход объекта или аванс участнику.
 *
 * Приход тут же порождает строку расхода «Бонус» на получателя объекта —
 * обе записи ложатся одной транзакцией, поэтому бонус не может потеряться.
 *
 * Статус «обещано» — договорились, но деньги не выданы: в кассу не входит,
 * попадает в список предстоящих выплат.
 *
 * Предупреждения (аванс больше доли, дубль, дата задним числом, освоение)
 * возвращаются клиенту без записи; повтор с force: true сохраняет.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'write')
  const ab = abilities(user.role)

  const body = await readBody<{
    stageId: string
    kind: Kind
    amount: number
    currency?: string
    rate?: number
    date: string
    personId?: string | null
    categoryId?: string | null
    teamId?: string | null
    offObject?: boolean
    note?: string
    status?: OpStatus
    dueDate?: string | null
    force?: boolean
  }>(event)

  const kind = oneOf(body.kind, ['in', 'exp', 'adv'] as const, 'тип операции')
  must(ab.kinds.includes(kind), 'Эта роль такие операции не вносит')
  const amount = cents(body.amount, 'сумма')
  const date = isoDate(body.date)
  const note = text(body.note, 'комментарий')
  const status = oneOf(body.status ?? 'ok', ['ok', 'promised'] as const, 'статус')
  must(status === 'ok' || kind !== 'in', 'Приход не может быть обязательством')
  const dueDate = body.dueDate ? isoDate(body.dueDate, 'срок') : null

  return tx(() => {
    const stage = getStage(text(body.stageId, 'этап', { required: true })) ?? notFound('Этап')
    const obj = getObject(stage.objectId) ?? notFound('Объект')
    requireObject(event, obj.id)
    const settings = readSettings()

    must(stage.status !== 'closed', 'Этап закрыт — операции запрещены')
    must(stage.status !== 'check', 'Этап на сверке — новые операции заблокированы')

    const currency = (text(body.currency, 'валюта', { max: 3 }) || obj.currency).toUpperCase()
    const rate = currency === obj.currency ? 1 : Number(body.rate)
    must(Number.isFinite(rate) && rate > 0 && rate < 1e9, 'Укажите курс к валюте объекта на дату операции')
    const amountBase = toBase(amount, rate)
    must(amountBase > 0, 'Сумма в валюте объекта получилась нулевой — проверьте курс')

    const personId = body.personId ? text(body.personId, 'человек') : null
    const categoryId = body.categoryId ? text(body.categoryId, 'категория') : null
    const teamId = body.teamId ? text(body.teamId, 'команда') : null
    // Расход не по объекту — это аванс участнику с понятным назначением.
    const offObject = kind === 'adv' && !!body.offObject

    if (kind === 'exp') {
      must(categoryId, 'Расход без категории не сохраняется')
      must(categoryId !== BONUS_CAT, 'Категория «Бонус» заполняется только автоматически')
      must(settings.categories.some(c => c.id === categoryId), 'Категория не найдена в справочнике')
      // Категория должна относиться к тому, о чём расход: работы команды или общие по объекту.
      must(
        categoriesFor(settings.categories, { teamId }).some(c => c.id === categoryId),
        'Категория не подходит к выбранной команде',
      )
    }
    if (teamId) {
      must(kind === 'exp', 'Команда указывается только у прямого расхода объекта')
      must(readTeams().some(t => t.id === teamId), 'Команда не найдена в справочнике')
    }
    // Расход команды записывается на её же человека: список в форме и правило на сервере совпадают.
    if (kind === 'exp' && personId) {
      const team = readTeams().find(t => t.id === teamId) ?? null
      must(
        teamMembers(settings.people, team).some(p => p.id === personId),
        'Человек не состоит в выбранной команде',
      )
    }
    if (kind === 'adv') {
      must(personId, 'Аванс участнику без указания человека не сохраняется')
      must(
        sharesOfVersion(obj.sharesVersion).some(s => s.personId === personId),
        'Аванс можно выдать только участнику дележа',
      )
      if (offObject) {
        must(categoryId, 'У расхода не по объекту нужно назначение')
        must(settings.categories.some(c => c.id === categoryId), 'Категория не найдена в справочнике')
        must(
          categoriesFor(settings.categories, { offObject: true }).some(c => c.id === categoryId),
          'Назначение должно быть из групп расходов не по объекту',
        )
      }
    }
    if (personId) must(settings.people.some(p => p.id === personId), 'Человек не найден в справочнике')

    const ops = opsOfStage(stage.id)
    const totals = calcStage(stage, ops, sharesOfVersion(obj.sharesVersion))
    const warnings = status === 'ok' ? operationWarnings({ kind, amountBase, date, personId }, stage, ops, totals) : []
    if (warnings.length && !body.force) return { saved: false, warnings }

    const now = new Date().toISOString()
    const op: Op = {
      id: uid(),
      stageId: stage.id,
      objectId: obj.id,
      date,
      kind,
      amount,
      currency,
      rate,
      amountBase,
      personId,
      categoryId: kind === 'exp' || offObject ? categoryId : null,
      teamId: kind === 'exp' ? teamId : null,
      offObject,
      note,
      status,
      dueDate,
      isAuto: false,
      parentId: null,
      reversesId: null,
      createdAt: now,
      createdBy: user.id,
      reason: '',
    }
    insertOp(op)
    audit('operation', op.id, 'create', { kind, amount, currency, date, status }, user.id)

    // Бонус: процент с каждого прихода, а не с суммы договора.
    let bonus: Op | null = null
    let hint: Note | null = null
    if (kind === 'in' && status === 'ok') {
      if (!obj.bonusPersonId) {
        hint = { text: 'У объекта не указан получатель бонуса — строка бонуса не создана. Приход требует внимания.' }
      } else {
        const value = bonusOf(amountBase, obj.bonusRate)
        if (value > 0) {
          bonus = {
            ...op,
            id: uid(),
            kind: 'exp',
            amount: value,
            currency: obj.currency,
            rate: 1,
            amountBase: value,
            personId: obj.bonusPersonId,
            categoryId: BONUS_CAT,
            teamId: null,
            offObject: false,
            note: `бонус ${obj.bonusRate} % с прихода ${money(amountBase)}`,
            isAuto: true,
            parentId: op.id,
            createdAt: new Date().toISOString(),
          }
          insertOp(bonus)
          audit('operation', bonus.id, 'auto-bonus', { parent: op.id, amount: value }, user.id)
          const who = settings.people.find(p => p.id === obj.bonusPersonId)?.name ?? ''
          hint = { text: 'Создана строка расхода «Бонус» {amount} · {name}.', params: { amount: money(value), name: who } }
        }
      }
    }

    if (stage.status === 'draft') {
      useDb().prepare("UPDATE stages SET status = 'work' WHERE id = ?").run(stage.id)
      audit('stage', stage.id, 'status', 'work', user.id)
    }

    return { saved: true, op, bonus, hint, warnings: [] as Note[] }
  })
})
