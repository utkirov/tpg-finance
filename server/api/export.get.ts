import { KIND_NAME, OP_STATUS_NAME, dmy, type Kind } from '#shared/calc'
import { projectState } from '../utils/redact'

/**
 * Выгрузка операций одной таблицей с фильтрами — раздел 11 ТЗ.
 * Строки берутся из той же проекции, что и экран: роль не выгрузит
 * того, чего не видит.
 *
 * CSV с BOM — Excel открывает без плясок с кодировкой.
 */
export default defineEventHandler((event) => {
  const user = requireUser(event)
  const q = getQuery(event)
  const state = projectState(user)

  const stageId = q.stage ? String(q.stage) : ''
  const objectId = q.object ? String(q.object) : ''
  const from = q.from ? isoDate(q.from, 'начало периода') : ''
  const to = q.to ? isoDate(q.to, 'конец периода') : ''
  const kind = q.kind ? oneOf(q.kind, ['in', 'exp', 'adv'] as const, 'тип') : ''
  const categoryId = q.category ? String(q.category) : ''
  const personId = q.person ? String(q.person) : ''

  const rows = state.ops
    .filter(op =>
      (!stageId || op.stageId === stageId)
      && (!objectId || op.objectId === objectId)
      && (!from || op.date >= from)
      && (!to || op.date <= to)
      && (!kind || op.kind === (kind as Kind))
      && (!categoryId || op.categoryId === categoryId)
      && (!personId || op.personId === personId))
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))

  const nameOf = (id: string | null, list: Array<{ id: string; name: string }>) =>
    (id ? list.find(x => x.id === id)?.name : '') ?? ''
  const objName = (id: string) => state.objects.find(o => o.id === id)?.name ?? ''
  const stageNo = (id: string) => String(state.stages.find(s => s.id === id)?.number ?? '')

  const table: string[][] = [[
    'Дата', 'Объект', 'Этап', 'Тип', 'Категория', 'Человек',
    'Сумма', 'Валюта', 'Курс', 'Сумма в валюте объекта', 'Статус', 'Срок', 'Комментарий',
  ]]
  for (const op of rows) {
    table.push([
      dmy(op.date),
      objName(op.objectId),
      stageNo(op.stageId),
      KIND_NAME[op.kind],
      nameOf(op.categoryId, state.settings.categories),
      nameOf(op.personId, state.settings.people),
      (op.amount / 100).toFixed(2),
      op.currency,
      String(op.rate),
      (op.amountBase / 100).toFixed(2),
      OP_STATUS_NAME[op.status],
      dmy(op.dueDate),
      op.note,
    ])
  }

  const csv = '﻿' + table.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const label = stageId
    ? `${objName(rows[0]?.objectId ?? '')}-этап${stageNo(stageId)}`
    : objectId ? objName(objectId) : 'операции'
  const filename = `${label || 'операции'}.csv`.replace(/\s+/g, '_')

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  return csv
})
