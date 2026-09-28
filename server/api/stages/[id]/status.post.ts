import { STAGE_NAME, calcStage, closingProblems, type Note, type StageStatus } from '#shared/calc'

/**
 * Жизненный цикл этапа: черновик → в работе → сверка → закрыт.
 * Закрытие проходит при нулевой дебиторке, полученном бонусе и нулевой кассе.
 * Перекос между участниками (одному переплатили, другому недоплатили —
 * в сумме ноль) закрытие тоже останавливает, но его можно принять явно:
 * force + причина, с записью в журнал. Жёсткие условия force не обходит.
 */
const ALLOWED: Record<StageStatus, StageStatus[]> = {
  draft: ['check'],
  work: ['check'],
  check: ['work', 'closed'],
  closed: ['check'],
}

export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'closeStages')
  const id = text(getRouterParam(event, 'id'), 'этап', { required: true })
  const body = await readBody<{ status: StageStatus; force?: boolean; reason?: string }>(event)
  const next = oneOf(body.status, ['draft', 'work', 'check', 'closed'] as const, 'статус')

  return tx(() => {
    const stage = getStage(id) ?? notFound('Этап')
    requireObject(event, stage.objectId)
    must(ALLOWED[stage.status].includes(next), 'Из статуса «{from}» нельзя перейти в «{to}»', { from: STAGE_NAME[stage.status], to: STAGE_NAME[next] })

    if (next === 'closed') {
      const obj = getObject(stage.objectId) ?? notFound('Объект')
      const totals = calcStage(stage, opsOfStage(stage.id), sharesOfVersion(obj.sharesVersion))
      const people = readPeople().concat(readArchivedPeople())
      const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? id
      const problems = closingProblems(stage, totals, nameOf)
      const hard = problems.filter(p => !p.soft)
      if (hard.length) return { closed: false, problems: hard, softOnly: false }
      if (problems.length) {
        const reason = text(body.reason, 'причина', { max: 300 })
        if (!body.force || !reason) return { closed: false, problems, softOnly: true }
        audit('stage', stage.id, 'close-uneven', { reason, problems: problems.map(p => p.params) }, user.id)
      }
    }

    const closedAt = next === 'closed' ? new Date().toISOString() : null
    useDb().prepare('UPDATE stages SET status = ?, closed_at = ? WHERE id = ?').run(next, closedAt, stage.id)
    audit('stage', stage.id, 'status', { from: stage.status, to: next }, user.id)
    return { closed: next === 'closed', problems: [] as Note[] }
  })
})
