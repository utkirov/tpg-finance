import { fill } from '#shared/i18n'

/**
 * Проверки на границе доверия: клиент может прислать что угодно.
 *
 * Сообщение хранится как шаблон с подстановками и уезжает клиенту
 * и текстом по-русски, и ключом — чтобы интерфейс показал его
 * на своём языке.
 */

type Params = Record<string, string | number>

export function bad(message: string, params?: Params): never {
  const text = fill(message, params)
  throw createError({
    statusCode: 400,
    statusMessage: text,
    message: text,
    data: { key: message, params, message: text },
  })
}

export function must(condition: unknown, message: string, params?: Params): asserts condition {
  if (!condition) bad(message, params)
}

export function denied(message: string, statusCode = 403): never {
  throw createError({ statusCode, statusMessage: message, message, data: { key: message, message } })
}

export function notFound(what: string): never {
  const text = fill('{what} не найден', { what })
  throw createError({
    statusCode: 404,
    statusMessage: text,
    message: text,
    data: { key: '{what} не найден', params: { what }, message: text },
  })
}

/** Целое число центов: дробных денег в системе не существует. */
export function cents(value: unknown, field: string, { positive = true } = {}): number {
  const n = Number(value)
  must(Number.isInteger(n), '{field}: сумма должна быть целым числом центов', { field })
  must(!positive || n > 0, '{field}: сумма должна быть больше нуля', { field })
  return n
}

export function isoDate(value: unknown, field = 'дата'): string {
  const s = String(value ?? '')
  must(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)), '{field}: ожидается дата в формате ГГГГ-ММ-ДД', { field })
  return s
}

export function text(value: unknown, field: string, { required = false, max = 500 } = {}): string {
  const s = String(value ?? '').trim()
  must(!required || s.length > 0, '{field}: обязательное поле', { field })
  must(s.length <= max, '{field}: слишком длинное значение', { field })
  return s
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const s = String(value ?? '') as T
  must(allowed.includes(s), '{field}: недопустимое значение', { field })
  return s
}
