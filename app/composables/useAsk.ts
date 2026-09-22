export interface AskRequest {
  title: string
  body?: string
  /** Заголовок поля ввода. Без него диалог только подтверждает. */
  label?: string
  ok?: string
  /** Только сообщение, без кнопки отмены. */
  notice?: boolean
}

// ponytail: один диалог на приложение, обработчик держим в модуле —
// он ставится только из обработчиков событий в браузере, на сервер не попадает.
let resolver: ((value: string | null) => void) | null = null

export function useAsk() {
  const request = useState<AskRequest | null>('ask', () => null)

  function ask(req: AskRequest): Promise<string | null> {
    request.value = req
    return new Promise<string | null>((resolve) => {
      resolver = resolve
    })
  }

  /** Короткая форма: показать сообщение и подождать «Понятно». */
  const notice = (title: string, body?: string) => ask({ title, body, ok: 'Понятно', notice: true })

  function answer(value: string | null) {
    request.value = null
    const done = resolver
    resolver = null
    done?.(value)
  }

  return { request, ask, notice, answer }
}
