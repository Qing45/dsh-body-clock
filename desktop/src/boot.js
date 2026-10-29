/* ------------------------------------------------------------------ *
 * 身体时钟 · 桌面版 —— 启动垫片（shim）
 *
 * client.js 是 DSH 的插件，它以 `window.__ModuleLoader__.load({ factory })`
 * 的形式交出自己，并期望宿主提供两个东西：
 *
 *   ctx.locale  —— 中英文字典的注册与绑定
 *   ctx.slots   —— 把组件挂到某个界面上（这里原来挂的是 shell.overlay）
 *
 * 这个文件把这两样补出来，然后把同一个组件渲染进 Electron 的窗口。
 * 也就是说：源码只有一份（../dsh-body-clock/client.js），插件和桌面版共用，
 * 改一处两边同时生效，永远不会分叉。
 *
 * 另一件事是把「浮层」变成「窗口」：
 *   - 让 client.js 以为视口是整块屏幕（它用 innerWidth/innerHeight 算拖拽边界
 *     和自适应高度），否则窗口只有 316px 宽，一拖就卡住；
 *   - 每帧读 client.js 写在根节点上的 left/top，交给主进程去移动窗口。
 * ------------------------------------------------------------------ */

import React from 'react'
import { createRoot } from 'react-dom/client'

/* 插件本体。它不是 ES 模块，而是一段「向 DSH 加载器注册工厂」的脚本。
 * esbuild 的 banner 会在整个 bundle 最前面把 window.__ModuleLoader__ 安好，
 * 所以这行 import 执行时加载器已经存在，client.js 可以正常注册。 */
import '../../client.js'

const factory = window.__bcFactory

/* 必须与 src/theme.css 里的 --bc-margin 保持一致。 */
const MARGIN = 16

const bridge = window.bodyClock
if (!bridge) throw new Error('[body-clock] preload bridge missing')

const env = bridge.env()
const screenSize = env.screen || { width: 1440, height: 900 }
const lang = String(env.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'

/* ------------------------------------------------------------------ *
/* 1. 让 client.js 以为自己在整块屏幕上
 * ------------------------------------------------------------------ */

/* configurable 是必须的：client.js 里已有读取，覆盖后要能被测试工具还原。 */
Object.defineProperty(window, 'innerWidth', {
  configurable: true,
  get: () => screenSize.width,
})
Object.defineProperty(window, 'innerHeight', {
  configurable: true,
  get: () => screenSize.height,
})

/* ------------------------------------------------------------------ *
/* 2. client.js 已在上面 import 时注册好工厂，这里取回来
 * ------------------------------------------------------------------ */

/* client.js 里只 require('react')；其余依赖一律不存在。 */
const requireStub = (name) => (name === 'react' ? React : {})

if (typeof factory !== 'function') {
  throw new Error('[body-clock] client.js did not register a factory')
}

/* ------------------------------------------------------------------ *
/* 3. 补出 ctx：locale + slots
 * ------------------------------------------------------------------ */

const dicts = {}
let slotRender = null

const ctx = {
  effect(fn) {
    fn()
  },
  slots: {
    inject(_target, fn) {
      fn()
    },
    register(_meta, render) {
      slotRender = render
      return () => {
        slotRender = null
      }
    },
  },
  locale: {
    register(ns, dict) {
      dicts[ns] = dict
    },
    bind(ns) {
      return (key) => {
        const dict = dicts[ns]
        if (!dict) return key
        const table = lang === 'en' ? dict.en : dict.zh
        if (table && table[key] !== undefined) return table[key]
        if (dict.zh && dict.zh[key] !== undefined) return dict.zh[key]
        return key
      }
    },
  },
}

const clientModule = factory(requireStub)
clientModule.apply(ctx)

if (typeof slotRender !== 'function') {
  throw new Error('[body-clock] client.js did not register a slot component')
}

/* ------------------------------------------------------------------ *
/* 4. 渲染
 * ------------------------------------------------------------------ */

/* client.js 的 slot 渲染函数签名是 (props) => element，宿主原来传的是
 * shell.overlay 的插槽属性。这里没有宿主，传空对象即可。 */
const root = createRoot(document.getElementById('root'))
root.render(slotRender({}))

/* ------------------------------------------------------------------ *
/* 5. 窗口跟随：把 client.js 的坐标翻译成窗口位置
 * ------------------------------------------------------------------ */

let lastKey = ''

function syncFrame() {
  const el = document.querySelector('.dfp-root')

  if (el) {
    const x = Number.parseFloat(el.style.left) || 0
    const y = Number.parseFloat(el.style.top) || 0
    const width = el.offsetWidth
    const height = el.offsetHeight
    const key = `${x}|${y}|${width}|${height}`

    if (key !== lastKey && width > 0 && height > 0) {
      lastKey = key
      /* 元素被钉在 (MARGIN, MARGIN)，所以窗口左上角要提前 MARGIN 那么多，
       * 再给四边各留 MARGIN 给投影。 */
      bridge.setFrame({
        x: Math.round(x - MARGIN),
        y: Math.round(y - MARGIN),
        width: Math.round(width + MARGIN * 2),
        height: Math.round(height + MARGIN * 2),
      })
    }
  }

  requestAnimationFrame(syncFrame)
}

requestAnimationFrame(syncFrame)

/* 主进程要求位置校准（比如托盘里点了「回到初始位置」）：
 * 清掉去重标记，让已经在跑的那条 rAF 循环下一帧重新上报。
 * 注意别再起第二条循环，否则窗口会收到双倍的 setPosition。 */
bridge.onPing(() => {
  lastKey = ''
})
