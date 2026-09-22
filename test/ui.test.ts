import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MASKS, caretAfter, decimal, phoneMask, significant } from '../shared/mask.ts'
import { UZ, translate } from '../shared/i18n.ts'
import { DEFAULT_DISPLAY_RATE, convertCents, currencyLabel, formatMoney, parseMoney, parseRate } from '../shared/calc.ts'

const NBSP = ' '

test('маска суммы: разряды, запятая, две цифры после неё', () => {
  assert.equal(MASKS.money('8000'), `8${NBSP}000`)
  assert.equal(MASKS.money('1234567'), `1${NBSP}234${NBSP}567`)
  assert.equal(MASKS.money('1135,004'), `1${NBSP}135,00`, 'третий знак отбрасывается')
  assert.equal(MASKS.money('12.50'), '12,50', 'точка превращается в запятую')
  assert.equal(MASKS.money('abc12'), '12', 'буквы не проходят')
  assert.equal(MASKS.money('007'), '7', 'ведущие нули убираются')
  assert.equal(MASKS.money(',5'), '0,5')
})

test('размаскированное значение читается расчётным ядром', () => {
  assert.equal(parseMoney(MASKS.money('18000')), 1_800_000)
  assert.equal(parseMoney(MASKS.money('1135,00')), 113_500)
  assert.equal(parseRate(MASKS.rate('0,0000787')), 0.0000787, 'курс до восьми знаков')
  assert.equal(parseRate(MASKS.rate('12700')), 12700)
})

test('маска процента не пускает больше ста', () => {
  assert.equal(MASKS.percent('75'), '75')
  assert.equal(MASKS.percent('7,55'), '7,55')
  assert.equal(MASKS.percent('140'), '100')
  assert.equal(decimal('75', 2, false), '75', 'проценты без разделителя разрядов')
})

test('маска телефона собирает номер по частям', () => {
  assert.equal(phoneMask('998'), '+998')
  assert.equal(phoneMask('99890'), '+998 (90)')
  assert.equal(phoneMask('998901234567'), '+998 (90) 123-45-67')
  assert.equal(phoneMask('+998 90 123 45 67'), '+998 (90) 123-45-67', 'повторное применение не ломает')
  assert.equal(phoneMask(''), '')
})

test('маски кода валюты и логина', () => {
  assert.equal(MASKS.code('uzs'), 'UZS')
  assert.equal(MASKS.code('usd123456'), 'USD')
  assert.equal(MASKS.login('Иван Petrov_1!'), 'petrov_1')
})

test('каретка возвращается на то же место после форматирования', () => {
  // «8000|» → «8 000|»: слева от каретки было 4 значимых символа
  const before = '8000'
  const after = MASKS.money(before)
  assert.equal(caretAfter(after, significant(before)), after.length)
  // «1234|567» → каретка после четвёртой цифры, то есть перед разделителем
  assert.equal(caretAfter(`1${NBSP}234${NBSP}567`, 4), 5)
})

test('перевод: узбекский из словаря, русский без изменений', () => {
  assert.equal(translate('uz', 'Сохранить'), 'Saqlash')
  assert.equal(translate('ru', 'Сохранить'), 'Сохранить')
  assert.equal(translate('uz', 'Такой строки нет'), 'Такой строки нет', 'непереведённое остаётся по-русски')
})

test('перевод подставляет значения в фигурные скобки', () => {
  assert.equal(
    translate('uz', 'Свободно по договору: {amount}', { amount: '18 000,00' }),
    'Shartnoma boʻyicha boʻsh: 18 000,00',
  )
  assert.equal(translate('ru', 'Освоено {percent} поступивших', { percent: '99 %' }), 'Освоено 99 % поступивших')
  assert.equal(translate('uz', '{what} не найден', { what: 'Obyekt' }), 'Obyekt topilmadi')
})

test('в словаре нет пустых переводов и потерянных подстановок', () => {
  for (const [ru, uz] of Object.entries(UZ)) {
    assert.ok(uz.trim().length > 0, `пустой перевод для «${ru}»`)
    const slots = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',')
    assert.equal(slots(uz), slots(ru), `подстановки разошлись в «${ru}»`)
  }
})

test('пересчёт для показа: доллары в сумы и обратно', () => {
  const rate = DEFAULT_DISPLAY_RATE // 12 000 сумов за доллар

  // 10 000,00 USD — это 1 000 000 центов -> 120 000 000 сумов
  assert.equal(convertCents(1_000_000, 'USD', 'UZS', rate), 12_000_000_000)
  assert.equal(formatMoney(convertCents(1_000_000, 'USD', 'UZS', rate), 'UZS'), `120${NBSP}000${NBSP}000`)

  // 50,00 USD -> 600 000 сумов
  assert.equal(formatMoney(convertCents(5_000, 'USD', 'UZS', rate), 'UZS'), `600${NBSP}000`)

  // Та же валюта — сумма не трогается
  assert.equal(convertCents(5_000, 'USD', 'USD', rate), 5_000)
  assert.equal(formatMoney(5_000, 'USD'), '50,00')

  // Обратный пересчёт возвращает исходное
  assert.equal(convertCents(convertCents(113_500, 'USD', 'UZS', rate), 'UZS', 'USD', rate), 113_500)

  // Нулевой курс ничего не ломает: показываем как есть
  assert.equal(convertCents(5_000, 'USD', 'UZS', 0), 5_000)
})

test('в сумах тийины не показываются, подпись валюты человеческая', () => {
  assert.equal(formatMoney(12_000_000_000, 'UZS'), `120${NBSP}000${NBSP}000`)
  assert.equal(formatMoney(113_500, 'USD'), `1${NBSP}135,00`)
  assert.equal(currencyLabel('UZS'), 'SUM')
  assert.equal(currencyLabel('USD'), 'USD')
})

test('в словаре нет повторяющихся ключей', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../shared/i18n.ts', import.meta.url), 'utf8')
  const keys = [...src.matchAll(/^ {2}'([^']*)'\s*:/gm)].map(x => x[1])
  const seen = new Set<string>()
  const dups = keys.filter(k => (seen.has(k) ? true : (seen.add(k), false)))
  assert.deepEqual(dups, [], 'повторный ключ перетирает первый перевод')
  assert.ok(keys.length > 300, 'словарь на месте')
})
