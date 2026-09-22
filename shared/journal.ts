import { KIND_NAME, STAGE_NAME, dmy, type Note } from './calc.ts'

/**
 * Журнал изменений — раздел 12 ТЗ: кто, когда, что изменил.
 * Записи пишутся на каждое действие; здесь они превращаются
 * в человеческую строку на языке интерфейса.
 */

export interface AuditEntry {
  id: number
  at: string
  userId: string | null
  userName: string
  entity: string
  entityId: string
  action: string
  details: Record<string, unknown>
}

/** Заголовок группы: к чему относится запись. */
export const ENTITY_NAME: Record<string, string> = {
  object: 'Объект',
  stage: 'Этап',
  operation: 'Операция',
  attachment: 'Файл',
  settings: 'Справочники',
  shares: 'Доли участников',
  bonus_scale: 'Шкала бонусов',
  user: 'Пользователь',
}

const str = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/**
 * Описание записи. Деньги форматирует вызывающая сторона —
 * так журнал подчиняется переключателю USD / SUM.
 */
export function describeAudit(e: AuditEntry, money: (cents: number) => string): Note {
  const d = e.details ?? {}
  const key = `${e.entity}:${e.action}`

  switch (key) {
    case 'object:create':
      return {
        text: 'Создан объект «{name}», договор {amount}, ставка бонуса {rate} %',
        params: { name: str(d.name), amount: money(num(d.contractAmount)), rate: str(d.bonusRate) },
      }
    case 'object:update':
      return {
        text: 'Изменён объект: договор {amount}, ставка бонуса {rate} %',
        params: { amount: money(num(d.contractAmount)), rate: str(d.bonusRate) },
      }
    case 'object:access':
      return {
        text: 'Изменён список допущенных к объекту: {count} чел.',
        params: { count: Array.isArray(d.userIds) ? d.userIds.length : 0 },
      }

    case 'stage:create':
      return {
        text: 'Создан этап {number} на сумму {amount}',
        params: { number: str(d.number), amount: money(num(d.amount)) },
      }
    case 'stage:update':
      return {
        text: 'Сумма этапа изменена: было {was}, стало {amount}',
        params: { was: money(num(d.was)), amount: money(num(d.amount)) },
      }
    case 'stage:status': {
      // Записи бывают двух видов: пара «откуда — куда» и просто новый статус.
      const to = str(d.to ?? d.value)
      if (d.from) {
        return {
          text: 'Этап переведён из «{from}» в «{to}»',
          params: { from: STAGE_NAME[str(d.from)] ?? str(d.from), to: STAGE_NAME[to] ?? to },
        }
      }
      return { text: 'Этап переведён в «{to}»', params: { to: STAGE_NAME[to] ?? to } }
    }
    case 'stage:reopen':
      return {
        text: 'Этап открыт заново: {reason}',
        params: { reason: str(d.reason ?? d.value) || 'сторно в закрытом этапе' },
      }

    case 'operation:create': {
      const params = {
        kind: KIND_NAME[str(d.kind) as keyof typeof KIND_NAME] ?? 'Операция',
        amount: money(num(d.amount)),
        date: dmy(str(d.date)),
      }
      return d.status === 'promised'
        ? { text: 'Внесено обязательство: {kind} {amount} от {date}', params }
        : { text: 'Внесена операция: {kind} {amount} от {date}', params }
    }
    case 'operation:auto-bonus':
      return { text: 'Система начислила бонус {amount}', params: { amount: money(num(d.amount)) } }
    case 'operation:void':
      return { text: 'Операция сторнирована. Причина: {reason}', params: { reason: str(d.reason) } }
    case 'operation:settle':
      return { text: 'Обязательство закрыто выплатой {date}', params: { date: dmy(str(d.date)) } }

    case 'object:budget':
      return Array.isArray(d.people)
        ? { text: 'План команды разделён между людьми: {count} чел.', params: { count: d.people.length } }
        : { text: 'План команды: {amount}', params: { amount: money(num(d.amount)) } }
    case 'stage:allocation':
      return { text: 'Команде выделено на этап: {amount}', params: { amount: money(num(d.amount)) } }
    case 'client:create':
      return { text: 'Заведён клиент «{name}»', params: { name: str(d.name) } }
    case 'client:update':
      return { text: 'Изменён клиент «{name}»', params: { name: str(d.name) } }

    case 'attachment:create':
      return {
        text: 'Прикреплён файл ({kind}), {size} КБ',
        params: { kind: str(d.kind), size: Math.max(1, Math.round(num(d.size) / 1024)) },
      }

    case 'settings:update':
      return { text: 'Правка справочников: людей {people}, категорий {categories}', params: { people: str(d.people), categories: str(d.categories) } }
    case 'shares:version':
      return { text: 'Доли участников получили новую версию' }
    case 'bonus_scale:version':
      return { text: 'Шкала бонусов получила новую версию' }

    case 'user:login':
      return { text: 'Вход в систему' }
    case 'user:create':
      return { text: 'Создан пользователь {login}', params: { login: str(d.login) } }
    case 'user:update':
      return { text: 'Изменён пользователь' }
    case 'user:password':
      return { text: 'Смена пароля' }

    default:
      return { text: '{entity}: {action}', params: { entity: ENTITY_NAME[e.entity] ?? e.entity, action: e.action } }
  }
}

/** Вторая строка записи: причина правки, если её указали. */
export function auditExtras(e: AuditEntry): string[] {
  const reason = e.details?.reason
  return reason && e.action !== 'void' ? [String(reason)] : []
}

/** Куда ведёт запись: на этап, если он известен. */
export function auditTarget(e: AuditEntry, stageOfOperation: (id: string) => string | null): string | null {
  if (e.entity === 'stage') return `/stages/${e.entityId}`
  if (e.entity === 'operation') {
    const stageId = stageOfOperation(e.entityId)
    return stageId ? `/stages/${stageId}` : null
  }
  return null
}

/** Дата и время записи в местном виде. */
export function auditWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const local = new Date(d.getTime() + 5 * 3600e3) // Asia/Tashkent
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
}
