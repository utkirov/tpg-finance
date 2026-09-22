import { LANGS, translate, type Lang } from '#shared/i18n'

/** Выбранный язык живёт в куке — его видит и сервер при отрисовке страницы. */
export function useLang() {
  return useCookie<Lang>('lang', {
    default: () => 'ru',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 86400,
  })
}

export function useT() {
  const lang = useLang()
  const t = (text: string, params?: Record<string, string | number>) => translate(lang.value, text, params)
  return { t, lang, LANGS }
}

/**
 * Ошибка сервера на языке интерфейса. Сервер присылает русский текст
 * и рядом ключ с подстановками — по ним и переводим.
 */
export function useErr() {
  const { t } = useT()
  return (e: unknown): string => {
    const any = e as {
      data?: { key?: string; params?: Record<string, string | number>; message?: string; statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    if (any?.data?.key) {
      // Подстановки вроде названия поля тоже переводим; суммы и даты проходят как есть.
      const params = Object.fromEntries(
        Object.entries(any.data.params ?? {}).map(([k, v]) => [k, typeof v === 'string' ? t(v) : v]),
      )
      return t(any.data.key, params)
    }
    return t(any?.data?.message || any?.data?.statusMessage || any?.statusMessage || any?.message || 'Не удалось сохранить')
  }
}
