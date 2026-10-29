'use strict'

/**
 * 身体时钟 · 桌面版 —— 主进程
 *
 * 这个文件只负责「窗口」这件事：开一个透明无边框的小窗、把它摆在
 * client.js 算出来的位置上、挂一个托盘、记住开关。
 *
 * 界面和全部业务逻辑都在 ../client.js 里，与 DSH 插件共用同一份源码。
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/* 窗口为内容预留的阴影边距，必须与 src/theme.css 的 --bc-margin、
 * src/boot.js 的 MARGIN 保持一致。 */
const MARGIN = 16
const CONTENT_WIDTH = 316
const CONTENT_HEIGHT = 600
const MIN_SIDE = 48

let win = null
let tray = null
let isQuitting = false
let frameReported = false
let showFallback = null

const prefs = {
  alwaysOnTop: true,
  launchAtLogin: false,
}

/* ------------------------------------------------------------------ */
/* 窗口                                                                */
/* ------------------------------------------------------------------ */

function initialBounds() {
  const { workArea } = screen.getPrimaryDisplay()
  const width = CONTENT_WIDTH + MARGIN * 2
  const height = CONTENT_HEIGHT + MARGIN * 2

  return {
    width,
    height,
    x: workArea.x + Math.max(0, workArea.width - width - 24),
    y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)),
  }
}

function clampFrame(frame) {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.max(MIN_SIDE, Math.round(frame.width))
  const height = Math.max(MIN_SIDE, Math.round(frame.height))
  const maxX = workArea.x + Math.max(0, workArea.width - width)
  const maxY = workArea.y + Math.max(0, workArea.height - height)

  return {
    width,
    height,
    x: Math.min(Math.max(workArea.x + Math.round(frame.x), workArea.x), maxX),
    y: Math.min(Math.max(workArea.y + Math.round(frame.y), workArea.y), maxY),
  }
}

/* 自检：等界面稳定后截图存盘并退出。
 * 用于没有人工观察条件时确认窗口到底有没有画对。
 * BC_SMOKE_ACTION=open|settings|water|stand 可以先模拟一次交互。 */
