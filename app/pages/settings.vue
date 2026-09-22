<script setup lang="ts">
import { MAX_BONUS_RATE, categoryGroups, parseRate, settingsProblems, type Category, type Person, type ScaleRow, type Settings, type Share } from '#shared/calc'
import { ROLE_NAME, type Role } from '#shared/roles'
import { MASKS } from '#shared/mask'

const { state, settings, send, refresh } = useFinance()
const { ask, notice } = useAsk()
const { t } = useT()
const err = useErr()

/** Правится копия: до нажатия «Сохранить» ничего не улетает на сервер. */
type DraftTeam = { id: string; name: string; composite: boolean; parts: string[] }
type Draft = Pick<Settings, 'currency' | 'displayRate' | 'people' | 'categories' | 'shares' | 'bonusScale'>
  & { teams: DraftTeam[] }
const draft = ref<Draft>(snapshot())
const message = reactive({ text: '', bad: false })
const busy = ref(false)

function snapshot(): Draft {
  const s = settings.value
  return JSON.parse(JSON.stringify({
    currency: s.currency,
    displayRate: s.displayRate,
    people: s.people,
    categories: s.categories,
    shares: s.shares,
    bonusScale: s.bonusScale,
    teams: state.value.teams.map(x => ({ id: x.id, name: x.name, composite: x.composite, parts: [...x.parts] })),
  })) as Draft
}

watch(settings, () => {
  if (!busy.value) draft.value = snapshot()
})

/** В полях лежат строки с запятой — к числам приводим в одном месте. */
const num = (v: unknown) => parseRate(v) ?? 0

const normalized = computed(() => ({
  ...draft.value,
  displayRate: num(draft.value.displayRate),
  shares: draft.value.shares.map(s => ({ ...s, percent: num(s.percent) })),
  bonusScale: draft.value.bonusScale.map(r => ({ ...r, rate: num(r.rate) })),
}))

const percentSum = computed(() => normalized.value.shares.reduce((a, s) => a + s.percent, 0))
const problems = computed(() => settingsProblems(normalized.value))

const newId = (prefix: string) =>
  `${prefix}-${(globalThis.crypto?.randomUUID?.() ?? String(Date.now())).replace(/-/g, '').slice(0, 10)}`

function addTeam() {
  draft.value.teams.push({ id: newId('t'), name: '', composite: false, parts: [] })
}

function removeTeam(id: string) {
  draft.value.teams = draft.value.teams.filter(t => t.id !== id)
  for (const t of draft.value.teams) t.parts = t.parts.filter(x => x !== id)
}

/** Состав мультикоманды собирается из обычных направлений. */
function togglePart(team: DraftTeam, partId: string) {
  team.parts = team.parts.includes(partId)
    ? team.parts.filter(x => x !== partId)
    : [...team.parts, partId]
}

const simpleTeams = computed(() => draft.value.teams.filter(t => !t.composite))

function addPerson() {
  draft.value.people.push({ id: newId('p'), name: '', role: '', phone: '', teamId: null, isSharer: false } as Person)
}

function removePerson(id: string) {
  draft.value.people = draft.value.people.filter(p => p.id !== id)
  draft.value.shares = draft.value.shares.filter(s => s.personId !== id)
}

function addShare() {
  const free = draft.value.people.find(p => !draft.value.shares.some(s => s.personId === p.id))
  if (!free) return
  draft.value.shares.push({ personId: free.id, percent: 0 } as Share)
}

function addScale() {
  const last = draft.value.bonusScale.at(-1)
  draft.value.bonusScale.push({ from: last?.to ?? 0, to: null, rate: 10 } as ScaleRow)
}

async function addCategory() {
  const name = await ask({ title: t('Новая категория'), label: t('Название') })
  if (!name) return
  draft.value.categories.push(
    { id: newId('c'), name, teamId: null, group: null, system: false, archived: false } as Category,
  )
}

/* ---------- где показывать категорию ---------- */

/** Область одной строкой: пусто — общая, t:… — команда, g:… — группа. */
const scopeOf = (c: Category) => (c.teamId ? `t:${c.teamId}` : c.group ? `g:${c.group}` : '')

const catGroups = computed(() => categoryGroups(draft.value.categories))

