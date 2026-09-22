import type { Kind } from './calc.ts'

/**
 * Роли и доступ — раздел 3 ТЗ.
 *
 * Правило видимости: маржа этапа, ставка бонуса и чужие доли доступны
 * только владельцу и бухгалтеру. Прораб не должен по косвенным данным
 * вычислить доход на объекте, поэтому на его экранах нет ни суммы
 * договора, ни чистой доли — и сервер их ему не отдаёт.
 */

export type Role = 'owner' | 'member' | 'foreman' | 'accountant'

export const ROLE_NAME: Record<Role, string> = {
  owner: 'Владелец',
  member: 'Участник',
  foreman: 'Прораб',
  accountant: 'Бухгалтер',
}

export interface Abilities {
  /** Вносить операции. */
  write: boolean
  /** Типы операций, доступные роли. */
  kinds: Kind[]
  /** Объекты, этапы, справочники, доступы. */
  manage: boolean
  /** Сумма договора, дебиторка, чистая доля. */
  seeContract: boolean
  /** Ставка бонуса и строки бонуса в ленте. */
  seeBonus: boolean
  /** Доли всех участников. */
  seeAllShares: boolean
  /** Своя доля и свои авансы. */
  seeOwnShare: boolean
  /** Все объекты, а не только назначенные. */
  allObjects: boolean
  /** Закрытие этапа, сторно. */
  closeStages: boolean
}

const TABLE: Record<Role, Abilities> = {
  owner: {
    write: true, kinds: ['in', 'exp', 'adv'], manage: true,
    seeContract: true, seeBonus: true, seeAllShares: true, seeOwnShare: true,
    allObjects: true, closeStages: true,
  },
  member: {
    write: true, kinds: ['in', 'exp', 'adv'], manage: false,
    seeContract: true, seeBonus: false, seeAllShares: false, seeOwnShare: true,
    allObjects: false, closeStages: false,
  },
  foreman: {
    write: true, kinds: ['exp'], manage: false,
    seeContract: false, seeBonus: false, seeAllShares: false, seeOwnShare: false,
    allObjects: false, closeStages: false,
  },
  accountant: {
    write: false, kinds: [], manage: false,
    seeContract: true, seeBonus: true, seeAllShares: true, seeOwnShare: true,
    allObjects: true, closeStages: false,
  },
}

export function abilities(role: Role): Abilities {
  return TABLE[role] ?? TABLE.foreman
}

export interface Me {
  id: string
  name: string
  login: string
  role: Role
  /** Карточка человека, если пользователь — участник дележа или прораб. */
  personId: string | null
}
