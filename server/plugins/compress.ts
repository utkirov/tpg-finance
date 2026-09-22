import { gzipSync } from 'node:zlib'

/**
 * Сжатие ответов API. Состояние на несколько тысяч операций — это мегабайты
 * JSON, и по вай-фаю с телефона они едут секундами. Gzip ужимает их в разы,
 * стандартной библиотекой и без единой зависимости.
 *
 * Трогаем только /api/: отдачу файлов и страницы отдаёт сам Nitro.
 */
const MIN_BYTES = 4096

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('beforeResponse', (event, response) => {
    if (!event.path?.startsWith('/api/')) return
    if (getResponseHeader(event, 'content-encoding')) return
    if (!String(getRequestHeader(event, 'accept-encoding') ?? '').includes('gzip')) return

    const body = response.body
    const text = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && !Buffer.isBuffer(body)
        ? JSON.stringify(body)
        : null
    if (text == null || Buffer.byteLength(text) < MIN_BYTES) return

    const packed = gzipSync(text)
    setResponseHeader(event, 'content-type', typeof body === 'string' ? 'text/plain' : 'application/json')
    setResponseHeader(event, 'content-encoding', 'gzip')
    setResponseHeader(event, 'content-length', packed.length)
    setResponseHeader(event, 'vary', 'accept-encoding')
    response.body = packed
  })
})
