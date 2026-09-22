/**
 * Маски ввода. Чистые функции «строка → строка»:
 * директива v-mask только вешает их на поле.
 */

export type MaskName = 'money' | 'rate' | 'percent' | 'phone' | 'code' | 'login'

/** Неразрывный пробел: не даёт разорвать число переносом строки. */
const NBSP = ' '

/** Цифры с разделителем тысяч и запятой: 1 234,56 */
export function decimal(raw: string, maxDecimals: number, group = true): string {
  const clean = String(raw ?? '').replace(/[^\d.,]/g, '').replace(/\./g, ',')
  const at = clean.indexOf(',')
  let int = (at === -1 ? clean : clean.slice(0, at)).replace(/^0+(?=\d)/, '')
  const dec = at === -1 ? null : clean.slice(at + 1).replace(/,/g, '').slice(0, maxDecimals)
  if (group) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  if (dec === null) return int
  return `${int || '0'},${dec}`
}

export function percentMask(raw: string): string {
  const out = decimal(raw, 2, false)
  return Number(out.replace(',', '.')) > 100 ? '100' : out
}

/** +998 (90) 123-45-67 — код страны из трёх цифр, как в Узбекистане и Таджикистане. */
export function phoneMask(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 12)
  if (!d) return ''
  let out = `+${d.slice(0, 3)}`
  const op = d.slice(3, 5)
  if (op) out += ` (${op}${op.length === 2 ? ')' : ''}`
  const a = d.slice(5, 8)
  if (a) out += ` ${a}`
  const b = d.slice(8, 10)
  if (b) out += `-${b}`
  const c = d.slice(10, 12)
  if (c) out += `-${c}`
  return out
}

export const MASKS: Record<MaskName, (raw: string) => string> = {
  money: v => decimal(v, 2),
  rate: v => decimal(v, 8),
  percent: percentMask,
  phone: phoneMask,
  code: v => String(v ?? '').replace(/[^a-zA-Zа-яА-Я]/g, '').toUpperCase().slice(0, 3),
  login: v => String(v ?? '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64),
}

/** Сколько значимых символов слева от каретки — по ним и вернём её на место. */
export function significant(s: string): number {
  return s.replace(/[^\d,]/g, '').length
}

export function caretAfter(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/[\d,]/.test(text[i]!)) seen++
    if (seen >= count) return i + 1
  }
  return text.length
}
