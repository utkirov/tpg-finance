/**
 * CSV для Excel: точка с запятой, кавычки, BOM.
 *
 * Ячейка, начинающаяся с = + - @ (или табуляции и перевода строки перед ними),
 * Excel и LibreOffice выполняют как формулу. Комментарий «=HYPERLINK(...)»
 * в операции превратился бы в ссылку или команду у бухгалтера,
 * поэтому такой текст получает спереди апостроф и остаётся текстом.
 */
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: unknown, { numeric = false } = {}): string {
  let s = String(value ?? '')
  if (!numeric && FORMULA_START.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/** Таблица → CSV. numericColumns — индексы колонок с числами: их знак минуса не трогаем. */
export function toCsv(rows: string[][], numericColumns: number[] = []): string {
  const numeric = new Set(numericColumns)
  return '﻿' + rows
    .map((r, ri) => r.map((v, ci) => csvCell(v, { numeric: ri > 0 && numeric.has(ci) })).join(';'))
    .join('\r\n')
}