/** Категории разложены по месту: общие, по командам, по группам вне объекта. */
const catSections = computed(() => {
  const list = draft.value.categories
  const out = [{ key: '', title: t('Везде по объекту'), rows: list.filter(c => !c.teamId && !c.group) }]
  for (const team of draft.value.teams) {
    out.push({ key: `t:${team.id}`, title: team.name || t('без названия'), rows: list.filter(c => c.teamId === team.id) })
  }
  for (const g of catGroups.value) {
    out.push({ key: `g:${g}`, title: `${t('Не по объекту')} · ${t(g)}`, rows: list.filter(c => c.group === g) })
  }
  return out.filter(x => x.rows.length)
})

async function setScope(c: Category, value: string) {
  if (value === 'new') {
    const name = await ask({ title: t('Новая группа расходов'), label: t('Название') })
    if (!name) return
    c.teamId = null
    c.group = name
    return
  }
  c.teamId = value.startsWith('t:') ? value.slice(2) : null
  c.group = value.startsWith('g:') ? value.slice(2) : null
}

/** Границы шкалы вводятся в валюте, храним в центах. Поле привязано
 *  односторонне, поэтому маску накладываем сами. */
function scaleValue(index: number, field: 'from' | 'to'): string {
  const v = draft.value.bonusScale[index]?.[field]
  return v == null ? '' : MASKS.money(String(v / 100))
}

function setScale(index: number, field: 'from' | 'to', raw: string) {
  const row = draft.value.bonusScale[index]
  if (!row) return
  if (field === 'to' && raw.trim() === '') {
    row.to = null
    return
  }
  const n = Number(raw.replace(/[\s ]/g, '').replace(',', '.'))
  row[field] = Number.isFinite(n) ? Math.round(n * 100) : 0
}

async function save() {
  message.text = ''
  if (draft.value.teams.some(t => !t.name.trim())) {
    message.bad = true
    message.text = t('У команды без названия карточки не будет.')
    return
  }
  if (draft.value.people.some(p => !p.name.trim())) {
    message.bad = true
    message.text = t('У человека без имени карточки не будет.')
    return
  }
  if (problems.value.length) {
    message.bad = true
    message.text = problems.value.map(p => t(p.text, p.params)).join(' ')
    return
  }

  busy.value = true
  try {
    const res = await send<{ newShareVersion: boolean; newScaleVersion: boolean; sharesVersion: number }>(
      '/api/settings',
      { method: 'PUT', body: normalized.value },
    )
    message.bad = false
    message.text = res.newShareVersion
      ? t('Сохранено. Доли получили версию {version} — существующие объекты остались на прежней.', { version: res.sharesVersion })
      : t('Сохранено.')
  } catch (e) {
    message.bad = true
    message.text = err(e)
  } finally {
    busy.value = false
    draft.value = snapshot()
  }
}

async function reset() {
  await refresh()
  draft.value = snapshot()
  message.text = ''
}

/* ---------- пользователи ---------- */

const users = computed(() => state.value.users)
const showUser = ref(false)
const userForm = reactive({ id: '', login: '', name: '', role: 'foreman' as Role, personId: '', password: '' })
const userError = ref('')

function openUser(id?: string) {
  const u = users.value.find(x => x.id === id)
  Object.assign(userForm, {
    id: u?.id ?? '',
    login: u?.login ?? '',
    name: u?.name ?? '',
    role: u?.role ?? 'foreman',
    personId: u?.personId ?? '',
    password: '',
  })
  userError.value = ''
  showUser.value = true
}

async function saveUser() {
  userError.value = ''
  if (!userForm.name.trim()) return (userError.value = t('Укажите имя'))
  if (!userForm.id && !/^[a-z0-9_.-]+$/.test(userForm.login)) {
    return (userError.value = t('Логин: латиница, цифры, точка, дефис, подчёркивание'))
  }
  if (!userForm.id && userForm.password.length < 8) return (userError.value = t('Пароль — не короче 8 символов'))

  try {
    await send('/api/users', {
      method: 'POST',
      body: {
        id: userForm.id || undefined,
        login: userForm.login,
        name: userForm.name,
        role: userForm.role,
        personId: userForm.personId || null,
        password: userForm.password || undefined,
      },
    })
    showUser.value = false
    await notice(
      t('Готово'),
      userForm.id ? t('Пользователь обновлён.') : t('Пользователь создан. Первый вход потребует смены пароля.'),
    )
  } catch (e) {
    userError.value = err(e)
  }
}

