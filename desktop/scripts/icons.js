'use strict'

/**
 * 一次性任务：把 SVG 栅格化成打包要用的 PNG。
 *
 *   node scripts/electron-run.mjs scripts/icons.js
 *
 * 为什么要绕道 Electron：系统自带的 qlmanage 在受限环境下起不来
 * （它自带 App Sandbox），而 Electron 本身就是 Chromium，渲染 SVG 是本职。
 * 产物提交进仓库，CI 不需要再跑这一步。
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const repo = path.join(root, '..')

const appIcon = path.join(repo, 'icon.svg')
const trayIcon = path.join(root, 'assets', 'tray.svg')

const jobs = [
  /* 应用图标：electron-builder 会从 1024 的源图自动生成 .icns / .ico。 */
  { svg: appIcon, out: 'build/icon.png', size: 1024 },
  /* 托盘图标：macOS 用 template image（只取 alpha，系统自动反色），
   * 所以要额外备一份 @2x 给 Retina 屏。 */
  { svg: trayIcon, out: 'assets/trayTemplate.png', size: 22 },
  { svg: trayIcon, out: 'assets/trayTemplate@2x.png', size: 44 },
  /* Windows 托盘不走 template 机制，用彩色位图。 */
  { svg: trayIcon, out: 'assets/tray.png', size: 32 },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pageFor(svg, size) {
  const b64 = Buffer.from(svg).toString('base64')
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
    'img{display:block;width:' +
    size +
    'px;height:' +
    size +
    'px}' +
    '</style></head><body>' +
    '<img src="data:image/svg+xml;base64,' +
    b64 +
    '">' +
    '</body></html>'
  )
}

async function renderAll() {
  /* 只用同一个 offscreen 窗口反复改尺寸再截图。
   * 试过「每个尺寸开一个新窗口」：销毁第一个之后，Chromium 的
   * MachPortRendezvousServer 会报 Permission denied，后续窗口全部 ERR_FAILED。 */
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, backgroundThrottling: false },
  })

  try {
    for (const job of jobs) {
      if (!fs.existsSync(job.svg)) throw new Error('缺少源文件：' + job.svg)

      const svg = fs.readFileSync(job.svg, 'utf8')
      win.setSize(job.size, job.size, false)
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pageFor(svg, job.size)))
      /* offscreen 窗口不会自己持续绘制：等排版完，再强制重绘一次。 */
      await sleep(150)
      win.webContents.invalidate()
      await sleep(150)

      const image = await win.webContents.capturePage()
      if (image.isEmpty()) throw new Error('截图为空：' + job.out)

      const target = path.join(root, job.out)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, image.toPNG())

      const size = image.getSize()
      console.log('[icons] ' + job.out + '  ←  ' + size.width + '×' + size.height)
    }
  } finally {
    win.destroy()
  }
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    await renderAll()
    console.log('[icons] 完成')
    app.exit(0)
  } catch (err) {
    console.error('[icons] 失败：' + ((err && err.message) || err))
    app.exit(1)
  }
})