function runSmokeTest() {
  const delay = Number(process.env.BC_SMOKE_DELAY || 2500)
  const action = process.env.BC_SMOKE_ACTION || ''
  const out = process.env.BC_SMOKE_PATH || path.join(__dirname, '..', 'release', 'smoke.png')

  setTimeout(async () => {
    try {
      if (!win || win.isDestroyed()) throw new Error('窗口不存在')

      if (action) {
        /* 悬浮球没有 onClick：它靠 pointerdown/pointerup 判断「没移动就是点击」，
         * 所以要按它的真实协议模拟，而不是发一个 click。 */
        const script =
          '(() => {' +
          '  const pill = document.querySelector(".dfp-pill");' +
          '  const fire = (el) => {' +
          '    if (!el) return false;' +
          '    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, clientX: 80, clientY: 80 };' +
          '    el.dispatchEvent(new PointerEvent("pointerdown", Object.assign({}, o, { buttons: 1 })));' +
          '    el.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, o, { buttons: 0 })));' +
          '    return true;' +
          '  };' +
          '  if ("' + action + '" === "open") return fire(pill) ? "opened" : "no-pill";' +
          '  if (!fire(pill)) return "no-pill";' +
          '  return "expanded";' +
          '})()'

        const result = await win.webContents.executeJavaScript(script)
        console.log('[smoke] 交互：' + action + ' → ' + result)

        await new Promise((resolve) => setTimeout(resolve, 700))

        if (action !== 'open') {
          const tabMap = { settings: '.dfp-icon-btn', water: '.dfp-modetab:nth-child(2)', stand: '.dfp-modetab:nth-child(3)' }
          const selector = tabMap[action]
          if (selector) {
            await win.webContents.executeJavaScript(
              '(() => { const el = document.querySelector("' + selector + '"); if (!el) return "missing"; el.click(); return "ok"; })()',
            )
            await new Promise((resolve) => setTimeout(resolve, 700))
          }
        }
      }

      /* 拖动自检：client.js 用自己的 pointer 逻辑记坐标，我们靠窗口跟随去实现。
       * 这里按它的真实协议拖一次标题栏，看窗口到底有没有动。 */
      if (process.env.BC_SMOKE_DRAG) {
        const before = win.getBounds()

        await win.webContents.executeJavaScript(
          '(() => {' +
            '  const head = document.querySelector(".dfp-head");' +
            '  if (!head) return "no-head";' +
            '  const r = head.getBoundingClientRect();' +
            '  const cx = r.left + 20;' +
            '  const cy = r.top + r.height / 2;' +
            '  const mk = (type, dx, dy, buttons) => new PointerEvent(type, {' +
            '    bubbles: true, cancelable: true, pointerId: 11, pointerType: "mouse",' +
            '    button: 0, buttons, clientX: cx + dx, clientY: cy + dy,' +
            '  });' +
            '  head.dispatchEvent(mk("pointerdown", 0, 0, 1));' +
            '  for (let i = 1; i <= 12; i++) head.dispatchEvent(mk("pointermove", -8 * i, 5 * i, 1));' +
            '  head.dispatchEvent(mk("pointerup", -96, 60, 0));' +
            '  return "ok";' +
            '})()',
        )

        await new Promise((resolve) => setTimeout(resolve, 800))
        const after = win.getBounds()
        console.log(
          '[drag] 前 ' + before.x + ',' + before.y + ' → 后 ' + after.x + ',' + after.y +
            '（位移 ' + (after.x - before.x) + ',' + (after.y - before.y) + '）',
        )
      }

      /* 先探一下渲染进程到底处在什么状态，比只看一张白图有用得多。 */
      const probe = await win.webContents.executeJavaScript(
        'JSON.stringify((() => {' +
          '  const root = document.querySelector(".dfp-root");' +
          '  const box = document.querySelector(".dfp-win");' +
          '  const body = document.querySelector(".dfp-body");' +
          '  const rect = (el) => el ? { w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop } : null;' +
          '  return {' +
          '    bridge: !!window.bodyClock,' +
          '    dfpRoot: !!root, win: !!box, pill: !!document.querySelector(".dfp-pill"),' +
          '    rootRect: rect(root), winRect: rect(box), bodyRect: rect(body),' +
          '    winInline: box ? { height: box.style.height, maxHeight: box.style.maxHeight } : null,' +
          '    bodyScroll: body ? { client: body.clientHeight, scroll: body.scrollHeight } : null,' +
          '    viewport: { iw: window.innerWidth, ih: window.innerHeight, doc: document.documentElement.clientHeight, bodyH: document.body.clientHeight },' +
          '    winStyle: (() => { const w = getComputedStyle(box || document.body); return null })()' +
          '  };' +
          '})())',
      )
      console.log('[probe] ' + probe)

      const image = await win.webContents.capturePage()
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, image.toPNG())
      console.log('[smoke] 已保存 ' + out + '（' + image.getSize().width + '×' + image.getSize().height + '）')
    } catch (err) {
      console.error('[smoke] 失败：' + ((err && err.message) || err))
    } finally {
      app.exit(0)
    }
  }, delay)
}

function revealWindow() {
  if (showFallback) {
    clearTimeout(showFallback)
    showFallback = null
  }
  if (!win || win.isDestroyed()) return
  if (!win.isVisible()) win.showInactive()
}

