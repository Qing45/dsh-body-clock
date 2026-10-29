/**
 * 把插件源码和垫片打成一个可以在独立窗口里跑起来的 bundle。
 *
 *   node scripts/build-renderer.mjs [--watch]
 *
 * 每次构建都重新读 ../client.js 的原文内联进来，所以桌面版永远跟着插件走：
 * 改 client.js → 重新构建 → 桌面版同步生效，不存在第二份界面代码。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..') // desktop/
const repo = path.resolve(root, '..') // 插件仓库根
const srcDir = path.join(root, 'src')

const clientPath = path.join(repo, 'client.js')
if (!fs.existsSync(clientPath)) {
  console.error('[build] 找不到插件源码：' + clientPath)
  process.exit(1)
}

/* client.js 不是 ES 模块，而是「向 DSH 加载器注册工厂」的脚本。
 * 它作为副作用 import 进 bundle，执行前必须保证 window.__ModuleLoader__
 * 已经存在——用 banner 把加载器注入到整个 bundle 的最前面，
 * 这样就不需要 new Function（也就不用给 CSP 开 unsafe-eval）。 */
const LOADER_BANNER =
  'window.__ModuleLoader__={load:function(m){window.__bcFactory=m.factory;}};'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: [path.join(srcDir, 'boot.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
  outfile: path.join(srcDir, 'renderer.js'),
  banner: { js: LOADER_BANNER },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
}

fs.copyFileSync(path.join(srcDir, 'theme.css'), path.join(srcDir, 'renderer.css'))

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[build] 监听中')
} else {
  await esbuild.build(options)
  const size = fs.statSync(options.outfile).size
  console.log('[build] renderer.js ' + (size / 1024).toFixed(0) + ' KB')
}
