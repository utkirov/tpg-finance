import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { BONUS_CAT, DEFAULT_DISPLAY_RATE, type Attachment, type Category, type Client, type Obj, type Op, type Person, type Settings, type Share, type Stage } from '#shared/calc'
import type { Allocation, Budget, Team } from '#shared/plan'
import type { Role } from '#shared/roles'
import { hashPassword } from './password'

/**
 * Хранилище. SQLite из стандартной библиотеки Node (node:sqlite) —
 * реляционная база с транзакциями, без единой зависимости и без сервера БД.
 * Файл базы: .data/finance.db, переопределяется переменной FINANCE_DB.
 *
 * ponytail: одна база-файл. Переезд на PostgreSQL — замена этого модуля,
 * схема и SQL совместимы; трогать при нескольких одновременных писателях.
 */

export const DB_FILE = resolve(process.env.FINANCE_DB || '.data/finance.db')
let handle: DatabaseSync | null = null

export function useDb(): DatabaseSync {
  if (handle) return handle
  mkdirSync(dirname(DB_FILE), { recursive: true })
  handle = new DatabaseSync(DB_FILE)
  handle.exec('PRAGMA journal_mode = WAL')
  handle.exec('PRAGMA foreign_keys = ON')
  migrate(handle)
  seed(handle)
  return handle
}

