import { STAGE_NAME, calcStage, closingProblems, type Note, type StageStatus } from '#shared/calc'

/**
 * Жизненный цикл этапа: черновик → в работе → сверка → закрыт.
 * Закрытие проходит только при выполнении равенства
 * «сумма этапа = расходы + доли» при нулевой дебиторке и нулевой кассе.
 * Иначе возвращается величина и место расхождения.
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
  const body = await readBody<{ status: StageStatus }>(event)
  const next = oneOf(body.status, ['draft', 'work', 'check', 'closed'] as const, 'статус')

  return tx(() => {
    const stage = getStage(id) ?? notFound('Этап')
    requireObject(event, stage.objectId)
    must(ALLOWED[stage.status].includes(next), 'Из статуса «{from}» нельзя перейти в «{to}»', { from: STAGE_NAME[stage.status], to: STAGE_NAME[next] })

    if (next === 'closed') {
      const obj = getObject(stage.objectId) ?? notFound('Объект')
      const totals = calcStage(stage, opsOfStage(stage.id), sharesOfVersion(obj.sharesVersion))
      const problems = closingProblems(stage, totals)
      if (problems.length) return { closed: false, problems }
    }

    const closedAt = next === 'closed' ? new Date().toISOString() : null
    useDb().prepare('UPDATE stages SET status = ?, closed_at = ? WHERE id = ?').run(next, closedAt, stage.id)
    audit('stage', stage.id, 'status', { from: stage.status, to: next }, user.id)
    return { closed: next === 'closed', problems: [] as Note[] }
  })
})