function createWindow() {
  if (win && !win.isDestroyed()) return win

  win = new BrowserWindow({
    ...initialBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    acceptFirstMouse: true,
    show: false,
    title: '身体时钟',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      /* 窗口可能被收起/隐藏，但提醒的定时器不能因此被降频。 */
      backgroundThrottling: false,
      zoomFactor: 1,
    },
  })

  win.setAlwaysOnTop(prefs.alwaysOnTop, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  /* 排查用：把渲染进程的 console、加载失败、preload 异常都转到主进程 stdout。
   * 用法：BC_DEBUG=1 npm run dev */
  if (process.env.BC_DEBUG) {
    win.webContents.on('console-message', (...args) => {
      const event = args[0]
      if (event && typeof event === 'object' && 'message' in event) {
        console.log('[renderer:' + event.level + '] ' + event.message + '  @' + event.sourceId + ':' + event.lineNumber)
      } else {
        console.log('[renderer] ' + args[2] + '  @' + args[4] + ':' + args[3])
      }
    })
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.log('[did-fail-load] ' + code + ' ' + desc + ' ' + url)
    })
    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.log('[preload-error] ' + preloadPath + ' → ' + ((error && error.message) || error))
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.log('[render-process-gone] ' + JSON.stringify(details))
    })
  }

  win.loadFile(path.join(__dirname, 'index.html'))

  win.once('ready-to-show', () => {
    /* 等 boot.js 报第一帧（窗口尺寸已按内容校准）再显示，
     * 否则会先闪一下 348×632 的空窗再跳成实际大小。 */
    showFallback = setTimeout(revealWindow, 900)
  })

  /* 自检模式：把窗口真实渲染的结果截一张图再退出，
   * 用于没有人工观察条件时确认界面有没有画对。 */
  if (process.env.BC_SMOKE) runSmokeTest()

  /* 关闭按钮 = 收进托盘，不退出。 */
  win.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    win.hide()
  })

  win.on('closed', () => {
    win = null
  })

  return win
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  win.showInactive()
}

function toggleWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isVisible()) win.hide()
  else win.showInactive()
}

/* ------------------------------------------------------------------ */
/* 托盘                                                                */
/* ------------------------------------------------------------------ */

function trayImage() {
  const darwin = process.platform === 'darwin'
  const file = darwin ? 'trayTemplate.png' : 'tray.png'
  const image = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', file))

  if (image.isEmpty()) return nativeImage.createEmpty()

  if (darwin) {
    const resized = image.resize({ width: 18, height: 18 })
    resized.setTemplateImage(true)
    return resized
  }

  return image.resize({ width: 16, height: 16 })
}

function setLaunchAtLogin(enabled) {
  prefs.launchAtLogin = enabled
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏窗口',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: prefs.alwaysOnTop,
      click: (item) => {
        prefs.alwaysOnTop = item.checked
        if (win && !win.isDestroyed()) win.setAlwaysOnTop(item.checked, 'floating')
      },
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: prefs.launchAtLogin,
      enabled: app.isPackaged,
      click: (item) => setLaunchAtLogin(item.checked),
    },
    { type: 'separator' },
    {
      label: '窗口回到初始位置',
      click: () => {
        if (!win || win.isDestroyed()) return
        win.setBounds(initialBounds(), false)
        win.webContents.send('bc:ping')
      },
    },
    { type: 'separator' },
    {
      label: '退出身体时钟',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function createTray() {
  tray = new Tray(trayImage())
  tray.setToolTip('身体时钟')
  tray.setContextMenu(buildMenu())
  tray.on('click', () => toggleWindow())
  tray.on('double-click', () => showWindow())
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.on('bc:env', (event) => {
  const display = screen.getPrimaryDisplay()

  event.returnValue = {
    screen: {
      width: display.workArea.width,
      height: display.workArea.height,
    },
    lang: app.getLocale(),
    platform: process.platform,
    dark: nativeTheme.shouldUseDarkColors,
  }
})

ipcMain.on('bc:frame', (_event, frame) => {
  if (!win || win.isDestroyed() || !frame) return

  const next = clampFrame(frame)
  const current = win.getBounds()

  if (next.width !== current.width || next.height !== current.height) {
    win.setBounds(next, false)
  } else if (next.x !== current.x || next.y !== current.y) {
    /* 拖动时只移动位置，不碰尺寸——避免每次移动都触发一次重排。 */
    win.setPosition(next.x, next.y, false)
  }

  if (!frameReported) {
    frameReported = true
    revealWindow()
  }
})

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    app.setName('身体时钟')

    /* 自检时可以强制深浅色，方便截图核对两套配色。 */
    if (process.env.BC_THEME === 'dark' || process.env.BC_THEME === 'light') {
      nativeTheme.themeSource = process.env.BC_THEME
    }

    createWindow()
    createTray()

    nativeTheme.on('updated', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('bc:theme', nativeTheme.shouldUseDarkColors)
      }
    })

    app.on('activate', () => showWindow())
  })
}

/* 关掉窗口不退出：托盘常驻，提醒要继续生效。 */
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
})
