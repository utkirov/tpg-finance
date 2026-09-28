import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Проверки API на живом сервере с временной базой: права, вход, операции,
 * бонус, исправление, защита от дублей, закрытие этапа.
 *
 * Запуск: npm run test:api (сборка + эти тесты). Без сборки тесты пропускаются.
 */
const SERVER = join(import.meta.dirname, '../../.output/server/index.mjs')
const built = existsSync(SERVER)
const PORT = 3900 + Math.floor(Math.random() * 90)
const B = `http://127.0.0.1:${PORT}`
let proc: ChildProcess | null = null
let dir = ''

before(async () => {
  if (!built) return
  dir = mkdtempSync(join(tmpdir(), 'finance-api-'))
  proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FINANCE_DB: join(dir, 'f.db') },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${B}/login`)).ok) return } catch { /* ещё поднимается */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('сервер не поднялся')
})

after(() => {
  proc?.kill()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** Клиент с кукой сессии. */
function client() {
  let cookie = ''
  return async (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(B + path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]!
    const data = await res.json().catch(() => null) as any
    return { status: res.status, data }
  }
}

async function loginFresh(login: string) {
  const c = client()
  await c('/api/auth/login', { login, password: login })
  const r = await c('/api/auth/password', { current: login, next: `${login}-pass-1` })
  assert.equal(r.status, 200, `смена пароля ${login}`)
  return c
}

const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)
const opBody = (extra: Record<string, unknown>) => ({
  stageId: 'st-restoran-1', kind: 'exp', amount: 10_000, currency: 'USD', fx: 12_000,
  date: today(), categoryId: 'rent', force: true, ...extra,
})

test('временный пароль закрывает API до смены', { skip: !built }, async () => {
  const c = client()
  await c('/api/auth/login', { login: 'buh', password: 'buh' })
  const s = await c('/api/state')
  assert.equal(s.data.mustChange, true)
  assert.equal(s.data.ops.length, 0, 'данных нет')
  assert.equal((await c('/api/ops', opBody({}))).status, 403)
})

test('операция: курс обязателен, повтор той же формы не создаёт вторую запись', { skip: !built }, async () => {
  const c = await loginFresh('owner')
  assert.equal((await c('/api/ops', opBody({ fx: undefined }))).status, 400, 'без курса не сохраняется')

  const key = `k-${Date.now()}`
  const first = await c('/api/ops', opBody({ clientKey: key, note: 'аренда' }))
  const again = await c('/api/ops', opBody({ clientKey: key, note: 'аренда' }))
  assert.equal(first.data.saved, true)
  assert.equal(again.data.repeated, true)
  assert.equal(again.data.op.id, first.data.op.id, 'вернулась та же запись')
  const ops = (await c('/api/state')).data.ops.filter((o: any) => o.clientKey === key)
  assert.equal(ops.length, 1)
})

test('бонус: виден сразу, в расчёт — после отметки с датой', { skip: !built }, async () => {
  const c = await loginFresh('ulugbek')
  const r = await c('/api/ops', { stageId: 'st-restoran-1', kind: 'in', amount: 100_000, currency: 'USD', fx: 12_000, date: today(), force: true })
  assert.equal(r.data.bonus.received, false)
  const before = (await c('/api/state')).data.totals['st-restoran-1']
  assert.ok(before.bonusPending >= 10_000)

  const mark = await c(`/api/ops/${r.data.bonus.id}/bonus`, { received: true, date: '2026-09-01' })
  assert.equal(mark.status, 200)
  const s = (await c('/api/state')).data
  const bonus = s.ops.find((o: any) => o.id === r.data.bonus.id)
  assert.equal(bonus.received, true)
  assert.equal(bonus.receivedAt, '2026-09-01')
  assert.equal(s.totals['st-restoran-1'].bonusPending, before.bonusPending - 10_000)
})

test('оператор вносит операции, но не сторнирует и не исправляет', { skip: !built }, async () => {
  const c = await loginFresh('ilhom')
  const r = await c('/api/ops', opBody({ note: 'от оператора' }))
  assert.equal(r.data.saved, true)
  assert.equal((await c(`/api/ops/${r.data.op.id}/void`, { reason: 'x' })).status, 403)
  assert.equal((await c('/api/ops', opBody({ replaces: r.data.op.id }))).status, 403)
  assert.equal((await c('/api/stages/st-restoran-1/status', { status: 'check' })).status, 403)
})

test('«Исправить»: старая запись сторнирована, новая — вместо неё', { skip: !built }, async () => {
  const c = client()
  await c('/api/auth/login', { login: 'owner', password: 'owner-pass-1' })
  const r = await c('/api/ops', opBody({ amount: 20_000, replaces: 'op-05', note: 'аренда, исправлено' }))
  assert.equal(r.data.saved, true)
  const s = (await c('/api/state')).data
  assert.equal(s.ops.find((o: any) => o.id === 'op-05').status, 'void')
  assert.ok(s.ops.some((o: any) => o.reversesId === 'op-05'), 'обратная запись есть')
  assert.equal(s.ops.find((o: any) => o.id === r.data.op.id).amount, 20_000)
})

test('закрытие: жёсткие условия не обходятся даже с force', { skip: !built }, async () => {
  const c = client()
  await c('/api/auth/login', { login: 'owner', password: 'owner-pass-1' })
  await c('/api/stages/st-restoran-1/status', { status: 'check' })
  const r = await c('/api/stages/st-restoran-1/status', { status: 'closed', force: true, reason: 'хочу' })
  assert.equal(r.data.closed, false)
  assert.equal(r.data.softOnly, false)
  assert.ok(r.data.problems.some((p: any) => /должен/.test(p.text)), 'дебиторка не ноль')
  await c('/api/stages/st-restoran-1/status', { status: 'work' })
})
