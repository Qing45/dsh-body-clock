'use strict'

/**
 * 渲染进程与主进程之间唯一的桥。
 *
 * 只暴露三个能力：读环境、报窗口位置、听主题变化。
 * 渲染进程拿不到 Node，也拿不到 Electron 的 ipcRenderer 本体。
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bodyClock', {
  /** 同步取一次环境信息（屏幕尺寸用于拖拽边界，语言用于字典选择）。 */
  env: () => ipcRenderer.sendSync('bc:env'),

  /** 把 client.js 算出来的位置/尺寸交给主进程去移动窗口。 */
  setFrame: (frame) => ipcRenderer.send('bc:frame', frame),

  /** 主进程要求立刻回报一次位置（首帧显示前校准用）。 */
  onPing: (callback) => {
    ipcRenderer.on('bc:ping', () => callback())
  },

  /** 系统深浅色切换时通知渲染进程。 */
  onThemeChange: (callback) => {
    ipcRenderer.on('bc:theme', (_event, dark) => callback(dark))
  },
})
