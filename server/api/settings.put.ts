import { BONUS_CAT, settingsProblems, type Category, type Person, type ScaleRow, type Share } from '#shared/calc'

/**
 * Справочники: люди, категории, доли, шкала бонусов.
 *
 * Доли и шкала версионные: правка создаёт новую версию, а существующие
 * объекты остаются на своей — пересчёта задним числом не происходит.
 * Люди и категории не удаляются, а помечаются архивными: на них ссылаются
 * уже проведённые операции.
 */
export default defineEventHandler(async (event) => {
  const user = requireAbility(event, 'manage')
  const body = await readBody<{
    currency?: string
    displayRate?: number
    people: Person[]
    categories: Category[]
    shares: Share[]
    bonusScale: ScaleRow[]
    teams?: Array<{ id: string; name: string; composite?: boolean; parts?: string[] }>
  }>(event)

  const teams = (body.teams ?? []).map(t => ({
    id: text(t.id, 'команда: id', { required: true, max: 64 }),
    name: text(t.name, 'команда: название', { required: true, max: 120 }),
    composite: !!t.composite,
    parts: (t.parts ?? []).map(x => text(x, 'команда: состав', { required: true, max: 64 })),
  }))
  must(new Set(teams.map(t => t.id)).size === teams.length, 'Повторяющиеся идентификаторы команд')
  must(
    teams.every(t => t.parts.every(x => teams.some(o => o.id === x && !o.composite))),
    'В составе мультикоманды указано направление, которого нет в списке',
  )

  const people = (body.people ?? []).map(p => ({
    id: text(p.id, 'человек: id', { required: true, max: 64 }),
    name: text(p.name, 'человек: имя', { required: true, max: 120 }),
    role: text(p.role, 'человек: роль', { max: 60 }),
    phone: text(p.phone, 'человек: телефон', { max: 40 }),
    teamId: p.teamId ? text(p.teamId, 'человек: команда', { max: 64 }) : null,
    isSharer: !!p.isSharer,
  }))
  must(new Set(people.map(p => p.id)).size === people.length, 'Повторяющиеся идентификаторы людей')
  must(
    people.every(p => !p.teamId || teams.some(t => t.id === p.teamId)),
    'Команда не найдена в справочнике',
  )

  const categories = (body.categories ?? []).map(c => ({
    id: text(c.id, 'категория: id', { required: true, max: 64 }),
    name: text(c.name, 'категория: название', { required: true, max: 120 }),
    teamId: c.teamId ? text(c.teamId, 'категория: команда', { max: 64 }) : null,
    group: c.group ? text(c.group, 'категория: группа', { max: 60 }) : null,
    system: c.id === BONUS_CAT,
  }))
  must(categories.some(c => c.id === BONUS_CAT), 'Системную категорию «Бонус» удалить нельзя')
  must(new Set(categories.map(c => c.id)).size === categories.length, 'Повторяющиеся идентификаторы категорий')
  must(
    categories.every(c => !(c.teamId && c.group)),
    'Категория относится либо к команде, либо к группе расходов не по объекту',
  )
  must(
    categories.every(c => !c.teamId || teams.some(t => t.id === c.teamId)),
    'Команда не найдена в справочнике',
  )

  const shares = (body.shares ?? []).map(s => ({
    personId: text(s.personId, 'доля: участник', { required: true }),
    percent: Number(s.percent),
  }))
  must(shares.every(s => Number.isFinite(s.percent) && s.percent >= 0), 'Процент доли указан неверно')
  must(shares.every(s => people.some(p => p.id === s.personId)), 'В долях указан человек, которого нет в справочнике')
  must(new Set(shares.map(s => s.personId)).size === shares.length, 'Один человек указан в долях дважды')

  const bonusScale = (body.bonusScale ?? []).map(r => ({
    from: cents(r.from, 'шкала: нижняя граница', { positive: false }),
    to: r.to == null ? null : cents(r.to, 'шкала: верхняя граница', { positive: false }),
    rate: Number(r.rate),
  })).sort((a, b) => a.from - b.from)
  must(bonusScale.every(r => Number.isFinite(r.rate) && r.rate >= 0), 'Ставка в шкале указана неверно')

  const problems = settingsProblems({ shares, bonusScale })
  if (problems.length) bad(problems[0]!.text, problems[0]!.params)

  return tx(() => {
    const db = useDb()
    const now = new Date().toISOString()

    if (body.currency) setMeta('currency', text(body.currency, 'валюта', { max: 3 }).toUpperCase())
    if (body.displayRate != null) {
      const shown = Number(body.displayRate)
      must(Number.isFinite(shown) && shown > 0, 'Курс показа должен быть больше нуля')
      setMeta('display_rate', String(shown))
    }

    // Люди: добавить, обновить, снятых с учёта пометить архивными.
    const keepPeople = new Set(people.map(p => p.id))
    db.prepare('UPDATE people SET archived = 1').run()
    const upsertPerson = db.prepare(
      `INSERT INTO people (id, name, role, phone, team_id, is_sharer, archived) VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, phone = excluded.phone,
         team_id = excluded.team_id, is_sharer = excluded.is_sharer, archived = 0`,
    )
    for (const p of people) upsertPerson.run(p.id, p.name, p.role, p.phone, p.teamId, p.isSharer ? 1 : 0)
    must(keepPeople.size === people.length, 'Список людей повреждён')

    // Команды: обновляем состав, снятые с учёта уходят в архив.
    if (body.teams) {
      db.prepare('UPDATE teams SET archived = 1').run()
      const upsertTeam = db.prepare(
        `INSERT INTO teams (id, name, composite, archived) VALUES (?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, composite = excluded.composite, archived = 0`,
      )
      const dropParts = db.prepare('DELETE FROM team_parts WHERE team_id = ?')
      const addPart = db.prepare('INSERT INTO team_parts (team_id, part_team_id) VALUES (?, ?)')
      for (const t of teams) {
        upsertTeam.run(t.id, t.name, t.composite ? 1 : 0)
        dropParts.run(t.id)
        if (t.composite) for (const x of t.parts) addPart.run(t.id, x)
      }
    }

    db.prepare('UPDATE categories SET archived = 1').run()
    const upsertCategory = db.prepare(
      `INSERT INTO categories (id, name, team_id, group_name, system, archived) VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, team_id = excluded.team_id,
         group_name = excluded.group_name, system = excluded.system, archived = 0`,
    )
    for (const c of categories) upsertCategory.run(c.id, c.name, c.teamId, c.group, c.system ? 1 : 0)

    // Доли: новая версия, только если набор действительно изменился.
    const sharesVersion = currentSharesVersion()
    const sameShares = fingerprint(sharesOfVersion(sharesVersion)) === fingerprint(shares)
    let nextShares = sharesVersion
    if (!sameShares) {
      nextShares = sharesVersion + 1
      const insert = db.prepare('INSERT INTO shares (version, person_id, percent, valid_from) VALUES (?, ?, ?, ?)')
      for (const s of shares) insert.run(nextShares, s.personId, s.percent, now.slice(0, 10))
      setMeta('shares_version', String(nextShares))
      audit('shares', String(nextShares), 'version', { shares }, user.id)
    }

    const scaleVersion = currentScaleVersion()
    const sameScale = fingerprint(scaleOfVersion(scaleVersion)) === fingerprint(bonusScale)
    let nextScale = scaleVersion
    if (!sameScale) {
      nextScale = scaleVersion + 1
      const insert = db.prepare('INSERT INTO bonus_scale (version, amount_from, amount_to, rate) VALUES (?, ?, ?, ?)')
      for (const r of bonusScale) insert.run(nextScale, r.from, r.to, r.rate)
      setMeta('scale_version', String(nextScale))
      audit('bonus_scale', String(nextScale), 'version', { bonusScale }, user.id)
    }

    audit('settings', 'main', 'update', { people: people.length, categories: categories.length }, user.id)
    return { ok: true, sharesVersion: nextShares, scaleVersion: nextScale, newShareVersion: !sameShares, newScaleVersion: !sameScale }
  })
})

/** Отпечаток набора — чтобы не плодить версии при сохранении без изменений. */
function fingerprint(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify(rows.map(r => Object.entries(r).sort(([a], [b]) => a.localeCompare(b))).sort())
}
