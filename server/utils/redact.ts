import { calcStage, type AppState, type Obj, type Op, type Stage, type StageTotals } from '#shared/calc'
import { abilities } from '#shared/roles'
import { narrowTotals, visibleOp } from '#shared/visibility'
import type { SessionUser } from './auth'

/**
 * Проекция состояния под роль — раздел 3 ТЗ.
 *
 * Показатели считает сервер, поэтому урезанная роль не получает слагаемых,
 * из которых можно собрать скрытое. У прораба на руках остаётся одна касса
 * и его собственные расходы: ни суммы договора, ни прихода, ни бонуса,
 * ни долей — доход на объекте по этим данным не восстанавливается.
 * Правила видимости строк и итогов — в shared/visibility.ts, там же тесты.
 */

/**
 * Проекция зависит только от данных и от того, кто смотрит. Пока в базе
 * ничего не записано, её незачем собирать заново: держим последнюю
 * на каждого пользователя и сбрасываем, как только версия данных сменилась.
 */
const cache = new Map<string, { version: string; state: AppState }>()

export function stateKey(user: SessionUser): string {
  return `${dataVersion()}:${user.id}:${user.role}:${user.personId ?? ''}`
}

export function projectState(user: SessionUser): AppState {
  const version = stateKey(user)
  const hit = cache.get(user.id)
  if (hit?.version === version) return hit.state
  const state = buildState(user)
  cache.set(user.id, { version, state })
  return state
}

function buildState(user: SessionUser): AppState {
  const ab = abilities(user.role)
  const settings = readSettings()
  const allowed = ab.allObjects ? null : new Set(objectIdsFor(user.id))

  const objects = readObjects()
    .filter(o => !allowed || allowed.has(o.id))
    .map<Obj>(o => ({
      ...o,
      contractAmount: ab.seeContract ? o.contractAmount : 0,
      bonusRate: ab.seeBonus ? o.bonusRate : 0,
      bonusPersonId: ab.seeBonus ? o.bonusPersonId : null,
    }))

  const visibleObjects = new Set(objects.map(o => o.id))
  const rawStages = readStages().filter(s => visibleObjects.has(s.objectId))
  const rawOps = readOps().filter(o => visibleObjects.has(o.objectId))

  // Раскладываем операции по этапам один раз. Иначе на каждый этап шёл
  // проход по всей ленте, и на нескольких тысячах записей это уже заметно.
  const byStage = new Map<string, Op[]>()
  for (const op of rawOps) {
    const list = byStage.get(op.stageId)
    if (list) list.push(op)
    else byStage.set(op.stageId, [op])
  }
  const versionOf = new Map(objects.map(o => [o.id, o.sharesVersion]))
  const sharesAll = allSharesByVersion()

  const totals: Record<string, StageTotals> = {}
  for (const stage of rawStages) {
    const shares = sharesAll[String(versionOf.get(stage.objectId) ?? settings.sharesVersion)] ?? []
    const own = byStage.get(stage.id) ?? []
    const mine = own.filter(o => visibleOp(o, user))
    totals[stage.id] = narrowTotals(calcStage(stage, own, shares), mine, user)
  }

  const stages = rawStages.map<Stage>(s => ({ ...s, amount: ab.seeContract ? s.amount : 0 }))
  const ops = rawOps.filter(o => visibleOp(o, user))
  const opIds = new Set(ops.map(o => o.id))
  const stageIds = new Set(rawStages.map(s => s.id))

  return {
    me: { id: user.id, name: user.name, login: user.login, role: user.role, personId: user.personId },
    // Команды нужны всем, кто видит расходы: ими подписаны строки ленты.
    teams: readTeams(),
    // Снятые с учёта — только имена для старых записей, в выборе их нет.
    archived: { people: readArchivedPeople(), categories: readArchivedCategories() },
    // Клиенты и планы раскрывают экономику объекта — прорабу они не видны.
    // Клиент — это контакты и деньги. Кто видит не все объекты, видит только их заказчиков.
    clients: ab.seeContract
      ? readClients().filter(c => ab.allObjects || objects.some(o => o.clientId === c.id))
      : [],
    budgets: ab.seeContract ? readBudgets().filter(b => visibleObjects.has(b.objectId)) : [],
    allocations: ab.seeContract ? readAllocations().filter(a => stageIds.has(a.stageId)) : [],
    settings: {
      ...settings,
      shares: ab.seeAllShares
        ? settings.shares
        : settings.shares.filter(s => ab.seeOwnShare && s.personId === user.personId),
      bonusScale: ab.seeBonus ? settings.bonusScale : [],
    },
    sharesByVersion: ab.seeAllShares
      ? sharesAll
      : Object.fromEntries(
          Object.entries(sharesAll).map(([v, list]) => [
            v,
            list.filter(s => ab.seeOwnShare && s.personId === user.personId),
          ]),
        ),
    objects,
    stages,
    ops,
    attachments: readAttachments().filter(a =>
      (a.objectId && visibleObjects.has(a.objectId)) || (a.operationId && opIds.has(a.operationId))),
    users: ab.manage ? readUsers() : [],
    totals,
  }
}
