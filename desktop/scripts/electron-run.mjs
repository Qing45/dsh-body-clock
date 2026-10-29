/**
 * 跨平台启动器。
 *
 *   node scripts/electron-run.mjs .                  # 跑应用
 *   node scripts/electron-run.mjs scripts/icons.js   # 跑一次性脚本
 *
 * 存在的理由只有一个：DSH 本身是 Electron 应用，它给子进程设了
 * ELECTRON_RUN_AS_NODE=1。带着这个变量启动 Electron，进程会退化成
 * 普通的 Node，既不建窗口也不加载 main.js，而且不报错——非常难查。
 * 所以启动前必须把它删掉（Windows 上没有 env -u，只能在这里做）。
 */
import { spawn } from 'node:child_process'
import electronPath from 'electron'

const args = process.argv.slice(2)
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, args.length ? args : ['.'], {
  stdio: 'inherit',
  env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