/** Всё внутри — одной транзакцией: расчёт долей и запись не расходятся. */
export function tx<T>(fn: () => T): T {
  const db = useDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function uid(): string {
  return crypto.randomUUID()
}

/** Журнал. Записи не удаляются физически — только помечаются отменёнными. */
export function audit(entity: string, entityId: string, action: string, details: unknown = '', userId: string | null = null) {
  useDb()
    .prepare('INSERT INTO audit_log (at, user_id, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), userId, entity, entityId, action, typeof details === 'string' ? details : JSON.stringify(details))
}

export function meta(key: string): string | null {
  const row = useDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  useDb()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people (
      id        TEXT PRIMARY KEY,
      name      TEXT    NOT NULL,
      role      TEXT    NOT NULL DEFAULT '',
      phone     TEXT    NOT NULL DEFAULT '',
      team_id   TEXT,                            -- в какой команде работает
      is_sharer INTEGER NOT NULL DEFAULT 0,
      archived  INTEGER NOT NULL DEFAULT 0
    );

    -- Категория расхода привязана к тому, о чём расход:
    -- team_id — работы команды, group_name — расход не по объекту (офис, личное).
    -- Обе пустые — общая категория объекта.
    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT    NOT NULL,
      team_id    TEXT,
      group_name TEXT,
      system     INTEGER NOT NULL DEFAULT 0,
      archived   INTEGER NOT NULL DEFAULT 0
    );

    -- Версионные справочники: правка создаёт новую версию,
    -- существующие объекты остаются на своей.
    CREATE TABLE IF NOT EXISTS shares (
      version    INTEGER NOT NULL,
      person_id  TEXT    NOT NULL REFERENCES people(id),
      percent    REAL    NOT NULL,
      valid_from TEXT    NOT NULL,
      PRIMARY KEY (version, person_id)
    );

    CREATE TABLE IF NOT EXISTS bonus_scale (
      version     INTEGER NOT NULL,
      amount_from INTEGER NOT NULL,
      amount_to   INTEGER,
      rate        REAL    NOT NULL,
      PRIMARY KEY (version, amount_from)
    );

    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      login      TEXT    NOT NULL UNIQUE,
      name       TEXT    NOT NULL,
      role       TEXT    NOT NULL,
      pass_hash  TEXT    NOT NULL,
      pass_salt  TEXT    NOT NULL,
      must_change INTEGER NOT NULL DEFAULT 0,
      phone      TEXT    NOT NULL DEFAULT '',
      person_id  TEXT REFERENCES people(id),
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- CRM: клиенты, с которыми заключают договоры
    CREATE TABLE IF NOT EXISTS clients (
      id         TEXT PRIMARY KEY,
      name       TEXT    NOT NULL,
      phone      TEXT    NOT NULL DEFAULT '',
      phone2     TEXT    NOT NULL DEFAULT '',
      email      TEXT    NOT NULL DEFAULT '',
      source     TEXT    NOT NULL DEFAULT '',
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL,
      archived   INTEGER NOT NULL DEFAULT 0
    );

    -- Команды: направления работ и мультикоманда из нескольких направлений
    CREATE TABLE IF NOT EXISTS teams (
      id        TEXT PRIMARY KEY,
      name      TEXT    NOT NULL,
      composite INTEGER NOT NULL DEFAULT 0,
      archived  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS team_parts (
      team_id      TEXT NOT NULL REFERENCES teams(id),
      part_team_id TEXT NOT NULL REFERENCES teams(id),
      PRIMARY KEY (team_id, part_team_id)
    );

    -- О какой сумме договорились с командой на объект.
    -- person_id пустой — сумма на всю команду, иначе это доля человека внутри неё.
    CREATE TABLE IF NOT EXISTS object_budgets (
      object_id TEXT    NOT NULL REFERENCES objects(id),
      team_id   TEXT    NOT NULL REFERENCES teams(id),
      person_id TEXT    NOT NULL DEFAULT '',
      amount    INTEGER NOT NULL,
      note      TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (object_id, team_id, person_id)
    );

    -- Сколько из плана выделено команде на конкретный этап
    CREATE TABLE IF NOT EXISTS stage_allocations (
      stage_id TEXT    NOT NULL REFERENCES stages(id),
      team_id  TEXT    NOT NULL REFERENCES teams(id),
      amount   INTEGER NOT NULL,
      PRIMARY KEY (stage_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS objects (
      id              TEXT PRIMARY KEY,
      name            TEXT    NOT NULL,
      customer        TEXT    NOT NULL DEFAULT '',
      client_id       TEXT REFERENCES clients(id),
      address         TEXT    NOT NULL DEFAULT '',
      contract_amount INTEGER NOT NULL,              -- центы
      currency        TEXT    NOT NULL DEFAULT 'USD',
      rate            REAL    NOT NULL DEFAULT 0,
      basis_type      TEXT    NOT NULL DEFAULT 'договор',
      basis_note      TEXT    NOT NULL DEFAULT '',
      bonus_person_id TEXT REFERENCES people(id),
      bonus_rate      REAL    NOT NULL DEFAULT 0,    -- ставка, не деньги
      shares_version  INTEGER NOT NULL DEFAULT 1,
      scale_version   INTEGER NOT NULL DEFAULT 1,
      status          TEXT    NOT NULL DEFAULT 'work',
      created_at      TEXT    NOT NULL
    );

    -- Кто из не-владельцев допущен к объекту.
    CREATE TABLE IF NOT EXISTS object_access (
      object_id TEXT NOT NULL REFERENCES objects(id),
      user_id   TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (object_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS stages (
      id        TEXT PRIMARY KEY,
      object_id TEXT    NOT NULL REFERENCES objects(id),
      number    INTEGER NOT NULL,
      name      TEXT    NOT NULL DEFAULT '',
      amount    INTEGER NOT NULL,                    -- центы
      status    TEXT    NOT NULL DEFAULT 'draft',
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS operations (
      id          TEXT PRIMARY KEY,
      stage_id    TEXT    NOT NULL REFERENCES stages(id),
      object_id   TEXT    NOT NULL REFERENCES objects(id),
      date        TEXT    NOT NULL,                  -- дата операции, не дата ввода
      kind        TEXT    NOT NULL,                  -- in | exp | adv
      amount      INTEGER NOT NULL,                  -- центы в валюте операции
      currency    TEXT    NOT NULL DEFAULT 'USD',
      rate        REAL    NOT NULL DEFAULT 1,        -- курс к валюте объекта на дату
      amount_base INTEGER NOT NULL,                  -- центы в валюте объекта
      person_id   TEXT REFERENCES people(id),
      category_id TEXT REFERENCES categories(id),
      team_id     TEXT REFERENCES teams(id),       -- чья работа оплачена
      off_object  INTEGER NOT NULL DEFAULT 0,      -- расход не по объекту
      note        TEXT    NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'ok',     -- ok | void | promised
      due_date    TEXT,                              -- срок обязательства
      is_auto     INTEGER NOT NULL DEFAULT 0,        -- 1 у строк бонуса
      parent_id   TEXT REFERENCES operations(id),    -- у бонуса — породивший приход
      reverses_id TEXT REFERENCES operations(id),    -- у сторнирующей записи
      created_at  TEXT    NOT NULL,
      created_by  TEXT REFERENCES users(id),
      reason      TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id           TEXT PRIMARY KEY,
      kind         TEXT NOT NULL DEFAULT 'прочее',
      object_id    TEXT REFERENCES objects(id),
      operation_id TEXT REFERENCES operations(id),
      filename     TEXT NOT NULL,
      mime         TEXT NOT NULL,
      size         INTEGER NOT NULL,
      path         TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      created_by   TEXT REFERENCES users(id)
    );

    -- Курсы валют на дату: подсказка при ручном вводе, не источник истины.
    CREATE TABLE IF NOT EXISTS rates_cache (
      base    TEXT PRIMARY KEY,
      date    TEXT NOT NULL,
      payload TEXT NOT NULL,
      saved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      at        TEXT NOT NULL,
      user_id   TEXT,
      entity    TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action    TEXT NOT NULL,
      details   TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS operations_stage   ON operations(stage_id);
    CREATE INDEX IF NOT EXISTS operations_team    ON operations(team_id);
    CREATE INDEX IF NOT EXISTS objects_client     ON objects(client_id);
    CREATE INDEX IF NOT EXISTS operations_object  ON operations(object_id);
    CREATE INDEX IF NOT EXISTS operations_status  ON operations(status);
    CREATE INDEX IF NOT EXISTS stages_object      ON stages(object_id);
    CREATE INDEX IF NOT EXISTS attachments_op     ON attachments(operation_id);
    CREATE INDEX IF NOT EXISTS sessions_user      ON sessions(user_id);
  `)

  // Команда у человека появилась позже — доводим базу, заведённую до неё.
  const columns = db.prepare('PRAGMA table_info(people)').all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'team_id')) db.exec('ALTER TABLE people ADD COLUMN team_id TEXT')

  // Курс объекта появился позже — добавляем столбец на месте.
  const objCols = db.prepare('PRAGMA table_info(objects)').all() as Array<{ name: string }>
  if (objCols.length && !objCols.some(c => c.name === 'rate')) {
    db.exec('ALTER TABLE objects ADD COLUMN rate REAL NOT NULL DEFAULT 0')
  }

  // Категории получили область применения — добавляем столбцы на месте.
  const catCols = db.prepare('PRAGMA table_info(categories)').all() as Array<{ name: string }>
  if (catCols.length && !catCols.some(c => c.name === 'team_id')) {
    db.exec('ALTER TABLE categories ADD COLUMN team_id TEXT')
    db.exec('ALTER TABLE categories ADD COLUMN group_name TEXT')
  }

  // Сумма на человека внутри команды: у старой таблицы ключ был без него,
  // одним ALTER не обойтись — пересобираем и переносим планы как есть.
  const budgetCols = db.prepare('PRAGMA table_info(object_budgets)').all() as Array<{ name: string }>
  if (budgetCols.length && !budgetCols.some(c => c.name === 'person_id')) {
    db.exec(`
      ALTER TABLE object_budgets RENAME TO object_budgets_old;
      CREATE TABLE object_budgets (
        object_id TEXT    NOT NULL REFERENCES objects(id),
        team_id   TEXT    NOT NULL REFERENCES teams(id),
        person_id TEXT    NOT NULL DEFAULT '',
        amount    INTEGER NOT NULL,
        note      TEXT    NOT NULL DEFAULT '',
        PRIMARY KEY (object_id, team_id, person_id)
      );
      INSERT INTO object_budgets (object_id, team_id, person_id, amount, note)
        SELECT object_id, team_id, '', amount, note FROM object_budgets_old;
      DROP TABLE object_budgets_old;
    `)
  }
}

/* ---------- справочники ---------- */

type Row = Record<string, any>

export function currentSharesVersion(): number {
  return Number(meta('shares_version') ?? 1)
}

export function currentScaleVersion(): number {
  return Number(meta('scale_version') ?? 1)
}

export function sharesOfVersion(version: number): Share[] {
  return (useDb().prepare('SELECT person_id, percent FROM shares WHERE version = ? ORDER BY percent DESC').all(version) as Row[])
    .map(r => ({ personId: r.person_id, percent: r.percent }))
}

export function allSharesByVersion(): Record<string, Share[]> {
  const rows = useDb().prepare('SELECT version, person_id, percent FROM shares ORDER BY version, percent DESC').all() as Row[]
  const out: Record<string, Share[]> = {}
  for (const r of rows) (out[String(r.version)] ??= []).push({ personId: r.person_id, percent: r.percent })
  return out
}

export function scaleOfVersion(version: number) {
  return (useDb().prepare('SELECT amount_from, amount_to, rate FROM bonus_scale WHERE version = ? ORDER BY amount_from').all(version) as Row[])
    .map(r => ({ from: r.amount_from, to: r.amount_to, rate: r.rate }))
}

export function readPeople(): Person[] {
  return (useDb().prepare('SELECT * FROM people WHERE archived = 0 ORDER BY name').all() as Row[])
    .map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      phone: r.phone,
      teamId: r.team_id,
      isSharer: !!r.is_sharer,
    }))
}

/**
 * Люди и категории, снятые с учёта. В справочниках их нет, но в ленте
 * и отчётах их записи остались — без имён история читалась бы прочерками.
 */
export function readArchivedPeople(): Person[] {
  return (useDb().prepare('SELECT * FROM people WHERE archived = 1 ORDER BY name').all() as Row[])
    .map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      phone: r.phone,
      teamId: r.team_id,
      isSharer: !!r.is_sharer,
      archived: true,
    }))
}

export function readArchivedCategories(): Category[] {
  return (useDb().prepare('SELECT * FROM categories WHERE archived = 1 ORDER BY name').all() as Row[])
    .map(r => ({
      id: r.id,
      name: r.name,
      teamId: r.team_id,
      group: r.group_name,
      system: !!r.system,
      archived: true,
    }))
}

export function readCategories(): Category[] {
  return (useDb().prepare('SELECT * FROM categories WHERE archived = 0 ORDER BY system DESC, name').all() as Row[])
    .map(r => ({
      id: r.id,
      name: r.name,
      teamId: r.team_id,
      group: r.group_name,
      system: !!r.system,
      archived: !!r.archived,
    }))
}

export function readSettings(): Settings {
  const sharesVersion = currentSharesVersion()
  const scaleVersion = currentScaleVersion()
  return {
    currency: meta('currency') ?? 'USD',
    displayRate: Number(meta('display_rate') ?? DEFAULT_DISPLAY_RATE) || DEFAULT_DISPLAY_RATE,
    people: readPeople(),
    categories: readCategories(),
    shares: sharesOfVersion(sharesVersion),
    sharesVersion,
    bonusScale: scaleOfVersion(scaleVersion),
    scaleVersion,
  }
}

/* ---------- сущности ---------- */

export const toClient = (r: Row): Client => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  phone2: r.phone2,
  email: r.email,
  source: r.source,
  note: r.note,
  createdAt: r.created_at,
  archived: !!r.archived,
})

export function readClients(): Client[] {
  return (useDb().prepare('SELECT * FROM clients WHERE archived = 0 ORDER BY name').all() as Row[]).map(toClient)
}

export function getClient(id: string): Client | null {
  const r = useDb().prepare('SELECT * FROM clients WHERE id = ?').get(id) as Row | undefined
  return r ? toClient(r) : null
}

export function readTeams(): Team[] {
  const db = useDb()
  const parts = db.prepare('SELECT team_id, part_team_id FROM team_parts').all() as Row[]
  return (db.prepare('SELECT * FROM teams WHERE archived = 0 ORDER BY composite, name').all() as Row[]).map(r => ({
    id: r.id,
    name: r.name,
    composite: !!r.composite,
    parts: parts.filter(p => p.team_id === r.id).map(p => p.part_team_id as string),
    archived: !!r.archived,
  }))
}

export function readBudgets(): Budget[] {
  return (useDb().prepare('SELECT * FROM object_budgets').all() as Row[]).map(r => ({
    objectId: r.object_id,
    teamId: r.team_id,
    personId: r.person_id || null,
    amount: r.amount,
    note: r.note,
  }))
}

export function readAllocations(): Allocation[] {
  return (useDb().prepare('SELECT * FROM stage_allocations').all() as Row[]).map(r => ({
    stageId: r.stage_id,
    teamId: r.team_id,
    amount: r.amount,
  }))
}

const toObj = (r: Row): Obj => ({
  id: r.id,
  name: r.name,
  customer: r.customer,
  clientId: r.client_id,
  address: r.address,
  contractAmount: r.contract_amount,
  currency: r.currency,
  rate: r.rate ?? 0,
  basisType: r.basis_type,
  basisNote: r.basis_note,
  bonusPersonId: r.bonus_person_id,
  bonusRate: r.bonus_rate,
  sharesVersion: r.shares_version,
  scaleVersion: r.scale_version,
  status: r.status,
})

const toStage = (r: Row): Stage => ({
  id: r.id,
  objectId: r.object_id,
  number: r.number,
  name: r.name,
  amount: r.amount,
  status: r.status,
  closedAt: r.closed_at,
})

const toOp = (r: Row): Op => ({
  id: r.id,
  stageId: r.stage_id,
  objectId: r.object_id,
  date: r.date,
  kind: r.kind,
  amount: r.amount,
  currency: r.currency,
  rate: r.rate,
  amountBase: r.amount_base,
  personId: r.person_id,
  categoryId: r.category_id,
  teamId: r.team_id,
  offObject: !!r.off_object,
  note: r.note,
  status: r.status,
  dueDate: r.due_date,
  isAuto: !!r.is_auto,
  parentId: r.parent_id,
  reversesId: r.reverses_id,
  createdAt: r.created_at,
  createdBy: r.created_by,
  reason: r.reason,
})

const toAttachment = (r: Row): Attachment => ({
  id: r.id,
  kind: r.kind,
  objectId: r.object_id,
  operationId: r.operation_id,
  filename: r.filename,
  mime: r.mime,
  size: r.size,
  createdAt: r.created_at,
})

export function getObject(id: string): Obj | null {
  const r = useDb().prepare('SELECT * FROM objects WHERE id = ?').get(id) as Row | undefined
  return r ? toObj(r) : null
}

export function getStage(id: string): Stage | null {
  const r = useDb().prepare('SELECT * FROM stages WHERE id = ?').get(id) as Row | undefined
  return r ? toStage(r) : null
}

export function getOp(id: string): Op | null {
  const r = useDb().prepare('SELECT * FROM operations WHERE id = ?').get(id) as Row | undefined
  return r ? toOp(r) : null
}

export function getAttachment(id: string): (Attachment & { path: string }) | null {
  const r = useDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Row | undefined
  return r ? { ...toAttachment(r), path: r.path } : null
}

export function opsOfStage(stageId: string): Op[] {
  return (useDb().prepare('SELECT * FROM operations WHERE stage_id = ?').all(stageId) as Row[]).map(toOp)
}

export function stagesOfObject(objectId: string): Stage[] {
  return (useDb().prepare('SELECT * FROM stages WHERE object_id = ? ORDER BY number').all(objectId) as Row[]).map(toStage)
}

export function readObjects(): Obj[] {
  return (useDb().prepare('SELECT * FROM objects ORDER BY created_at').all() as Row[]).map(toObj)
}

export function readStages(): Stage[] {
  return (useDb().prepare('SELECT * FROM stages ORDER BY number').all() as Row[]).map(toStage)
}

export function readOps(): Op[] {
  return (useDb().prepare('SELECT * FROM operations ORDER BY date, created_at').all() as Row[]).map(toOp)
}

export function readAttachments(): Attachment[] {
  return (useDb().prepare('SELECT * FROM attachments ORDER BY created_at').all() as Row[]).map(toAttachment)
}

export function insertOp(op: Op) {
  useDb()
    .prepare(
      `INSERT INTO operations
        (id, stage_id, object_id, date, kind, amount, currency, rate, amount_base, person_id, category_id,
         team_id, off_object, note, status, due_date, is_auto, parent_id, reverses_id, created_at, created_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      op.id, op.stageId, op.objectId, op.date, op.kind, op.amount, op.currency, op.rate, op.amountBase,
      op.personId, op.categoryId, op.teamId, op.offObject ? 1 : 0, op.note, op.status, op.dueDate,
      op.isAuto ? 1 : 0, op.parentId, op.reversesId, op.createdAt, op.createdBy, op.reason,
    )
}

/** Объекты, к которым допущен пользователь без права видеть всё. */
export function objectIdsFor(userId: string): string[] {
  return (useDb().prepare('SELECT object_id FROM object_access WHERE user_id = ?').all(userId) as Row[])
    .map(r => r.object_id)
}

/**
 * Журнал по объекту: записи о нём самом, его этапах, операциях и файлах.
 * Отдельной колонки не заводим — связь восстанавливается по ключам,
 * поэтому старые записи тоже видны.
 */
export function auditForObject(objectId: string, limit = 300) {
  const rows = useDb().prepare(
    `SELECT a.id, a.at, a.user_id, a.entity, a.entity_id, a.action, a.details,
            COALESCE(u.name, '') AS user_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity_id = ?
         OR a.entity_id IN (SELECT id FROM stages WHERE object_id = ?)
         OR a.entity_id IN (SELECT id FROM operations WHERE object_id = ?)
         OR a.entity_id IN (
              SELECT id FROM attachments
               WHERE object_id = ?
                  OR operation_id IN (SELECT id FROM operations WHERE object_id = ?))
      ORDER BY a.at DESC, a.id DESC
      LIMIT ?`,
  ).all(objectId, objectId, objectId, objectId, objectId, limit) as Row[]

  return rows.map(r => ({
    id: r.id as number,
    at: r.at as string,
    userId: r.user_id as string | null,
    userName: (r.user_name as string) || '—',
    entity: r.entity as string,
    entityId: r.entity_id as string,
    action: r.action as string,
    details: parseDetails(r.details as string),
  }))
}

function parseDetails(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { value: parsed }
  } catch {
    return { value: raw }
  }
}

export function readUsers() {
  const rows = useDb().prepare('SELECT id, login, name, role, person_id FROM users WHERE active = 1 ORDER BY name').all() as Row[]
  return rows.map(r => ({
    id: r.id,
    login: r.login,
    name: r.name,
    role: r.role as Role,
    personId: r.person_id as string | null,
    objectIds: objectIdsFor(r.id),
  }))
}

/* ---------- первичное наполнение ---------- */

/**
 * Контрольный пример из раздела 14 ТЗ — реальная страница блокнота.
 * Ставится один раз, на пустую базу, чтобы приложение открывалось
 * в рабочем состоянии, а расчёт можно было проверить глазами.
 */
function seed(db: DatabaseSync) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM objects').get() as { n: number }
  if (count.n > 0) return

  setMeta('currency', 'USD')
  setMeta('display_rate', String(DEFAULT_DISPLAY_RATE))
  setMeta('shares_version', '1')
  setMeta('scale_version', '1')
  setMeta('schema', '2')

  // Команды заводим первыми: на них ссылаются люди и расходы.
  const team = db.prepare('INSERT INTO teams (id, name, composite, archived) VALUES (?, ?, ?, 0)')
  team.run('t-arch', 'Архитекторы', 0)
  team.run('t-design', 'Дизайнеры', 0)
  team.run('t-struct', 'Конструкторы', 0)
  team.run('t-eng', 'Инженеры', 0)
  team.run('t-multi', 'Мультикоманда', 1)
  const part = db.prepare('INSERT INTO team_parts (team_id, part_team_id) VALUES (?, ?)')
  for (const id of ['t-arch', 't-design', 't-eng']) part.run('t-multi', id)

  // [id, имя, роль, команда, участник дележа]
  const people: Array<[string, string, string, string | null, number]> = [
    ['p-ilhom', 'Илхом', 'участник', null, 1],
    ['p-ulugbek', 'Улугбек', 'участник', null, 1],
    ['p-dilshod', 'Дилшод', 'участник', null, 1],
    ['p-shuhrat', 'Шухрат ака', 'архитектор', 't-arch', 0],
    ['p-parhayot', 'Пархаёт ака', 'конструктор', 't-struct', 0],
    ['p-dilmurod', 'Дилмурод ака', 'нозир', null, 0],
  ]
  const person = db.prepare(
    "INSERT INTO people (id, name, role, phone, team_id, is_sharer) VALUES (?, ?, ?, '', ?, ?)",
  )
  for (const p of people) person.run(...p)

  // [id, название, команда, группа расходов не по объекту, системная]
  const categories: Array<[string, string, string | null, string | null, number]> = [
    [BONUS_CAT, 'Бонус', null, null, 1],

    // общие по объекту — годятся любой команде
    ['mat', 'Материалы', null, null, 0],
    ['work', 'Работы', null, null, 0],
    ['sub', 'Подряд', null, null, 0],
    ['rent', 'Аренда', null, null, 0],
    ['trn', 'Транспорт', null, null, 0],
    ['tnd', 'Тендер', null, null, 0],
    ['psd', 'ПСД и смета', null, null, 0],
    ['agr', 'Согласования и нозир', null, null, 0],
    ['mkt', 'Маркетинг', null, null, 0],
    ['liv', 'Быт', null, null, 0],
    ['oth', 'Прочее', null, null, 0],

    // архитекторы
    ['ar-sketch', 'Эскизный проект', 't-arch', null, 0],
    ['ar-board', 'Планшеты и подача', 't-arch', null, 0],
    ['ar-3d', '3D-визуализация', 't-arch', null, 0],
    ['ar-work', 'Рабочие чертежи АР', 't-arch', null, 0],
    ['ar-sup', 'Авторский надзор', 't-arch', null, 0],

    // дизайнеры
    ['di-concept', 'Концепция интерьера', 't-design', null, 0],
    ['di-3d', 'Визуализация интерьера', 't-design', null, 0],
    ['di-work', 'Рабочая документация ДИ', 't-design', null, 0],
    ['di-mat', 'Подбор материалов', 't-design', null, 0],
    ['di-kit', 'Комплектация', 't-design', null, 0],

    // конструкторы
    ['ks-calc', 'Расчёт конструкций', 't-struct', null, 0],
    ['ks-draw', 'Чертежи КР', 't-struct', null, 0],
    ['ks-survey', 'Обследование', 't-struct', null, 0],
    ['ks-node', 'Узлы и детали', 't-struct', null, 0],

    // инженеры
    ['en-water', 'Водоснабжение и канализация', 't-eng', null, 0],
    ['en-hvac', 'Отопление и вентиляция', 't-eng', null, 0],
    ['en-power', 'Электрика', 't-eng', null, 0],
    ['en-weak', 'Слаботочные сети', 't-eng', null, 0],
    ['en-tu', 'Согласование ТУ', 't-eng', null, 0],

    // не по объекту: офис
    ['of-rent', 'Аренда офиса', null, 'Офис', 0],
    ['of-util', 'Коммунальные', null, 'Офис', 0],
    ['of-net', 'Интернет и связь', null, 'Офис', 0],
    ['of-water', 'Вода и напитки', null, 'Офис', 0],
    ['of-house', 'Хозтовары и уборка', null, 'Офис', 0],
    ['of-stat', 'Канцелярия', null, 'Офис', 0],
    ['of-fix', 'Ремонт офиса', null, 'Офис', 0],

    // не по объекту: личное
    ['pr-liv', 'Быт и питание', null, 'Личное', 0],
    ['pr-med', 'Лечение', null, 'Личное', 0],
    ['pr-edu', 'Учёба', null, 'Личное', 0],
    ['pr-gift', 'Подарки', null, 'Личное', 0],

    // не по объекту: транспорт
    ['tr-fuel', 'Топливо', null, 'Транспорт', 0],
    ['tr-taxi', 'Такси', null, 'Транспорт', 0],
    ['tr-fix', 'Ремонт машины', null, 'Транспорт', 0],

    // не по объекту: прочее
    ['ot-oth', 'Другое', null, 'Прочее', 0],
  ]
  const category = db.prepare(
    'INSERT INTO categories (id, name, team_id, group_name, system) VALUES (?, ?, ?, ?, ?)',
  )
  for (const c of categories) category.run(...c)

  const share = db.prepare('INSERT INTO shares (version, person_id, percent, valid_from) VALUES (1, ?, ?, ?)')
  const from = new Date().toISOString().slice(0, 10)
  share.run('p-ilhom', 75, from)
  share.run('p-ulugbek', 15, from)
  share.run('p-dilshod', 10, from)

  // Известны две точки: до 100 000 — 10 %, до 150 000 — 15 %, потолок 40 %.
  // Верхняя ставка — заглушка до ответа на открытый вопрос № 1 из ТЗ.
  const scale = db.prepare('INSERT INTO bonus_scale (version, amount_from, amount_to, rate) VALUES (1, ?, ?, ?)')
  scale.run(0, 10_000_000, 10)
  scale.run(10_000_000, 15_000_000, 15)
  scale.run(15_000_000, null, 20)

  const now = new Date().toISOString()
  const user = db.prepare(
    'INSERT INTO users (id, login, name, role, pass_hash, pass_salt, must_change, phone, person_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, \'\', ?, 1, ?)',
  )
  const accounts: Array<[string, string, string, Role, string | null]> = [
    ['u-owner', 'owner', 'Владелец', 'owner', null],
    ['u-ilhom', 'ilhom', 'Илхом', 'member', 'p-ilhom'],
    ['u-ulugbek', 'ulugbek', 'Улугбек', 'member', 'p-ulugbek'],
    ['u-prorab', 'prorab', 'Прораб', 'foreman', null],
    ['u-buh', 'buh', 'Бухгалтер', 'accountant', null],
  ]
  for (const [id, login, name, role, personId] of accounts) {
    const { hash, salt } = hashPassword(login) // пароль по умолчанию совпадает с логином
    user.run(id, login, name, role, hash, salt, personId, now)
  }

  // Клиент из CRM и команды, которые работают на объекте
  db.prepare(
    `INSERT INTO clients (id, name, phone, phone2, email, source, note, created_at, archived)
     VALUES ('cl-karimov', 'Каримов Бахтиёр Рустамович', '+998 (90) 123-45-67', '', '', 'рекомендация',
             'Пришёл по рекомендации прежнего заказчика', ?, 0)`,
  ).run(now)

  db.prepare(
    `INSERT INTO objects (id, name, customer, client_id, address, contract_amount, currency, rate, basis_type,
      basis_note, bonus_person_id, bonus_rate, shares_version, scale_version, status, created_at)
     VALUES ('obj-restoran', 'Ресторан', 'Каримов Бахтиёр Рустамович', 'cl-karimov', 'Конибодом', 1800000, 'USD', 12000,
      'устно', 'условия согласованы на словах', 'p-ilhom', 10, 1, 1, 'work', ?)`,
  ).run(now)

  // О чём договорились с командами и сколько выделили на первый этап.
  // У архитекторов план расписан на человека целиком, у конструкторов — частью.
  const budget = db.prepare(
    "INSERT INTO object_budgets (object_id, team_id, person_id, amount, note) VALUES ('obj-restoran', ?, ?, ?, '')",
  )
  budget.run('t-arch', '', 200000)
  budget.run('t-arch', 'p-shuhrat', 200000)
  budget.run('t-struct', '', 300000)
  budget.run('t-struct', 'p-parhayot', 200000)
  budget.run('t-design', '', 500000)


  db.prepare('INSERT INTO object_access (object_id, user_id) VALUES (?, ?)').run('obj-restoran', 'u-prorab')
  db.prepare('INSERT INTO object_access (object_id, user_id) VALUES (?, ?)').run('obj-restoran', 'u-ilhom')
  db.prepare('INSERT INTO object_access (object_id, user_id) VALUES (?, ?)').run('obj-restoran', 'u-ulugbek')

  db.prepare(
    `INSERT INTO stages (id, object_id, number, name, amount, status, closed_at)
     VALUES ('st-restoran-1', 'obj-restoran', 1, 'Весь договор', 1800000, 'work', NULL)`,
  ).run()

  // Из плана команд на первый этап выделили часть
  const alloc = db.prepare(
    "INSERT INTO stage_allocations (stage_id, team_id, amount) VALUES ('st-restoran-1', ?, ?)",
  )
  alloc.run('t-arch', 100000)
  alloc.run('t-struct', 150000)
  alloc.run('t-design', 200000)

  type SeedOp = [string, string, Op['kind'], number, string | null, string | null, string, number, string | null, string | null]
  const rows: SeedOp[] = [
    ['op-01', '2026-07-13', 'in', 800000, null, null, 'первый приход от заказчика', 0, null, null],
    ['op-02', '2026-07-13', 'exp', 80000, 'p-ilhom', BONUS_CAT, 'бонус 10 % с прихода 8 000,00', 1, 'op-01', null],
    ['op-03', '2026-07-13', 'exp', 20000, null, 'liv', 'харажат', 0, null, null],
    ['op-04', '2026-07-14', 'exp', 20000, null, 'tnd', 'тендер', 0, null, null],
    ['op-05', '2026-07-15', 'exp', 200000, null, 'rent', 'аренда', 0, null, null],
    ['op-06', '2026-07-16', 'exp', 120000, 'p-shuhrat', 'sub', 'работа архитектора', 0, null, 't-arch'],
    ['op-07', '2026-07-17', 'exp', 40000, 'p-dilmurod', 'agr', 'нозир', 0, null, null],
    ['op-08', '2026-07-18', 'exp', 20000, 'p-parhayot', 'psd', 'смета', 0, null, 't-struct'],
    ['op-09', '2026-07-20', 'exp', 50000, null, 'mkt', 'маркетинг', 0, null, null],
    ['op-10', '2026-07-22', 'exp', 15000, 'p-ulugbek', 'liv', 'харажат Улугбека', 0, null, null],
    ['op-11', '2026-07-23', 'adv', 160000, 'p-ilhom', null, '', 0, null, null],
    ['op-12', '2026-07-24', 'adv', 20000, 'p-ulugbek', null, '', 0, null, null],
    ['op-13', '2026-07-25', 'adv', 50000, 'p-dilshod', null, '', 0, null, null],
  ]
  const op = db.prepare(
    `INSERT INTO operations (id, stage_id, object_id, date, kind, amount, currency, rate, amount_base,
      person_id, category_id, team_id, off_object, note, status, due_date, is_auto, parent_id, reverses_id,
      created_at, created_by, reason)
     VALUES (?, 'st-restoran-1', 'obj-restoran', ?, ?, ?, 'USD', 1, ?, ?, ?, ?, 0, ?, 'ok', NULL, ?, ?, NULL, ?, 'u-owner', '')`,
  )
  for (const [id, date, kind, amount, personId, categoryId, note, isAuto, parentId, teamId] of rows) {
    op.run(id, date, kind, amount, amount, personId, categoryId, teamId, note, isAuto, parentId, `${date}T10:00:00.000Z`)
  }

  // Обещанный платёж: по нему видно, когда человек получит следующие деньги.
  db.prepare(
    `INSERT INTO operations (id, stage_id, object_id, date, kind, amount, currency, rate, amount_base,
      person_id, category_id, team_id, off_object, note, status, due_date, is_auto, parent_id, reverses_id,
      created_at, created_by, reason)
     VALUES ('op-14', 'st-restoran-1', 'obj-restoran', '2026-07-26', 'exp', 80000, 'USD', 1, 80000,
             'p-parhayot', 'sub', 't-struct', 0, 'вторая часть за конструктив', 'promised', '2026-10-05',
             0, NULL, NULL, '2026-07-26T10:00:00.000Z', 'u-owner', '')`,
  ).run()

  // Журнал заполняем и для контрольного примера: иначе история пустая,
  // и непонятно, работает ли она вообще.
  const stmt = db.prepare(
    'INSERT INTO audit_log (at, user_id, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const log = (at: string, entity: string, entityId: string, action: string, details: unknown) =>
    stmt.run(at, 'u-owner', entity, entityId, action, JSON.stringify(details))

  // Объект и этап заведены до первой операции — иначе история читается задом наперёд.
  const openedAt = '2026-07-12T09:00:00.000Z'
  log(openedAt, 'object', 'obj-restoran', 'create',
    { name: 'Ресторан', contractAmount: 1800000, bonusRate: 10, sharesVersion: 1, scaleVersion: 1 })
  log(openedAt, 'object', 'obj-restoran', 'access', { userIds: ['u-prorab', 'u-ilhom', 'u-ulugbek'] })
  log('2026-07-12T09:05:00.000Z', 'stage', 'st-restoran-1', 'create',
    { objectId: 'obj-restoran', number: 1, amount: 1800000 })
  for (const [id, date, kind, amount, , , , isAuto] of rows) {
    log(`${date}T10:00:00.000Z`, 'operation', id, isAuto ? 'auto-bonus' : 'create',
      isAuto ? { parent: 'op-01', amount } : { kind, amount, currency: 'USD', date, status: 'ok' })
  }
}
