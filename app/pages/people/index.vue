<script setup lang="ts">
import { dmy } from '#shared/calc'
import { personPlan } from '#shared/plan'

/** Люди разложены по командам: архитекторы, дизайнеры, конструкторы, инженеры. */
const { state } = useFinance()
const { t } = useT()
const { m } = useMoney()
const router = useRouter()

const rows = computed(() =>
  state.value.settings.people.map(p => ({ p, plan: personPlan(state.value, p.id) })))

const groups = computed(() => {
  const out = state.value.teams.map(team => ({
    id: team.id,
    name: team.name,
    icon: team.composite ? 'ph:users-four' : 'ph:users-three',
    rows: rows.value.filter(r => r.p.teamId === team.id),
  }))
  out.push({
    id: '',
    name: t('Без команды'),
    icon: 'ph:user',
    rows: rows.value.filter(r => !r.p.teamId),
  })
  return out.filter(g => g.rows.length)
})

const when = (plan: { left: number; next: { dueDate: string | null; stageNumber: number | null } | null }) => {
  if (plan.next?.dueDate) return dmy(plan.next.dueDate)
  if (plan.next?.stageNumber != null) return t('после этапа {n}', { n: plan.next.stageNumber })
  return plan.left > 0 ? t('срок не назначен') : '—'
}
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1>{{ t('Люди') }}</h1>
        <p class="sub">{{ t('По командам. Видно, сколько человек получил и сколько ему ещё должны.') }}</p>
      </div>
    </div>

    <div v-if="!groups.length" class="empty">
      <Icon name="ph:users-three" />
      <p>{{ t('Людей нет. Заведите их в справочниках — на них ссылаются авансы, бонусы и расходы.') }}</p>
      <NuxtLink to="/settings" class="btn"><Icon name="ph:gear-six" />{{ t('К справочникам') }}</NuxtLink>
    </div>

    <section v-for="g in groups" :key="g.id" class="sect">
      <h2><Icon :name="g.icon" />{{ g.name }}</h2>
      <div class="tw">
        <table class="stack">
          <thead>
            <tr>
              <th>{{ t('Человек') }}</th>
              <th class="n">{{ t('Причитается') }}</th>
              <th class="n">{{ t('Получено') }}</th>
              <th class="n">{{ t('Осталось') }}</th>
              <th>{{ t('Следующий платёж') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ p, plan } in g.rows" :key="p.id" class="click" @click="router.push(`/people/${p.id}`)">
              <td class="desc">
                <b>{{ p.name }}</b>
                <small>
                  {{ p.role ? t(p.role) : '—' }}
                  <template v-if="p.isSharer"> · {{ t('участник дележа') }}</template>
                </small>
              </td>
              <td class="n" :data-label="t('Причитается')">{{ m(plan.expected) }}</td>
              <td class="n" :data-label="t('Получено')">{{ m(plan.paid) }}</td>
              <td class="n" :data-label="t('Осталось')" :class="{ acc: plan.left > 0 }">{{ m(plan.left) }}</td>
              <td :data-label="t('Следующий платёж')">{{ when(plan) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