async function disableUser(id: string, name: string) {
  const go = await ask({
    title: t('Отключить доступ'),
    body: t('{name} больше не сможет войти. Записи остаются на месте.', { name }),
  })
  if (!go) return
  try {
    await send('/api/users', { method: 'POST', body: { id, active: false } })
  } catch (e) {
    await notice(t('Не получилось'), err(e))
  }
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Справочники') }}</h1>
        <p class="sub">
          {{ t('Правка долей и шкалы создаёт новую версию: существующие объекты остаются на своей, пересчёта задним числом не происходит.') }}
        </p>
      </div>
    </div>

    <section class="sect">
      <div class="sect-head">
        <h2>{{ t('Команды') }}</h2>
        <button type="button" class="btn sm tonal" @click="addTeam">
          <Icon name="ph:plus" />{{ t('Добавить команду') }}
        </button>
      </div>
      <div class="panel">
        <p class="hint" style="margin-bottom: 12px">
          {{ t('Команда — это направление работ: архитекторы, дизайнеры, конструкторы, инженерные сети. Мультикоманда собирается из направлений: один исполнитель закрывает несколько сразу.') }}
        </p>

        <div v-for="team in draft.teams" :key="team.id" class="team-row">
          <input v-model="team.name" :placeholder="t('Название команды')" :aria-label="t('Название команды')">
          <label class="check">
            <input v-model="team.composite" type="checkbox">
            {{ t('мультикоманда') }}
          </label>
          <button type="button" class="x" :title="t('Убрать')" @click="removeTeam(team.id)">
            <Icon name="ph:trash" />
          </button>
          <div v-if="team.composite" class="chips" style="grid-column: 1 / -1">
            <button
              v-for="part in simpleTeams"
              :key="part.id"
              type="button"
              :aria-pressed="team.parts.includes(part.id)"
              @click="togglePart(team, part.id)"
            >
              <Icon v-if="team.parts.includes(part.id)" name="ph:check" />
              {{ part.name || t('без названия') }}
            </button>
            <span v-if="!simpleTeams.length" class="hint">{{ t('Сначала заведите обычные направления.') }}</span>
          </div>
        </div>

        <button v-if="!draft.teams.length" type="button" class="btn sm tonal" @click="addTeam">
          <Icon name="ph:plus" />{{ t('Добавить команду') }}
        </button>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Люди') }}</h2>
      <div class="panel">
        <p class="hint" style="margin-bottom: 12px">
          {{ t('Команда у человека решает, кого предложат при расходе: выбрали дизайнеров — архитектор в списке не появится.') }}
        </p>
        <div v-for="p in draft.people" :key="p.id" class="setrow person">
          <input v-model="p.name" :placeholder="t('Имя')" :aria-label="t('Имя')">
          <input v-model="p.role" :placeholder="t('роль: подрядчик, нозир…')" :aria-label="t('Роль')">
          <select v-model="p.teamId" :aria-label="t('Команда')">
            <option :value="null">{{ t('— без команды —') }}</option>
            <option v-for="team in draft.teams" :key="team.id" :value="team.id">
              {{ team.name || t('без названия') }}
            </option>
          </select>
          <input v-model="p.phone" v-mask="'phone'" placeholder="+998 (__) ___-__-__" :aria-label="t('Телефон')" inputmode="tel">
          <label class="check" style="font-size: 12.5px">
            <input v-model="p.isSharer" type="checkbox">
            {{ t('делит') }}
          </label>
          <button type="button" class="x" :title="t('Убрать')" @click="removePerson(p.id)"><Icon name="ph:trash" /></button>
        </div>
        <button type="button" class="btn sm tonal" @click="addPerson"><Icon name="ph:plus" />{{ t('Добавить человека') }}</button>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Доли участников') }}</h2>
      <div class="panel">
        <div v-for="(s, i) in draft.shares" :key="i" class="setrow two">
          <select v-model="s.personId" :aria-label="t('Участник')">
            <option v-for="p in draft.people" :key="p.id" :value="p.id">{{ p.name || t('без имени') }}</option>
          </select>
          <input v-model="s.percent" v-mask="'percent'" class="num" inputmode="decimal" :aria-label="t('Процент')">
          <button type="button" class="x" :title="t('Убрать')" @click="draft.shares.splice(i, 1)"><Icon name="ph:trash" /></button>
        </div>
        <p class="hint">
          {{ t('Сумма процентов: {sum}. Набор с суммой не 100 не сохраняется. Текущая версия — {version}.', {
            sum: `${percentSum} %`,
            version: settings.sharesVersion,
          }) }}
        </p>
        <div style="margin-top: 10px">
          <button type="button" class="btn sm tonal" @click="addShare"><Icon name="ph:plus" />{{ t('Добавить долю') }}</button>
        </div>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Шкала бонусов') }}</h2>
      <div class="panel">
        <div class="setrow3">
          <label>{{ t('Сумма от') }}</label><label>{{ t('до') }}</label><label>{{ t('Ставка %') }}</label><span />
        </div>
        <div v-for="(r, i) in draft.bonusScale" :key="i" class="setrow3">
          <input
            v-mask="'money'"
            class="num" inputmode="decimal" :aria-label="t('Сумма от')"
            :value="scaleValue(i, 'from')"
            @input="setScale(i, 'from', ($event.target as HTMLInputElement).value)"
          >
          <input
            v-mask="'money'"
            class="num" inputmode="decimal" :placeholder="t('и выше')" :aria-label="t('до')"
            :value="scaleValue(i, 'to')"
            @input="setScale(i, 'to', ($event.target as HTMLInputElement).value)"
          >
          <input v-model="r.rate" v-mask="'percent'" class="num" inputmode="decimal" :aria-label="t('Ставка %')">
          <button type="button" class="x" :title="t('Убрать')" @click="draft.bonusScale.splice(i, 1)"><Icon name="ph:trash" /></button>
        </div>
        <p class="hint">
          {{ t('Потолок ставки — {max} %. Диапазоны должны идти встык, без разрывов. Текущая версия — {version}.', {
            max: MAX_BONUS_RATE,
            version: settings.scaleVersion,
          }) }}
        </p>
        <div style="margin-top: 10px">
          <button type="button" class="btn sm tonal" @click="addScale"><Icon name="ph:plus" />{{ t('Добавить диапазон') }}</button>
        </div>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Курс для показа') }}</h2>
      <div class="panel">
        <div class="setrow two">
          <label class="check" style="text-transform: none; letter-spacing: 0">
            {{ t('Сколько сумов за один доллар') }}
          </label>
          <input v-model="draft.displayRate" v-mask="'money'" class="num" inputmode="decimal" :aria-label="t('Курс для показа')">
          <span />
        </div>
        <p class="hint">
          {{ t('Переключатель USD / SUM в шапке пересчитывает суммы по этому курсу. Это только для показа: учёт ведётся в валюте объекта, а курс операции вводится отдельно.') }}
        </p>
      </div>
    </section>

    <section class="sect">
      <h2>{{ t('Категории расходов') }}</h2>
      <div class="panel">
        <p class="hint" style="margin-bottom: 12px">
          {{ t('Категория показывается там, где нужна: у своей команды, в своей группе расходов не по объекту или везде по объекту.') }}
        </p>

        <details v-for="sect in catSections" :key="sect.key" class="more">
          <summary>
            <Icon name="ph:caret-down" />
            {{ sect.title }} · {{ sect.rows.length }}
          </summary>
          <div class="more-b">
            <div v-for="c in sect.rows" :key="c.id" class="setrow cat">
              <input v-model="c.name" :disabled="c.system" :aria-label="t('Название')">
              <select
                :value="scopeOf(c)"
                :aria-label="t('Где показывать')"
                @change="setScope(c, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ t('везде по объекту') }}</option>
                <optgroup :label="t('Команда')">
                  <option v-for="team in draft.teams" :key="team.id" :value="`t:${team.id}`">
                    {{ team.name || t('без названия') }}
                  </option>
                </optgroup>
                <optgroup :label="t('Не по объекту')">
                  <option v-for="g in catGroups" :key="g" :value="`g:${g}`">{{ t(g) }}</option>
                  <option value="new">{{ t('+ новая группа') }}</option>
                </optgroup>
              </select>
              <button
                type="button"
                class="x"
                :disabled="c.system"
                :title="c.system ? t('системная категория') : t('Убрать')"
                @click="draft.categories = draft.categories.filter(x => x.id !== c.id)"
              >
                <Icon :name="c.system ? 'ph:lock-simple' : 'ph:trash'" />
              </button>
            </div>
          </div>
        </details>

        <button type="button" class="btn sm tonal" @click="addCategory">
          <Icon name="ph:plus" />{{ t('Добавить категорию') }}
        </button>
      </div>
    </section>

    <div v-if="problems.length" class="note r">
      <Icon name="ph:warning" />
      <div>
        <b>{{ t('Не сохранится') }}</b>
        <ul><li v-for="p in problems" :key="p.text">{{ t(p.text, p.params) }}</li></ul>
      </div>
    </div>

    <div class="acts" style="justify-content: flex-start; align-items: center; margin-bottom: 30px">
      <button type="button" class="btn pri" :disabled="busy" @click="save">
        <Icon name="ph:check" />{{ t('Сохранить справочники') }}
      </button>
      <button type="button" class="btn ghost" @click="reset">
        <Icon name="ph:arrow-counter-clockwise" />{{ t('Отменить правки') }}
      </button>
      <span :class="message.bad ? 'err' : 'ok'">{{ message.text }}</span>
    </div>

    <section class="sect">
      <div class="sect-head">
        <h2>{{ t('Пользователи и права') }}</h2>
        <button type="button" class="btn sm tonal" @click="openUser()"><Icon name="ph:plus" />{{ t('Добавить') }}</button>
      </div>

      <div class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Имя') }}</th>
              <th>{{ t('Логин') }}</th>
              <th>{{ t('Роль') }}</th>
              <th>{{ t('Карточка человека') }}</th>
              <th>{{ t('Объектов') }}</th>
              <th class="no-print" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td class="desc"><b>{{ u.name }}</b></td>
              <td :data-label="t('Логин')" class="mono">{{ u.login }}</td>
              <td :data-label="t('Роль')">{{ t(ROLE_NAME[u.role]) }}</td>
              <td :data-label="t('Карточка человека')">
                {{ draft.people.find(p => p.id === u.personId)?.name ?? '—' }}
              </td>
              <td :data-label="t('Объектов')">
                {{ u.role === 'owner' || u.role === 'accountant' ? t('все') : u.objectIds.length }}
              </td>
              <td class="act no-print">
                <button type="button" class="btn sm" @click="openUser(u.id)">
                  <Icon name="ph:pencil-simple" />{{ t('Изменить') }}
                </button>
                <button type="button" class="btn sm danger" @click="disableUser(u.id, u.name)">
                  <Icon name="ph:prohibit" />{{ t('Отключить') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint" style="margin-top: 10px">{{ t('Доступ к конкретным объектам назначается в карточке объекта.') }}</p>
    </section>

    <AppDialog
      :open="showUser"
      :title="userForm.id ? t('Пользователь') : t('Новый пользователь')"
      icon="ph:identification-card"
      @close="showUser = false"
    >
      <div class="row2">
        <div class="f">
          <label for="u-name">{{ t('Имя') }}</label>
          <input id="u-name" v-model="userForm.name">
        </div>
        <div class="f">
          <label for="u-login">{{ t('Логин') }}</label>
          <input
            id="u-login"
            v-model="userForm.login"
            v-mask="'login'"
            :disabled="!!userForm.id"
            autocapitalize="none"
            spellcheck="false"
          >
        </div>
      </div>
      <div class="row2">
        <div class="f">
          <label for="u-role">{{ t('Роль') }}</label>
          <select id="u-role" v-model="userForm.role">
            <option v-for="(name, role) in ROLE_NAME" :key="role" :value="role">{{ t(name) }}</option>
          </select>
        </div>
        <div class="f">
          <label for="u-person">{{ t('Карточка человека') }}</label>
          <select id="u-person" v-model="userForm.personId">
            <option value="">{{ t('— не связан —') }}</option>
            <option v-for="p in draft.people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>
      <div class="f">
        <label for="u-pass">{{ userForm.id ? t('Новый пароль (необязательно)') : t('Пароль') }}</label>
        <input id="u-pass" v-model="userForm.password" type="password" autocomplete="new-password">
      </div>
      <p class="hint">{{ t('Участнику нужна карточка человека — по ней он видит свою долю. Прорабу она не обязательна.') }}</p>
      <p v-if="userError" class="err">{{ userError }}</p>
      <div class="acts">
        <button type="button" class="btn ghost" @click="showUser = false">{{ t('Отмена') }}</button>
        <button type="button" class="btn pri" @click="saveUser"><Icon name="ph:check" />{{ t('Сохранить') }}</button>
      </div>
    </AppDialog>
  </div>
</template>
