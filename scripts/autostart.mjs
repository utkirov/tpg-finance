#!/usr/bin/env node
/**
 * Автозапуск «Кассы объектов» при включении компьютера.
 *
 *   npm run autostart          — включить
 *   npm run autostart:remove   — выключить
 *
 * Windows — скрытый запуск из папки «Автозагрузка» при входе в систему,
 * без окна консоли и без прав администратора.
 * macOS   — агент launchd: стартует при входе, перезапускается при сбое.
 * Linux   — пользовательская служба systemd; с «linger» — сразу при загрузке,
 *           ещё до входа в систему.
 *
 * Приложение открывается по адресу https://localhost:34567
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const START = join(ROOT, 'scripts', 'start.mjs')
const NODE = process.execPath
const NAME = 'kassa-obektov'
const remove = process.argv.includes('--remove')

const sh = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0

function windows() {
  const startup = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  const file = join(startup, `${NAME}.vbs`)
  if (remove) {
    rmSync(file, { force: true })
    return console.log('Автозапуск выключен. Чтобы остановить сервер сейчас — перезагрузите компьютер или завершите node.exe в диспетчере задач.')
  }
  // VBScript запускает node без окна консоли (0 = скрытое окно).
  const q = (s) => s.replace(/"/g, '""')
  writeFileSync(file, [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${q(ROOT)}"`,
    `sh.Run """${q(NODE)}"" ""${q(START)}""", 0, False`,
    '',
  ].join('\r\n'))
  // Сразу и запускаем, чтобы не ждать перезагрузки.
  spawnSync('wscript.exe', [file], { stdio: 'ignore' })
  console.log(`Автозапуск включён: ${file}`)
}

function mac() {
  const dir = join(homedir(), 'Library', 'LaunchAgents')
  const file = join(dir, `uz.tpg.${NAME}.plist`)
  if (existsSync(file)) sh('launchctl', ['unload', '-w', file])
  if (remove) {
    rmSync(file, { force: true })
    return console.log('Автозапуск выключен, сервер остановлен.')
  }
  mkdirSync(dir, { recursive: true })
  const log = join(ROOT, '.data', 'logs', 'launchd.log')
  mkdirSync(dirname(log), { recursive: true })
  writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>uz.tpg.${NAME}</string>
  <key>ProgramArguments</key>
  <array><string>${NODE}</string><string>${START}</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`)
  if (!sh('launchctl', ['load', '-w', file])) {
    console.log(`Файл агента записан (${file}), но launchctl его не загрузил.`)
    process.exitCode = 1
    return
  }
  console.log(`Автозапуск включён: ${file}`)
}

function linux() {
  const dir = join(homedir(), '.config', 'systemd', 'user')
  const file = join(dir, `${NAME}.service`)
  if (remove) {
    sh('systemctl', ['--user', 'disable', '--now', `${NAME}.service`])
    rmSync(file, { force: true })
    sh('systemctl', ['--user', 'daemon-reload'])
    return console.log('Автозапуск выключен, сервер остановлен.')
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `[Unit]
Description=Касса объектов (https://localhost:34567)
After=network.target

[Service]
WorkingDirectory=${ROOT}
ExecStart="${NODE}" "${START}"
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`)
  const ok = sh('systemctl', ['--user', 'daemon-reload'])
    && sh('systemctl', ['--user', 'enable', '--now', `${NAME}.service`])
  if (!ok) {
    console.log(`Файл службы записан (${file}), но systemd его не принял.`)
    console.log(`Включите вручную: systemctl --user enable --now ${NAME}.service`)
    process.exitCode = 1
    return
  }
  // Без linger пользовательские службы стартуют только после входа в систему.
  const user = process.env.USER ?? ''
  if (user && !sh('loginctl', ['enable-linger', user])) {
    console.log(`Чтобы касса стартовала ещё до входа в систему: sudo loginctl enable-linger ${user}`)
  }
  console.log(`Автозапуск включён: ${file}`)
}

if (process.platform === 'win32') windows()
else if (process.platform === 'darwin') mac()
else linux()

if (!remove && !process.exitCode) {
  console.log('Касса откроется по адресу https://localhost:34567 (первый запуск собирает приложение — подождите минуту-две).')
  console.log(`Журнал: ${join(ROOT, '.data', 'logs', 'server.log')}`)
}
