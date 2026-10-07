#!/usr/bin/env node
/**
 * Запуск «Кассы объектов» на этом компьютере: https://localhost:34567
 *
 *   npm run serve              — запустить (соберёт приложение, если сборки нет)
 *   npm run serve -- --rebuild — пересобрать перед запуском (после обновления кода)
 *
 * Что делает:
 *  - собирает приложение, если .output ещё нет;
 *  - один раз создаёт сертификат для localhost в .data/cert (своя подпись;
 *    если установлен mkcert — сертификат, которому браузер доверяет сразу);
 *  - слушает только 127.0.0.1: из локальной сети приложение не видно;
 *  - упал — поднимает заново через несколько секунд, пишет журнал
 *    в .data/logs/server.log.
 *
 * Порт и адрес можно сменить переменными KASSA_PORT и KASSA_HOST.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, '.data')
const CERT_DIR = join(DATA, 'cert')
const LOG_DIR = join(DATA, 'logs')
const LOG = join(LOG_DIR, 'server.log')
const SERVER = join(ROOT, '.output', 'server', 'index.mjs')

const PORT = Number(process.env.KASSA_PORT) || 34567
const HOST = process.env.KASSA_HOST || '127.0.0.1'
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

mkdirSync(LOG_DIR, { recursive: true })

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`
  process.stdout.write(text)
  try {
    // Журнал не растёт бесконечно: больше 5 МБ — уходит в server.log.1.
    if (existsSync(LOG) && statSync(LOG).size > 5 * 1024 * 1024) renameSync(LOG, `${LOG}.1`)
    appendFileSync(LOG, text)
  } catch {
    // журнал — не повод остановить кассу
  }
}

/** Сборка: если её нет или попросили пересобрать. */
function ensureBuild() {
  const rebuild = process.argv.includes('--rebuild')
  if (existsSync(SERVER) && !rebuild) return
  if (!existsSync(join(ROOT, 'node_modules'))) {
    log('Ставлю зависимости (npm install)…')
    const r = spawnSync(NPM, ['install'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    if (r.status !== 0) throw new Error('npm install завершился с ошибкой')
  }
  log('Собираю приложение (npm run build), это минута-две…')
  const r = spawnSync(NPM, ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // Сборка под обычный Node-сервер, даже если в окружении остался пресет облака.
    env: { ...process.env, NITRO_PRESET: 'node-server' },
  })
  if (r.status !== 0) throw new Error('сборка завершилась с ошибкой')
}

/** Сертификат для https://localhost. Создаётся один раз и живёт 10 лет. */
async function ensureCert() {
  const keyFile = join(CERT_DIR, 'key.pem')
  const certFile = join(CERT_DIR, 'cert.pem')
  if (existsSync(keyFile) && existsSync(certFile)) {
    return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') }
  }
  mkdirSync(CERT_DIR, { recursive: true })

  // mkcert выдаёт сертификат от своего локального центра — браузер не ругается.
  const mk = spawnSync('mkcert', ['-key-file', keyFile, '-cert-file', certFile, 'localhost', '127.0.0.1', '::1'], {
    cwd: CERT_DIR, stdio: 'ignore', shell: process.platform === 'win32',
  })
  if (mk.status === 0 && existsSync(certFile)) {
    log('Сертификат создан через mkcert — браузер ему доверяет.')
  } else {
    const { generate } = await import('selfsigned')
    const notAfterDate = new Date()
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10)
    const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
      keySize: 2048,
      notAfterDate,
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ] },
      ],
    })
    writeFileSync(keyFile, pems.private, { mode: 0o600 })
    writeFileSync(certFile, pems.cert)
    log('Создан собственный сертификат для localhost. Браузер один раз предупредит —')
    log('нажмите «Дополнительно» → «Перейти на localhost». Чтобы без предупреждения: установите mkcert и удалите .data/cert.')
  }
  return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8') }
}

let child = null
let stopping = false
let fails = 0

function run(tls) {
  const startedAt = Date.now()
  child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST,
      NITRO_SSL_KEY: tls.key,
      NITRO_SSL_CERT: tls.cert,
      // База рядом с приложением, а не в папке, откуда запустили.
      FINANCE_DB: join(DATA, 'finance.db'),
    },
  })
  child.stdout.on('data', d => log(String(d).trimEnd()))
  child.stderr.on('data', (d) => {
    const s = String(d).trimEnd()
    if (!s.includes('ExperimentalWarning') && !s.includes('--trace-warnings')) log(s)
  })
  child.on('exit', (code, signal) => {
    child = null
    if (stopping) return
    // Проработал дольше минуты — это не цикл падений, счётчик сбрасываем.
    fails = Date.now() - startedAt > 60_000 ? 1 : fails + 1
    const wait = Math.min(60, 2 ** fails)
    log(`Сервер остановился (код ${code ?? signal}). Перезапуск через ${wait} с.`)
    setTimeout(() => run(tls), wait * 1000)
  })
}

function stop() {
  stopping = true
  child?.kill()
  setTimeout(() => process.exit(0), 1500).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

try {
  ensureBuild()
  const tls = await ensureCert()
  log(`Касса объектов: https://localhost:${PORT}`)
  run(tls)
} catch (e) {
  log(`Не удалось запустить: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
