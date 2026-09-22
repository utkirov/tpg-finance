import { MASKS, caretAfter, significant, type MaskName } from '#shared/mask'

/**
 * Маски ввода: v-mask="'money'" на обычном input.
 *
 * Форматируем прямо в поле и заново рассылаем событие input, чтобы
 * v-model получил уже причёсанное значение. Каретка держится на месте:
 * считаем значимые символы слева от неё до и после форматирования.
 *
 * ponytail: одна директива вместо компонента-обёртки — поля остаются
 * обычными input, ничего не переписывается.
 */
export default defineNuxtPlugin((nuxtApp) => {
  let reentry = false

  nuxtApp.vueApp.directive<HTMLInputElement, MaskName>('mask', {
    mounted(el, binding) {
      const format = MASKS[binding.value]
      if (!format) return

      const handler = () => {
        if (reentry) return
        const before = el.value
        const after = format(before)
        if (after === before) return

        const caret = el.selectionStart ?? before.length
        const kept = significant(before.slice(0, caret))
        el.value = after
        if (el.type === 'text' || el.type === '') {
          const pos = caretAfter(after, kept)
          try {
            el.setSelectionRange(pos, pos)
          } catch {
            // поле без выделения — не беда
          }
        }

        reentry = true
        el.dispatchEvent(new Event('input', { bubbles: true }))
        reentry = false
      }

      el.addEventListener('input', handler)
      ;(el as HTMLInputElement & { _mask?: () => void })._mask = handler
      // Значение, пришедшее из модели, тоже приводим к маске.
      if (el.value) handler()
    },

    unmounted(el) {
      const handler = (el as HTMLInputElement & { _mask?: () => void })._mask
      if (handler) el.removeEventListener('input', handler)
    },
  })
})
