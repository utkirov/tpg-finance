<script setup lang="ts">
import { advancesOf, dmy, today, totalsOf } from '#shared/calc'

/** Акт сверки по каждому участнику — печатная форма с местом для подписи. */
const route = useRoute()
const { state, stageById, objectById, personName } = useFinance()
const { t } = useT()

const stage = computed(() => stageById(String(route.params.id)))
const object = computed(() => (stage.value ? objectById(stage.value.objectId) : null))
const { m, label } = useMoney(() => object.value?.currency)
const totals = computed(() => (stage.value ? totalsOf(state.value, stage.value.id) : null))

const acts = computed(() =>
  (totals.value?.parts ?? []).map(part => ({
    part,
    name: personName(part.personId),
    advances: stage.value ? advancesOf(state.value.ops, stage.value.id, part.personId) : [],
  })))

const print = () => window.print()
</script>

<template>
  <div v-if="stage && object && totals">
    <div class="head-row no-print">
      <div>
        <h1>{{ t('Акты сверки') }}</h1>
        <p class="sub">
          {{ t('{object} · этап {number} · по одному листу на участника', { object: object.name, number: stage.number }) }}
        </p>
      </div>
      <div class="acts">
        <NuxtLink class="btn" :to="`/stages/${stage.id}`">
          <Icon name="ph:arrow-left" />{{ t('К этапу') }}
        </NuxtLink>
        <button type="button" class="btn pri" @click="print">
          <Icon name="ph:printer" />{{ t('Печать') }}
        </button>
      </div>
    </div>

    <div v-if="!acts.length" class="empty">
      <Icon name="ph:file-text" />
      <p>{{ t('Доли не настроены — печатать нечего.') }}</p>
    </div>

    <article
      v-for="(act, i) in acts"
      :key="act.part.personId"
      class="panel"
      :class="{ 'page-break': i < acts.length - 1 }"
      style="margin-bottom: 18px"
    >
      <h3 style="font-size: 17px">{{ t('Акт сверки · {name}', { name: act.name }) }}</h3>
      <p class="hint" style="margin-bottom: 14px">
        {{ t('Объект «{object}»', { object: object.name }) }}<template v-if="object.address">, {{ object.address }}</template>.
        {{ t('Этап') }} {{ stage.number }}<template v-if="stage.name"> — {{ stage.name }}</template>,
        {{ t('сумма этапа {amount} {currency}', { amount: m(stage.amount), currency: label }) }}.
        {{ t('Дата составления {date}.', { date: dmy(today()) }) }}
      </p>

      <div class="tw" style="margin-bottom: 14px">
        <table>
          <tbody>
            <tr><td>{{ t('Расходы этапа') }}</td><td class="n">{{ m(totals.exp) }}</td></tr>
            <tr><td>{{ t('Чистая доля этапа') }}</td><td class="n">{{ m(totals.net) }}</td></tr>
            <tr>
              <td>{{ t('Доля участника, {percent} %', { percent: act.part.percent }) }}</td>
              <td class="n">{{ m(act.part.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{{ t('Выданные авансы') }}</h2>
      <div class="tw" style="margin-bottom: 14px">
        <table>
          <thead>
            <tr><th>{{ t('Дата') }}</th><th>{{ t('Комментарий') }}</th><th class="n">{{ t('Сумма') }}</th></tr>
          </thead>
          <tbody>
            <tr v-if="!act.advances.length"><td colspan="3" class="dim">{{ t('Авансов не выдавалось.') }}</td></tr>
            <tr v-for="a in act.advances" :key="a.id">
              <td class="n">{{ dmy(a.date) }}</td>
              <td>{{ a.note || '—' }}</td>
              <td class="n">{{ m(a.amountBase) }}</td>
            </tr>
            <tr v-if="act.advances.length" class="tot">
              <td colspan="2">{{ t('Выдано всего') }}</td>
              <td class="n">{{ m(act.part.paid) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="note p" style="margin-bottom: 0">
        <Icon name="ph:wallet" />
        <div>
          <b>{{ t('К доплате') }}</b>
        <span class="num" style="font-size: 18px; font-weight: 600">
            {{ m(act.part.due) }} {{ label }}
          </span>
        </div>
      </div>

      <div class="sign">
        <div>{{ t('Владелец — подпись, дата') }}</div>
        <div>{{ t('{name} — подпись, дата', { name: act.name }) }}</div>
      </div>
    </article>
  </div>

  <div v-else class="empty">
    <Icon name="ph:tray" />
    <p>{{ t('Этап не найден.') }}</p>
    <NuxtLink to="/" class="btn"><Icon name="ph:arrow-left" />{{ t('К списку объектов') }}</NuxtLink>
  </div>
</template>
