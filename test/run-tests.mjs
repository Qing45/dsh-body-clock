/**
 * dsh-body-clock — full test suite.
 *
 *   node test/run-tests.mjs
 *
 * No dependencies: the client half is evaluated in a sandbox with a fake React,
 * a fake `window` (localStorage, timers, viewport) and an instrumented copy of
 * the module factory that exposes its pure helpers, so both the scheduling
 * math and the rendered UI can be tested without a browser.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

/* ------------------------------------------------------------------ */
/* Harness                                                            */
/* ------------------------------------------------------------------ */

const results = []
let sectionName = 'misc'
const use = (name) => { sectionName = name }
function test(name, fn) {
  try {
    fn()
    results.push({ ok: true, name: sectionName + ' · ' + name })
  } catch (err) {
    results.push({ ok: false, name: sectionName + ' · ' + name, err })
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + b + ', got ' + a)
}
function near(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ~' + expected + ', got ' + actual)
  }
}

/* ------------------------------------------------------------------ */
/* Sandbox: fake window + fake React                                  */
/* ------------------------------------------------------------------ */

const source = read('client.js')
const hostModule = await import(pathToFileURL(path.join(root, 'index.js')).href)

const storage = {}
let capturedFactory = null

const fakeWindow = {
  __ModuleLoader__: { load(mod) { capturedFactory = mod.factory } },
  localStorage: {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value) },
    removeItem: (key) => { delete storage[key] },
  },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1440,
  innerHeight: 900,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: (fn) => {
    const list = active ? active.intervals : []
    list.push(fn)
    return list.length
  },
  clearInterval: (id) => {
    const list = active ? active.intervals : []
    if (id) list[id - 1] = null
  },
}
globalThis.window = fakeWindow

let active = null
let stateIdx = 0

const React = {
  createElement(type, props, ...children) {
    const copy = Object.assign({}, props)
    if (children.length === 1) copy.children = children[0]
    else if (children.length > 1) copy.children = children
    return { type, props: copy }
  },
  useState(init) {
    const i = stateIdx++
    if (active.valueOf(i) === undefined) {
      active.setValue(i, Object.prototype.hasOwnProperty.call(active.overrides, i) ? active.overrides[i] : init)
    }
    const current = active.valueOf(i)
    return [current, (next) => {
      const resolved = typeof next === 'function' ? next(active.valueOf(i)) : next
      active.setValue(i, resolved)
      active.sets.push([i, resolved])
    }]
  },
  useRef(init) {
    const i = active.refIdx++
    if (!active.refs[i]) active.refs[i] = { current: init }
    return active.refs[i]
  },
  useEffect(fn, deps) {
    const i = active.effectIdx++
    const prev = active.effectDeps[i]
    const changed = !deps || !prev || deps.length !== prev.length || deps.some((d, k) => d !== prev[k])
    if (changed) {
      active.effectDeps[i] = deps
      active.pendingEffects.push(fn)
    }
  },
  useCallback(fn, deps) {
    const i = active.callbackIdx++
    const prev = active.callbacks[i]
    const changed = !deps || !prev || deps.length !== prev.length || deps.some((d, k) => d !== prev[k])
    if (changed) active.callbacks[i] = { fn, deps }
    return active.callbacks[i].fn
  },
  useMemo(fn, deps) {
    const i = active.memoIdx++
    const prev = active.memos[i]
    const changed = !deps || !prev || deps.length !== prev.length || deps.some((d, k) => d !== prev[k])
    if (changed) active.memos[i] = fn()
    return active.memos[i]
  },
  memo: (fn) => fn,
  Fragment: 'fragment',
}

/* Evaluate the client module so its loader registration is captured. */
new Function('window', 'require', source)(fakeWindow, () => null)
assert(capturedFactory, 'client.js did not call window.__ModuleLoader__.load')

/* Instrument the factory: expose the pure helpers for unit tests. */
const INTERNALS = {
  isValidTime: 'isValidTime',
  parseTime: 'parseTime',
  pad2: 'pad2',
  clockOf: 'clockOf',
  dayAtMinutes: 'dayAtMinutes',
  nextInWindow: 'nextInWindow',
  normalizeTimePart: 'normalizeTimePart',
  emojiOf: 'emojiOf',
  normalizeData: 'normalizeData',
  todayKey: 'todayKey',
  normalizeSettings: 'normalizeSettings',
  dueMeal: 'dueMeal',
  mealTargetMs: 'mealTargetMs',
  normalizeWaterSettings: 'normalizeWaterSettings',
  waterWindow: 'waterWindow',
  normalizeWater: 'normalizeWater',
  waterDue: 'waterDue',
  waterAfterFire: 'waterAfterFire',
  waterScheduleFrom: 'waterScheduleFrom',
  normalizeStandSettings: 'normalizeStandSettings',
  standWindow: 'standWindow',
  normalizeStand: 'normalizeStand',
  standDue: 'standDue',
  standScheduleFrom: 'standScheduleFrom',
  clampPosition: 'clampPosition',
  defaultPosition: 'defaultPosition',
  mealWindowHeight: 'mealWindowHeight',
  isComposingKey: 'isComposingKey',
  chimeNotes: 'chimeNotes',
  chimeRepeats: 'chimeRepeats',
}

const factoryText = capturedFactory.toString()
const returnMarker = '    return {\n      name: NS,'
assert(factoryText.indexOf(returnMarker) !== -1, 'cannot instrument the factory return')
const names = Object.keys(INTERNALS).join(', ')
const instrumented = factoryText.replace(
  returnMarker,
  '    globalThis.__DFP_INTERNALS__ = { ' + names + ' };\n' + returnMarker,
)
const instrumentedFactory = new Function(
  'return (' + instrumented.replace(/^factory/, 'function') + ')',
)()
const mod = instrumentedFactory((name) => (name === 'react' ? React : {}))
const I = globalThis.__DFP_INTERNALS__
assert(I && typeof I.dueMeal === 'function', 'internals were not captured')

/* ------------------------------------------------------------------ */
/* Component mounting                                                  */
/* ------------------------------------------------------------------ */

const dicts = {}
let slotEntry = null
const ctx = {
  slots: {
    inject(target, fn) { fn() },
    register(meta, render) { slotEntry = render; return () => {} },
  },
  effect(fn) { fn() },
  locale: {
    register(ns, dict) { dicts[ns] = dict },
    bind(ns) { return (key) => (dicts[ns] && dicts[ns].zh[key] !== undefined ? dicts[ns].zh[key] : key) },
  },
}

test('module exposes the plugin contract', () => {
  eq(mod.name, 'dsh-body-clock', 'name')
  eq(mod.inject, ['slots', 'locale'], 'inject')
  assert(typeof mod.apply === 'function', 'apply missing')
})

mod.apply(ctx)
assert(typeof slotEntry === 'function', 'apply did not register a slot entry')
const slotElement = slotEntry({})
const Component = typeof slotElement === 'function' ? slotElement : slotElement.type

/* State hook order, used by the tests to seed initial state. Keep in sync with
 * the `useState` calls at the top of FoodPicker. */
const S = {
  data: 0, meal: 1, open: 2, pos: 3, deleteMode: 4, adding: 5, draft: 6,
  toast: 7, toastOn: 8, dragging: 9, view: 10, settings: 11, water: 12,
  stand: 13, shaking: 14, tab: 15, settingsTab: 16, pending: 17,
  standLeftMs: 18, timeEdit: 19, numEdit: 20, freshSeq: 21, winH: 22,
}

function createInstance(overrides, keepStorage) {
  if (!keepStorage) Object.keys(storage).forEach((key) => { delete storage[key] })
  const instance = {
    overrides: overrides || {},
    values: [],
    sets: [],
    effects: [],
    pendingEffects: [],
    intervals: [],
    refs: [],
    effectDeps: [],
    callbacks: [],
    memos: [],
    valueOf(i) { return instance.values[i] },
    setValue(i, v) { instance.values[i] = v },
    last: null,
  }
  active = instance
  const render = () => {
    stateIdx = 0
    instance.refIdx = 0
    instance.effectIdx = 0
    instance.callbackIdx = 0
    instance.memoIdx = 0
    instance.sets = []
    instance.intervals = []
    instance.pendingEffects = []
    instance.last = Component({})
    return instance
  }
  instance.render = render
  instance.nodes = () => flatten(instance.last)
  instance.text = () => allText(instance.nodes())
  instance.runEffects = () => {
    instance.effects = instance.pendingEffects.slice()
    instance.pendingEffects.forEach((fn) => {
      try { fn() } catch (err) { /* cleanup callbacks are not valid to call here */ }
    })
    instance.pendingEffects = []
  }
  instance.tick = () => {
    instance.intervals.forEach((fn) => { if (fn) { try { fn() } catch (err) { /* ignore */ } } })
  }
  instance.state = (key) => instance.values[S[key]]
  instance.button = (text) => buttonByText(instance.nodes(), text)
  instance.input = (attr, value) => instance.nodes().find(
    (n) => n.type === 'input' && String(n.props[attr]) === String(value),
  )
  render()
  return instance
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

function flatten(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out }
  if (typeof node === 'object' && node.type) {
    out.push(node)
    flatten(node.props && node.props.children, out)
  }
  return out
}
function textOf(node) {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && node.props) return textOf(node.props.children)
  return ''
}
const allText = (nodes) => nodes.map(textOf).join('|')
const classesOf = (node) => String(node.props.className || '').split(' ').filter(Boolean)
const byClass = (nodes, cls) => nodes.filter((n) => classesOf(n).indexOf(cls) !== -1)
const byClassPrefix = (nodes, prefix) => nodes.filter((n) => String(n.props.className || '').indexOf(prefix) === 0)
const buttonByText = (nodes, text) => nodes.find(
  (n) => n.type === 'button' && textOf(n.props.children).indexOf(text) !== -1,
)
const inputsWith = (nodes, attr, value) => nodes.filter(
  (n) => n.type === 'input' && (value === undefined
    ? n.props[attr] !== undefined
    : String(n.props[attr]) === String(value)),
)

/* ------------------------------------------------------------------ */
/* Test fixtures                                                       */
/* ------------------------------------------------------------------ */

const todayKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const at = (hours, minutes) => {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d
}
const mealSettings = (times, fired) => ({
  enabled: true,
  meals: {
    breakfast: { on: true, time: times[0] },
    lunch: { on: true, time: times[1] },
    dinner: { on: true, time: times[2] },
  },
  lastFired: { date: todayKey(), meals: fired || [] },
})
const waterState = (patch) => Object.assign({
  date: todayKey(),
  cups: 3,
  lastDrink: Date.now() - 3600000,
  nextAt: Date.now() + 3600000,
  pausedUntil: 0,
  settings: { on: true, start: '00:00', end: '23:59', every: 60, goal: 8 },
}, patch || {})
const standState = (patch) => Object.assign({
  date: todayKey(),
  count: 2,
  lastStandAt: Date.now() - 1800000,
  nextAt: Date.now() + 1800000,
  pausedUntil: 0,
  standingUntil: 0,
  settings: { on: true, start: '00:00', end: '23:59', every: 45, duration: 3, goal: 6 },
}, patch || {})
const baseState = (extra) => Object.assign({
  [S.settings]: mealSettings(['07:30', '12:00', '18:30']),
  [S.water]: waterState(),
  [S.stand]: standState(),
}, extra || {})

/* ================================================================== */
/* 1. Locale                                                          */
/* ================================================================== */

test('state hook layout matches the test index map', () => {
  const inst = createInstance({})
  eq(inst.values.length, Object.keys(S).length, 'FoodPicker state hook count')
})

test('IME composition keys are not treated as confirm', () => {
  eq(I.isComposingKey({ nativeEvent: { isComposing: true } }), true, 'isComposing true')
  eq(I.isComposingKey({ nativeEvent: { keyCode: 229 } }), true, 'legacy keyCode 229')
  eq(I.isComposingKey({ nativeEvent: { isComposing: false, keyCode: 13 } }), false, 'plain Enter')
  eq(I.isComposingKey({ key: 'Enter' }), false, 'synthetic event without nativeEvent')
  eq(I.isComposingKey(null), false, 'no event at all')
})

test('reminder chime lasts about 3 seconds; preview stays short', () => {
  eq(I.chimeRepeats(3), 6, '3s reminder = 6 rounds')
  eq(I.chimeRepeats(1), 2, '1s preview = 2 rounds')
  eq(I.chimeRepeats(0), 1, 'never zero rounds')
  eq(I.chimeRepeats(undefined), 6, 'defaults to the reminder length')
})

test('chime patterns stay short and per kind', () => {
  eq(I.chimeNotes('meal').length, 2, 'meal: two notes')
  eq(I.chimeNotes('water').length, 2, 'water: two notes')
  eq(I.chimeNotes('stand').length, 2, 'stand: two notes')
  eq(I.chimeNotes('unknown').length, 2, 'unknown falls back to meal')
})

test('meals view grows the window instead of scrolling; never shrinks', () => {
  /* 505 = 内容刚好放下，保持当前高度 */
  eq(I.mealWindowHeight(505, 600, 900), 600, 'fits: keep 600')
  /* 700 = 内容超出，窗口长到 93 + 700 = 793 */
  eq(I.mealWindowHeight(700, 600, 900), 793, 'overflows: grow to chrome + content')
  /* 内容超过视口：封顶到 900 - 16 = 884 */
  eq(I.mealWindowHeight(2000, 600, 900), 884, 'capped by the viewport')
  /* 已经很高时不回缩 */
  eq(I.mealWindowHeight(505, 700, 900), 700, 'never shrinks')
  /* 视口特别矮：不低于最小高度 */
  eq(I.mealWindowHeight(900, 600, 400), Math.max(305, 400 - 16), 'short viewport floor')
})

test('expanded window keeps its whole height on screen; the ball may hug the bottom', () => {
  const vp = { h: 900 }
  eq(I.clampPosition({ x: 100, y: 880 }, 316, 600).y, vp.h - 600 - 8, 'expanded window clamped by height')
  eq(I.clampPosition({ x: 100, y: 880 }, 32).y, vp.h - 64, 'collapsed ball keeps the old bottom margin')
})

use('locale')

test('registers zh and en dictionaries', () => {
  assert(dicts['dsh-body-clock'], 'no dictionary registered')
  assert(dicts['dsh-body-clock'].zh, 'no zh dictionary')
  assert(dicts['dsh-body-clock'].en, 'no en dictionary')
})

test('zh and en have exactly the same keys', () => {
  const zh = Object.keys(dicts['dsh-body-clock'].zh).sort()
  const en = Object.keys(dicts['dsh-body-clock'].en).sort()
  const missingEn = zh.filter((key) => en.indexOf(key) === -1)
  const missingZh = en.filter((key) => zh.indexOf(key) === -1)
  eq(missingEn, [], 'keys missing from en')
  eq(missingZh, [], 'keys missing from zh')
})

test('every literal t(\'…\') key used in client.js exists in the dictionary', () => {
  const used = new Set()
  const re = /\bt\('([A-Za-z][\w.]*)'\)/g
  let match = re.exec(source)
  while (match) {
    used.add(match[1])
    match = re.exec(source)
  }
  const zh = dicts['dsh-body-clock'].zh
  const missing = [...used].filter((key) => zh[key] === undefined)
  eq(missing, [], 'unknown literal keys')
  assert(used.size > 60, 'expected many literal lookups, found ' + used.size)
})

test('feature keys exist for all three reminder kinds', () => {
  const zh = dicts['dsh-body-clock'].zh
  const required = [
    'mode.food', 'mode.water', 'mode.stand',
    'water.cup', 'water.undo', 'water.snooze', 'water.pause',
    'stand.now', 'stand.standing', 'stand.finish', 'stand.skip',
    'stand.duration', 'stand.goal', 'stand.every',
    'pill.breakfast', 'pill.lunch', 'pill.dinner',
    'reminders.hour', 'reminders.minute', 'reminders.badTime',
  ]
  const missing = required.filter((key) => zh[key] === undefined)
  eq(missing, [], 'missing user-facing strings')
})

/* ================================================================== */
/* 2. Time helpers                                                    */
/* ================================================================== */

use('time helpers')

test('isValidTime accepts 24-hour HH:MM only', () => {
  eq(I.isValidTime('00:00'), true)
  eq(I.isValidTime('23:59'), true)
  eq(I.isValidTime('07:30'), true)
  eq(I.isValidTime('24:00'), false)
  eq(I.isValidTime('7:30'), false)
  eq(I.isValidTime('12:60'), false)
  eq(I.isValidTime(''), false)
  eq(I.isValidTime(null), false)
})

test('normalizeTimePart parses digits and rejects out-of-range halves', () => {
  eq(I.normalizeTimePart('8', 23), 8)
  eq(I.normalizeTimePart('08', 23), 8)
  eq(I.normalizeTimePart('23', 23), 23)
  eq(I.normalizeTimePart('24', 23), null)
  eq(I.normalizeTimePart('59', 59), 59)
  eq(I.normalizeTimePart('60', 59), null)
  eq(I.normalizeTimePart('', 59), null)
  eq(I.normalizeTimePart('a1b2', 59), 12)
})

test('pad2 and clockOf format two digits', () => {
  eq(I.pad2(3), '03')
  eq(I.pad2(12), '12')
  const d = at(9, 5)
  eq(I.clockOf(d.getTime()), '09:05')
})

test('parseTime converts to minutes', () => {
  eq(I.parseTime('00:00'), 0)
  eq(I.parseTime('09:30'), 570)
  eq(I.parseTime('23:59'), 1439)
  eq(I.parseTime('bad'), null)
})

test('dayAtMinutes uses the same calendar day', () => {
  const day = at(15, 0)
  const ms = I.dayAtMinutes(day, 600)
  const d = new Date(ms)
  eq([d.getHours(), d.getMinutes()], [10, 0])
})

test('nextInWindow clamps before the window, inside it, and past the end', () => {
  const win = { start: 540, end: 1260 }
  const before = at(7, 0).getTime()
  eq(I.clockOf(I.nextInWindow(win, before, 60000)), '09:00', 'before start → start')
  const inside = at(12, 0).getTime()
  eq(I.clockOf(I.nextInWindow(win, inside, 45 * 60000)), '12:45', 'inside → now + delay')
  const late = at(22, 0).getTime()
  const next = I.nextInWindow(win, late, 60000)
  assert(next > late, 'past the end should roll to tomorrow')
  const d = new Date(next)
  eq([d.getHours(), d.getMinutes()], [9, 0], 'tomorrow start')
})

/* ================================================================== */
/* 3. Meal reminders                                                  */
/* ================================================================== */

use('meal reminders')

test('normalizeSettings falls back to defaults', () => {
  const settings = I.normalizeSettings(null)
  eq(settings.enabled, true)
  eq(settings.meals.breakfast, { on: true, time: '07:30' })
  eq(settings.meals.lunch, { on: true, time: '12:00' })
  eq(settings.meals.dinner, { on: true, time: '18:30' })
  eq(settings.lastFired, { date: '', meals: [] })
  eq(settings.sound, true, 'sound defaults to on')
})

test('normalizeSettings repairs invalid stored values', () => {
  const settings = I.normalizeSettings({
    enabled: 'yes',
    sound: 'loud',
    meals: { breakfast: { on: false, time: '25:00' }, lunch: { time: '11:11' } },
    lastFired: { date: todayKey(), meals: ['lunch', 'nope'] },
  })
  eq(settings.enabled, true, 'non-boolean keeps default')
  eq(settings.meals.breakfast, { on: false, time: '07:30' }, 'invalid time repaired')
  eq(settings.meals.lunch, { on: true, time: '11:11' }, 'missing switch defaults to on')
  eq(settings.lastFired.meals, ['lunch'], 'unknown meals filtered')
  eq(settings.sound, true, 'non-boolean sound keeps the default')
})

test('dueMeal fires inside the 30 minute grace window', () => {
  const now = at(12, 20)
  const settings = mealSettings(['07:30', '12:00', '18:30'])
  eq(I.dueMeal(settings, now), 'lunch', '12:20 should still remind lunch')
  eq(I.dueMeal(settings, at(12, 0)), 'lunch')
  eq(I.dueMeal(settings, at(11, 59)), null, 'nothing due yet')
})

test('dueMeal skips late, fired, disabled and switched-off meals', () => {
  const late = mealSettings(['07:30', '12:00', '18:30'])
  eq(I.dueMeal(late, at(12, 31)), null, 'past the grace window')
  const fired = mealSettings(['07:30', '12:00', '18:30'], ['lunch'])
  eq(I.dueMeal(fired, at(12, 5)), null, 'already reminded today')
  const off = mealSettings(['07:30', '12:00', '18:30'])
  off.meals.lunch.on = false
  eq(I.dueMeal(off, at(12, 5)), null, 'meal switched off')
  const disabled = mealSettings(['07:30', '12:00', '18:30'])
  disabled.enabled = false
  eq(I.dueMeal(disabled, at(12, 5)), null, 'master switch off')
})

test('dueMeal returns the earliest of several due meals', () => {
  const settings = mealSettings(['11:50', '11:55', '18:30'])
  eq(I.dueMeal(settings, at(12, 0)), 'breakfast')
})

test('mealTargetMs matches the configured clock time', () => {
  const settings = mealSettings(['07:30', '12:00', '18:30'])
  const target = new Date(I.mealTargetMs(settings, 'lunch', at(15, 0)))
  eq([target.getHours(), target.getMinutes()], [12, 0])
})

/* ================================================================== */
/* 4. Water reminders                                                 */
/* ================================================================== */

use('water reminders')

test('normalizeWaterSettings defaults and clamps', () => {
  eq(I.normalizeWaterSettings(null), { on: true, start: '09:00', end: '21:00', every: 60, goal: 8 })
  const clamped = I.normalizeWaterSettings({ every: 9999, goal: 0, start: '21:00', end: '08:00' })
  eq(clamped.every, 240, 'interval clamped')
  eq(clamped.goal, 1, 'goal clamped')
  eq(clamped.end, '21:00', 'end before start falls back')
})

test('normalizeWater starts a fresh day at zero cups', () => {
  const water = I.normalizeWater(null)
  eq(water.cups, 0)
  eq(water.date, todayKey())
  assert(water.nextAt > Date.now(), 'nextAt should be in the future')
})

test('normalizeWater resets cups when the stored day is old', () => {
  const water = I.normalizeWater({
    date: '2000-01-01',
    cups: 7,
    lastDrink: 1,
    pausedUntil: 999,
    standingUntil: 999,
    nextAt: Date.now() + 60000,
    settings: {},
  })
  eq(water.cups, 0, 'cups reset')
  eq(water.lastDrink, 0, 'lastDrink reset')
  eq(water.pausedUntil, 0, 'pause cleared')
})

test('normalizeWater catches up with a single reminder after a long absence', () => {
  const now = Date.now()
  const water = I.normalizeWater({
    date: todayKey(),
    cups: 1,
    nextAt: now - 3 * 3600000,
    settings: { on: true, start: '00:00', end: '23:59', every: 60, goal: 8 },
  })
  assert(water.nextAt > now, 'should not be overdue after load')
  near(water.nextAt - now, 3600000, 5000, 'one interval from now')
})

test('waterDue respects switch, goal, pause, window and schedule', () => {
  const due = waterState({ nextAt: Date.now() - 60000 })
  eq(I.waterDue(due, new Date()), true)
  eq(I.waterDue(waterState({ nextAt: Date.now() + 60000 }), new Date()), false, 'not yet')
  eq(I.waterDue(waterState({ nextAt: Date.now() - 60000, cups: 8 }), new Date()), false, 'goal reached')
  eq(I.waterDue(waterState({ nextAt: Date.now() - 60000, pausedUntil: Date.now() + 60000 }), new Date()), false, 'paused')
  const off = waterState({ nextAt: Date.now() - 60000 })
  off.settings.on = false
  eq(I.waterDue(off, new Date()), false, 'switched off')
  const early = waterState({ nextAt: Date.now() - 60000, settings: { on: true, start: '09:00', end: '21:00', every: 60, goal: 8 } })
  eq(I.waterDue(early, at(3, 0)), false, 'outside the active window')
})

test('waterAfterFire advances one interval from the planned time', () => {
  const base = waterState({ nextAt: at(12, 0).getTime() })
  const next = I.waterAfterFire(base, at(12, 1).getTime())
  eq(I.clockOf(next.nextAt), '13:00', 'no drift from the fire moment')
})

test('waterAfterFire stops for today after the window end', () => {
  const base = waterState({ nextAt: at(21, 0).getTime(), settings: { on: true, start: '09:00', end: '21:00', every: 60, goal: 8 } })
  const next = I.waterAfterFire(base, at(21, 0).getTime())
  const d = new Date(next.nextAt)
  assert(d.getDate() !== new Date().getDate() || d.getHours() === 9, 'should roll to tomorrow morning')
})

test('waterScheduleFrom honours snooze delays and the window', () => {
  const base = waterState({ settings: { on: true, start: '09:00', end: '21:00', every: 60, goal: 8 } })
  const snoozed = I.waterScheduleFrom(base, at(12, 0).getTime(), 30 * 60000)
  eq(I.clockOf(snoozed.nextAt), '12:30', 'snooze delay')
  const beforeWindow = I.waterScheduleFrom(base, at(7, 0).getTime())
  eq(I.clockOf(beforeWindow.nextAt), '09:00', 'clamped to window start')
})

/* ================================================================== */
/* 5. Stand-up reminders                                              */
/* ================================================================== */

use('stand-up reminders')

test('normalizeStandSettings defaults and clamps', () => {
  eq(I.normalizeStandSettings(null), { on: true, start: '09:00', end: '21:00', every: 45, duration: 3, goal: 6 })
  const clamped = I.normalizeStandSettings({ every: 999, duration: 0, goal: 99, start: '20:00', end: '08:00' })
  eq(clamped.every, 120, 'interval clamped')
  eq(clamped.duration, 1, 'duration clamped')
  eq(clamped.goal, 20, 'goal clamped')
  eq(clamped.end, '21:00', 'end before start falls back')
})

test('normalizeStand starts a fresh day clean', () => {
  const stand = I.normalizeStand(null)
  eq(stand.count, 0)
  eq(stand.standingUntil, 0)
  eq(stand.date, todayKey())
  assert(stand.nextAt > Date.now(), 'nextAt should be in the future')
})

test('normalizeStand resets yesterday and keeps today', () => {
  const old = I.normalizeStand({ date: '2000-01-01', count: 4, standingUntil: Date.now() + 90000, pausedUntil: 5 })
  eq([old.count, old.standingUntil, old.pausedUntil], [0, 0, 0])
  const today = I.normalizeStand({ date: todayKey(), count: 4, standingUntil: Date.now() + 90000, nextAt: Date.now() + 60000, settings: {} })
  eq(today.count, 4, 'same day keeps the count')
  assert(today.standingUntil > 0, 'same day keeps a running countdown')
})

test('standDue respects standing, goal, pause, window and schedule', () => {
  const due = standState({ nextAt: Date.now() - 60000 })
  eq(I.standDue(due, new Date()), true)
  eq(I.standDue(standState({ nextAt: Date.now() - 60000, standingUntil: Date.now() + 60000 }), new Date()), false, 'already standing')
  eq(I.standDue(standState({ nextAt: Date.now() - 60000, count: 6 }), new Date()), false, 'goal reached')
  eq(I.standDue(standState({ nextAt: Date.now() - 60000, pausedUntil: Date.now() + 60000 }), new Date()), false, 'paused')
  const off = standState({ nextAt: Date.now() - 60000 })
  off.settings.on = false
  eq(I.standDue(off, new Date()), false, 'switched off')
  eq(I.standDue(standState({ nextAt: Date.now() - 60000 }), at(3, 0)), false, 'outside the active window')
})

test('standScheduleFrom clamps into the active window', () => {
  const base = standState({ settings: { on: true, start: '09:00', end: '21:00', every: 45, duration: 3, goal: 6 } })
  eq(I.clockOf(I.standScheduleFrom(base, at(12, 0).getTime()).nextAt), '12:45', 'interval delay')
  const late = I.standScheduleFrom(base, at(22, 0).getTime())
  const d = new Date(late.nextAt)
  assert(d > new Date(), 'past the window rolls over')
  eq([d.getHours(), d.getMinutes()], [9, 0], 'tomorrow start')
})

/* ================================================================== */
/* 6. Collapsed ball                                                  */
/* ================================================================== */

use('collapsed ball')

test('idle ball is a focusable button with the plugin name', () => {
  const inst = createInstance(baseState())
  const pill = byClass(inst.nodes(), 'dfp-pill')
  eq(pill.length, 1, 'one ball')
  eq(pill[0].props.role, 'button')
  eq(pill[0].props.tabIndex, 0)
  eq(pill[0].props['aria-label'], '身体时钟')
  eq(byClassPrefix(inst.nodes(), 'dfp-win').length, 0, 'no window while collapsed')
})

test('meal reminder paints the eating icon with a red ring', () => {
  const inst = createInstance(baseState({ [S.pending]: { meal: 'lunch', water: false, stand: false, latest: 'meal' } }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  assert(classesOf(pill).indexOf('dfp-pending') !== -1, 'red ring class missing')
  assert(inst.text().indexOf('🍽️') !== -1, 'eating icon missing')
  assert(inst.text().indexOf('☀️') === -1, 'should not use the time-of-day emoji')
  assert(pill.props['aria-label'].indexOf('该吃午饭了') === 0, 'aria-label: ' + pill.props['aria-label'])
})

test('water reminder paints the droplet with a blue ring', () => {
  const inst = createInstance(baseState({ [S.pending]: { meal: null, water: true, stand: false, latest: 'water' } }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  assert(classesOf(pill).indexOf('dfp-pending-water') !== -1, 'blue ring class missing')
  assert(inst.text().indexOf('💧') !== -1, 'droplet missing')
  assert(pill.props['aria-label'].indexOf('该喝水啦') === 0)
})

test('stand reminder paints the standing icon with a green ring', () => {
  const inst = createInstance(baseState({ [S.pending]: { meal: null, water: false, stand: true, latest: 'stand' } }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  assert(classesOf(pill).indexOf('dfp-pending-stand') !== -1, 'green ring class missing')
  assert(inst.text().indexOf('🧍') !== -1, 'standing icon missing')
  assert(pill.props['aria-label'].indexOf('该起来站一会儿啦') === 0)
})

test('the newest unread reminder wins the ball', () => {
  const all = { meal: 'lunch', water: true, stand: true }
  eq(classesOf(byClass(createInstance(baseState({ [S.pending]: Object.assign({ latest: 'stand' }, all) })).nodes(), 'dfp-pill')[0]).indexOf('dfp-pending-stand') !== -1, true)
  eq(classesOf(byClass(createInstance(baseState({ [S.pending]: Object.assign({ latest: 'water' }, all) })).nodes(), 'dfp-pill')[0]).indexOf('dfp-pending-water') !== -1, true)
  eq(classesOf(byClass(createInstance(baseState({ [S.pending]: Object.assign({ latest: 'meal' }, all) })).nodes(), 'dfp-pill')[0]).indexOf('dfp-pending') !== -1, true)
})

test('Enter on the ball opens the window and clamps it on screen', () => {
  const inst = createInstance(baseState({ [S.pos]: { x: 1430, y: 40 } }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  pill.props.onKeyDown({ key: 'Enter', preventDefault() {} })
  eq(inst.state('open'), true, 'should open')
  assert(inst.state('pos').x <= 1440 - 316, 'window must not overflow: ' + inst.state('pos').x)
})

test('dragging the ball moves it and remembers the position', () => {
  const inst = createInstance(baseState({ [S.pos]: { x: 700, y: 300 } }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  const event = (extra) => Object.assign({
    button: 0,
    pointerId: 7,
    target: { closest: () => null },
    currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
    preventDefault() {},
  }, extra)
  pill.props.onPointerDown(event({ clientX: 700, clientY: 300 }))
  pill.props.onPointerMove(event({ clientX: 760, clientY: 330 }))
  eq(inst.state('pos'), { x: 760, y: 330 })
  inst.render()
  byClass(inst.nodes(), 'dfp-pill')[0].props.onPointerUp(event({ clientX: 760, clientY: 330 }))
  const saved = JSON.parse(storage['dsh-body-clock:ui:v1'])
  eq([saved.x, saved.y], [760, 330], 'position persisted')
  eq(inst.state('open'), false, 'a drag must not open the window')
})

test('a click (no movement) opens the window', () => {
  const inst = createInstance(baseState())
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  const event = (extra) => Object.assign({
    button: 0,
    pointerId: 3,
    target: { closest: () => null },
    currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
    preventDefault() {},
  }, extra)
  pill.props.onPointerDown(event({ clientX: 100, clientY: 100 }))
  pill.props.onPointerUp(event({ clientX: 100, clientY: 100 }))
  eq(inst.state('open'), true)
})

/* ================================================================== */
/* 7. Window, tabs and panels                                         */
/* ================================================================== */

use('window and panels')

test('three top-level tabs with the active one selected', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  const tabs = byClass(inst.nodes(), 'dfp-modetab')
  eq(tabs.length, 3, 'three tabs')
  const labels = tabs.map(textOf)
  assert(labels[0].indexOf('吃饭') !== -1, 'food tab label')
  assert(labels[1].indexOf('喝水') !== -1, 'water tab label')
  assert(labels[2].indexOf('站立') !== -1, 'stand tab label')
  eq(tabs.map((t) => t.props['aria-selected']), ['false', 'true', 'false'])
})

test('unread reminders put a dot on their tab', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'food',
    [S.pending]: { meal: null, water: true, stand: true, latest: 'stand' },
  }))
  const dots = byClass(inst.nodes(), 'dfp-tabdot')
  eq(dots.length, 2, 'two dots')
  assert(dots.some((d) => classesOf(d).indexOf('dfp-tabdot-water') !== -1), 'water dot')
  assert(dots.some((d) => classesOf(d).indexOf('dfp-tabdot-stand') !== -1), 'stand dot')
})

test('food tab keeps the three meals and the picker', () => {
  const inst = createInstance(baseState({ [S.open]: true }))
  eq(byClass(inst.nodes(), 'dfp-tab').length, 3, 'meal tabs')
  assert(inst.text().indexOf('帮我决定') !== -1, 'pick button')
  assert(inst.text().indexOf('候选食物') !== -1, 'food list section')
})

test('water panel shows goal dots, actions and the next reminder', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  eq(byClass(inst.nodes(), 'dfp-panel-dot').length, 8, 'dots equal the goal')
  eq(byClass(inst.nodes(), 'dfp-panel-dot-on').length, 3, 'filled equal the cups')
  const texts = ['喝了一杯', '撤销一杯', '稍后 30 分钟', '今天暂停', '下次提醒']
  texts.forEach((text) => assert(inst.text().indexOf(text) !== -1, 'missing: ' + text))
  assert(inst.text().indexOf('约 750 ml') !== -1, 'ml estimate')
})

test('water panel switches to the goal state and hides the reminder hint', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'water',
    [S.water]: waterState({ cups: 8 }),
  }))
  assert(inst.text().indexOf('今天达标啦') !== -1, 'goal state')
  eq(byClass(inst.nodes(), 'dfp-panel-dot-on').length, 8)
})

test('stand panel shows count, dots, actions and the next reminder', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand' }))
  eq(byClass(inst.nodes(), 'dfp-panel-dot').length, 6, 'dots equal the daily goal')
  eq(byClass(inst.nodes(), 'dfp-panel-dot-on').length, 2, 'filled equal the count')
  const texts = ['现在站一下', '稍后 10 分钟', '今天暂停', '下次提醒', '2', '/ 6 次']
  texts.forEach((text) => assert(inst.text().indexOf(text) !== -1, 'missing: ' + text))
})

test('stand panel becomes a countdown while standing', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'stand',
    [S.stand]: standState({ standingUntil: Date.now() + 120000 }),
    [S.standLeftMs]: 120000,
  }))
  assert(inst.text().indexOf('站立中') !== -1, 'title')
  assert(inst.text().indexOf('02:00') !== -1, 'timer: ' + inst.text())
  assert(inst.text().indexOf('完成') !== -1 && inst.text().indexOf('跳过') !== -1, 'finish/skip')
  assert(inst.text().indexOf('现在站一下') === -1, 'start button hidden')
  eq(byClass(inst.nodes(), 'dfp-stand-bar').length, 1, 'progress bar')
})

test('settings has three sections; each one renders its own fields', () => {
  const food = createInstance(baseState({ [S.open]: true, [S.view]: 'settings' }))
  eq(byClass(food.nodes(), 'dfp-modetab').length, 3, 'three settings tabs')
  eq(inputsWith(food.nodes(), 'data-time-group').length, 6, 'food: 6 time inputs')
  eq(inputsWith(food.nodes(), 'data-num-scope').length, 0, 'food: no number fields')

  const water = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'water' }))
  eq(inputsWith(water.nodes(), 'data-time-group', 'waterStart').length, 2, 'water start')
  eq(inputsWith(water.nodes(), 'data-time-group', 'waterEnd').length, 2, 'water end')
  eq(inputsWith(water.nodes(), 'data-num-scope', 'water').length, 2, 'water interval + goal')

  const stand = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'stand' }))
  eq(inputsWith(stand.nodes(), 'data-time-group', 'standStart').length, 2, 'stand start')
  eq(inputsWith(stand.nodes(), 'data-time-group', 'standEnd').length, 2, 'stand end')
  eq(inputsWith(stand.nodes(), 'data-num-scope', 'stand').length, 3, 'stand interval + duration + goal')
  assert(stand.text().indexOf('重置今天的站立') !== -1, 'stand reset button')
  assert(water.text().indexOf('重置今天的水') !== -1, 'water reset button')
  assert(food.text().indexOf('重置今天的提醒') !== -1, 'meal reset button')
  assert(food.text().indexOf('提醒音效') !== -1, 'sound toggle label')
  assert(food.text().indexOf('试听') !== -1, 'sound preview button')
})

test('settings controls carry roles and aria state', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings' }))
  const switches = byClass(inst.nodes(), 'dfp-switch')
  assert(switches.length >= 4, 'switches rendered, got ' + switches.length)
  switches.forEach((node) => {
    eq(node.props.role, 'switch')
    assert(node.props['aria-checked'] === 'true' || node.props['aria-checked'] === 'false')
  })
  const tabs = byClass(inst.nodes(), 'dfp-modetab')
  tabs.forEach((node) => eq(node.props.role, 'tab'))
})

/* ================================================================== */
/* 8. Reminder engine                                                 */
/* ================================================================== */

use('reminder engine')

/* A breakfast time one minute in the past (clamped so it never crosses
 * midnight, which would make the test flaky at 00:00). */
const minutesAgo = (delta) => {
  const now = new Date()
  const minutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - delta)
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}
const mealDueNow = () => mealSettings([minutesAgo(1), '11:00', '18:30'])

test('meal reminder while collapsed: shake + pending + no expansion', () => {
  const inst = createInstance(baseState({ [S.settings]: mealDueNow() }))
  inst.runEffects()
  assert(inst.sets.some(([i, v]) => i === S.shaking && v === true), 'did not shake')
  assert(inst.sets.some(([i, v]) => i === S.pending && v.meal === 'breakfast'), 'pending meal missing')
  eq(inst.sets.filter(([i]) => i === S.open).length, 0, 'must not expand by itself')
  const fired = inst.state('settings').lastFired
  eq(fired.meals, ['breakfast'], 'marked as reminded today')
  assert(inst.state('toast').text.indexOf('该吃早饭了') !== -1, 'toast should explain the reminder')
})

test('water reminder while collapsed: shake + pending + reschedule', () => {
  const due = waterState({ nextAt: Date.now() - 60000 })
  const inst = createInstance(baseState({ [S.water]: due }))
  inst.runEffects()
  assert(inst.sets.some(([i, v]) => i === S.pending && v.water === true), 'pending water missing')
  assert(inst.sets.some(([i, v]) => i === S.shaking && v === true), 'did not shake')
  eq(inst.sets.filter(([i]) => i === S.open).length, 0, 'must not expand')
  assert(inst.state('water').nextAt > due.nextAt, 'next reminder pushed forward')
})

test('stand reminder while collapsed: shake + pending + reschedule', () => {
  const due = standState({ nextAt: Date.now() - 60000 })
  const inst = createInstance(baseState({ [S.stand]: due }))
  inst.runEffects()
  assert(inst.sets.some(([i, v]) => i === S.pending && v.stand === true), 'pending stand missing')
  assert(inst.sets.some(([i, v]) => i === S.shaking && v === true), 'did not shake')
  eq(inst.sets.filter(([i]) => i === S.open).length, 0, 'must not expand')
  assert(inst.state('stand').nextAt > due.nextAt, 'next reminder pushed forward')
})

test('reminder while the window is open dots its tab without jumping', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'water',
    [S.settings]: mealDueNow(),
  }))
  inst.runEffects()
  const firstPhase = inst.sets.slice()
  inst.render()
  inst.runEffects()
  assert(firstPhase.some(([i, v]) => i === S.pending && v.meal === 'breakfast'), 'meal pending missing')
  eq(firstPhase.filter(([i, v]) => i === S.tab && v === 'food').length, 0, 'must not yank the tab')
  eq(inst.state('pending').meal, 'breakfast', 'dot survives on the other tab')
})

test('a reminder on the visible tab is acknowledged immediately', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'food',
    [S.settings]: mealDueNow(),
  }))
  inst.runEffects()
  inst.render()
  inst.runEffects()
  eq(inst.state('pending').meal, null, 'no dangling dot on the visible tab')
})

test('opening the window acknowledges the announced reminder', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'food',
    [S.pending]: { meal: null, water: false, stand: true, latest: 'stand' },
  }))
  inst.runEffects()
  eq(inst.state('tab'), 'stand', 'should land on the stand tab')
  eq(inst.state('pending').stand, false, 'dot cleared')
  assert(inst.state('toast').text.indexOf('该起来站一会儿啦') !== -1, 'ack toast')
})

test('clicking a tab clears its dot', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'food',
    [S.pending]: { meal: null, water: true, stand: true, latest: 'stand' },
  }))
  inst.render()
  inst.runEffects()
  inst.render()
  inst.runEffects()
  inst.button('喝水').props.onClick()
  inst.render()
  inst.runEffects()
  eq(inst.state('tab'), 'water', 'switched tab')
  eq(inst.state('pending').water, false, 'water dot cleared')
})

test('the earliest due reminder fires; the others wait', () => {
  const water = waterState({ nextAt: Date.now() - 200000 })
  const stand = standState({ nextAt: Date.now() - 400000 })
  const inst = createInstance(baseState({ [S.water]: water, [S.stand]: stand }))
  inst.runEffects()
  assert(inst.sets.some(([i, v]) => i === S.pending && v.stand === true), 'stand (older) should fire')
  assert(!inst.sets.some(([i, v]) => i === S.pending && v.water === true), 'water must wait')
})

test('an earlier meal reminder beats a later stand reminder', () => {
  const settings = mealSettings([minutesAgo(10), '11:00', '18:30'])
  const stand = standState({ nextAt: Date.now() - 60000 })
  const inst = createInstance(baseState({ [S.settings]: settings, [S.stand]: stand }))
  inst.runEffects()
  assert(inst.sets.some(([i, v]) => i === S.pending && v.meal === 'breakfast'), 'meal should fire')
  assert(!inst.sets.some(([i, v]) => i === S.pending && v.stand === true), 'stand must wait')
})

test('only one reminder shakes per minute', () => {
  const meal = mealDueNow()
  const water = waterState({ nextAt: Date.now() - 60000 })
  const inst = createInstance(baseState({ [S.settings]: meal, [S.water]: water }))
  inst.runEffects()
  inst.tick()
  inst.tick()
  const shakes = inst.sets.filter(([i, v]) => i === S.shaking && v === true)
  eq(shakes.length, 1, 'one shake, got ' + shakes.length)
})

test('the engine stays quiet while the settings are being edited', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.view]: 'settings',
    [S.settings]: mealDueNow(),
  }))
  inst.runEffects()
  eq(inst.sets.filter(([i]) => i === S.shaking).length, 0, 'no shake while editing')
  eq(inst.sets.filter(([i]) => i === S.pending).length, 0, 'no pending while editing')
})

/* ================================================================== */
/* 9. Actions                                                         */
/* ================================================================== */

use('actions')

test('drinking a cup: +1, reschedules, clears pending', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water', [S.pending]: { meal: null, water: true, stand: false, latest: 'water' } }))
  inst.render()
  inst.runEffects()
  inst.button('喝了一杯').props.onClick()
  eq(inst.state('water').cups, 4)
  assert(inst.state('water').nextAt > Date.now(), 'next reminder in the future')
  eq(inst.state('pending').water, false, 'pending cleared')
})

test('undoing a cup never goes below zero', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water', [S.water]: waterState({ cups: 0 }) }))
  inst.render()
  inst.button('撤销一杯').props.onClick()
  eq(inst.state('water').cups, 0)
})

test('snoozing water pushes the next reminder ~30 minutes', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  const before = inst.state('water').nextAt
  inst.button('稍后 30 分钟').props.onClick()
  const delta = inst.state('water').nextAt - Date.now()
  assert(delta > 25 * 60000 && delta < 31 * 60000, 'delta ' + Math.round(delta / 60000) + ' min')
  assert(inst.state('water').nextAt !== before)
})

test('pausing water for today stops reminders and can be resumed', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  inst.button('今天暂停').props.onClick()
  assert(inst.state('water').pausedUntil > Date.now(), 'paused until the end of the day')
  inst.render()
  inst.button('继续提醒').props.onClick()
  eq(inst.state('water').pausedUntil, 0, 'resumed')
})

test('changing the water interval reschedules from now', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'water' }))
  const input = inst.input('data-num-field', 'every')
  input.props.onFocus()
  inst.render()
  inst.input('data-num-field', 'every').props.onChange({ target: { value: '30' } })
  inst.render()
  inst.input('data-num-field', 'every').props.onBlur()
  eq(inst.state('water').settings.every, 30)
  const delta = inst.state('water').nextAt - Date.now()
  assert(delta > 28 * 60000 && delta < 31 * 60000, 'rescheduled to the new interval')
})

test('an invalid interval is rejected with a toast', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'water' }))
  inst.input('data-num-field', 'every').props.onFocus()
  inst.render()
  inst.input('data-num-field', 'every').props.onChange({ target: { value: '0' } })
  inst.render()
  inst.input('data-num-field', 'every').props.onBlur()
  eq(inst.state('water').settings.every, 60, 'unchanged')
  assert(inst.state('toast').text.length > 0, 'toast shown')
})

test('a time edit is committed on blur and rejects invalid clock values', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings' }))
  const hour = () => inst.input('data-time-field', 'hour')
  hour().props.onFocus()
  inst.render()
  hour().props.onChange({ target: { value: '08' } })
  inst.render()
  inst.nodes().filter((n) => n.type === 'input' && n.props['data-time-group'] === 'breakfast' && n.props['data-time-field'] === 'minute')[0]
    .props.onChange({ target: { value: '45' } })
  inst.render()
  inst.nodes().filter((n) => n.type === 'input' && n.props['data-time-group'] === 'breakfast' && n.props['data-time-field'] === 'minute')[0]
    .props.onBlur({ relatedTarget: null })
  eq(inst.state('settings').meals.breakfast.time, '08:45', 'valid time committed')

  const inst2 = createInstance(baseState({ [S.open]: true, [S.view]: 'settings' }))
  inst2.input('data-time-field', 'hour').props.onFocus()
  inst2.render()
  inst2.input('data-time-field', 'hour').props.onChange({ target: { value: '25' } })
  inst2.render()
  inst2.input('data-time-field', 'hour').props.onBlur({ relatedTarget: null })
  eq(inst2.state('settings').meals.breakfast.time, '07:30', 'invalid hour keeps the old value')
  assert(inst2.state('toast').text.length > 0, 'toast shown')
})

test('changing a meal time re-arms that meal for today', () => {
  const settings = mealSettings(['07:30', '12:00', '18:30'], ['breakfast'])
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settings]: settings }))
  const hour = inst.nodes().filter(
    (n) => n.type === 'input' && n.props['data-time-group'] === 'breakfast' && n.props['data-time-field'] === 'hour',
  )[0]
  hour.props.onFocus()
  inst.render()
  inst.nodes().filter((n) => n.type === 'input' && n.props['data-time-group'] === 'breakfast' && n.props['data-time-field'] === 'hour')[0]
    .props.onChange({ target: { value: '08' } })
  inst.render()
  inst.nodes().filter((n) => n.type === 'input' && n.props['data-time-group'] === 'breakfast' && n.props['data-time-field'] === 'minute')[0]
    .props.onBlur({ relatedTarget: null })
  eq(inst.state('settings').lastFired.meals, [], 'breakfast re-armed')
})

test('starting, finishing and skipping a stand', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand' }))
  inst.button('现在站一下').props.onClick()
  const standingUntil = inst.state('stand').standingUntil
  assert(standingUntil > Date.now() + 100000, 'countdown started (~3 min)')

  // finish early counts it
  const done = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand', [S.stand]: standState({ standingUntil: Date.now() + 100000 }), [S.standLeftMs]: 100000 }))
  done.button('完成').props.onClick()
  eq(done.state('stand').count, 3, 'counted')
  eq(done.state('stand').standingUntil, 0, 'countdown cleared')

  // skipping does not count
  const skip = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand', [S.stand]: standState({ standingUntil: Date.now() + 100000 }), [S.standLeftMs]: 100000 }))
  skip.button('跳过').props.onClick()
  eq(skip.state('stand').count, 2, 'not counted')
  eq(skip.state('stand').standingUntil, 0)
})

test('the countdown finishes itself and counts the stand', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.tab]: 'stand',
    [S.stand]: standState({ standingUntil: Date.now() - 1000 }),
    [S.standLeftMs]: 0,
  }))
  inst.runEffects()
  inst.tick()
  eq(inst.state('stand').count, 3, 'auto counted')
  eq(inst.state('stand').standingUntil, 0, 'countdown cleared')
})

test('snoozing and pausing stand-up reminders', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand' }))
  inst.button('稍后 10 分钟').props.onClick()
  const delta = inst.state('stand').nextAt - Date.now()
  assert(delta > 8 * 60000 && delta < 11 * 60000, 'snoozed ~10 min, got ' + Math.round(delta / 60000))
  inst.render()
  inst.button('今天暂停').props.onClick()
  assert(inst.state('stand').pausedUntil > Date.now(), 'paused')
  inst.render()
  inst.button('继续提醒').props.onClick()
  eq(inst.state('stand').pausedUntil, 0, 'resumed')
})

test('resetting today clears counts for both water and stand', () => {
  const water = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'water' }))
  water.button('重置今天的水').props.onClick()
  eq(water.state('water').cups, 0)

  const stand = createInstance(baseState({ [S.open]: true, [S.view]: 'settings', [S.settingsTab]: 'stand' }))
  stand.button('重置今天的站立').props.onClick()
  eq(stand.state('stand').count, 0)
  eq(stand.state('stand').standingUntil, 0)
})

test('reopening the window acknowledges a reminder that arrived while collapsed', () => {
  const inst = createInstance(baseState({
    [S.pending]: { meal: null, water: false, stand: true, latest: 'stand' },
  }))
  const pill = byClass(inst.nodes(), 'dfp-pill')[0]
  pill.props.onKeyDown({ key: 'Enter', preventDefault() {} })
  inst.render()
  inst.runEffects()
  eq(inst.state('open'), true, 'opened')
  eq(inst.state('tab'), 'stand', 'landed on the announced tab')
  eq(inst.state('pending').stand, false, 'mark cleared')
})

test('opening the settings lands on the section of the visible tab', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  const gear = inst.nodes().find((n) => n.type === 'button' && n.props.title === '打开提醒设置')
  assert(gear, 'settings button missing')
  gear.props.onClick()
  inst.render()
  eq(inst.state('view'), 'settings')
  eq(inst.state('settingsTab'), 'water', 'water section preselected')
})

test('closing the settings keeps the tab the user was on', () => {
  const inst = createInstance(baseState({
    [S.open]: true,
    [S.view]: 'settings',
    [S.settingsTab]: 'stand',
    [S.tab]: 'water',
  }))
  inst.button('完成').props.onClick()
  inst.render()
  eq(inst.state('view'), 'main')
  eq(inst.state('tab'), 'water')
})

test('the test-shake button shakes without leaving unread marks', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.view]: 'settings' }))
  inst.button('试一下晃动').props.onClick()
  assert(inst.sets.some(([i, v]) => i === S.shaking && v === true), 'did not shake')
  eq(inst.state('pending'), { meal: null, water: false, stand: false, latest: null }, 'no pending created')
})

/* ================================================================== */
/* 10. Persistence and robustness                                     */
/* ================================================================== */

use('persistence')

test('mounting persists every storage key', () => {
  const inst = createInstance(baseState())
  inst.runEffects()
  const keys = Object.keys(storage).sort()
  eq(keys, [
    'dsh-body-clock:data:v2',
    'dsh-body-clock:reminders:v1',
    'dsh-body-clock:stand:v1',
    'dsh-body-clock:ui:v1',
    'dsh-body-clock:water:v1',
  ])
})

test('the active tab is remembered, the open state is not', () => {
  const inst = createInstance(baseState({ [S.open]: true, [S.tab]: 'stand' }))
  inst.runEffects()
  const saved = JSON.parse(storage['dsh-body-clock:ui:v1'])
  eq(saved.tab, 'stand')
  eq(Object.prototype.hasOwnProperty.call(saved, 'open'), false, 'open state must not persist')
})

test('corrupt localStorage falls back to defaults without throwing', () => {
  storage['dsh-body-clock:reminders:v1'] = 'not json'
  storage['dsh-body-clock:water:v1'] = '{"cups": "many"}'
  storage['dsh-body-clock:stand:v1'] = '[]'
  storage['dsh-body-clock:data:v2'] = 'null'
  storage['dsh-body-clock:ui:v1'] = '{"x":"left","y":null}'
  const inst = createInstance({}, true)
  eq(inst.state('water').cups, 0)
  eq(inst.state('stand').count, 0)
  eq(inst.state('settings').meals.breakfast.time, '07:30')
  assert(inst.state('pos').x > 0, 'position repaired')
  inst.runEffects()
})

test('meal and water data survive a reload through storage', () => {
  const first = createInstance(baseState({ [S.open]: true, [S.tab]: 'water' }))
  first.runEffects()
  first.button('喝了一杯').props.onClick()
  first.render()
  first.runEffects()
  const savedWater = JSON.parse(storage['dsh-body-clock:water:v1'])
  eq(savedWater.cups, 4, 'cup written')
  const savedUi = JSON.parse(storage['dsh-body-clock:ui:v1'])
  eq(savedUi.tab, 'water', 'tab written')
})

/* ================================================================== */
/* 11. Package files                                                  */
/* ================================================================== */

use('package')

test('index.js exports apply()', () => {
  eq(typeof hostModule.apply, 'function')
})

test('cordis.patch.yml inserts the plugin row', () => {
  const patch = read('cordis.patch.yml')
  assert(patch.indexOf('dsh-body-clock') !== -1, 'row id missing')
  assert(/insert:/.test(patch), 'insert section missing')
})

test('package.json describes the bundle and client entry', () => {
  const pkg = JSON.parse(read('package.json'))
  eq(pkg.name, 'dsh-body-clock')
  eq(pkg.dsh.bundle.patch, './cordis.patch.yml')
  eq(pkg.dsh.client.platform, 'web')
  eq(pkg.dsh.client.immediately, true)
  assert(pkg.dsh.client.inject.length >= 2, 'client injections')
  assert(pkg.files.indexOf('client.js') !== -1, 'client.js shipped')
})

test('locale json files are valid and mention the plugin', () => {
  const zh = JSON.parse(read('locale/zh.json'))
  const en = JSON.parse(read('locale/en.json'))
  assert(zh.meta.title && zh.meta.title.length > 0)
  assert(en.meta.title && en.meta.title.length > 0)
  assert(zh.meta.description.indexOf('悬浮') !== -1)
})

test('icon.svg is a self-contained svg', () => {
  const svg = read('icon.svg')
  assert(svg.indexOf('<svg') !== -1 && svg.indexOf('</svg>') !== -1)
})

/* ================================================================== */
/* Report                                                            */
/* ================================================================== */

const bySection = new Map()
results.forEach((r) => {
  const section = r.name.split(' · ')[0]
  if (!bySection.has(section)) bySection.set(section, { pass: 0, fail: 0 })
  bySection.get(section)[r.ok ? 'pass' : 'fail'] += 1
})

console.log('')
for (const [section, counts] of bySection) {
  const status = counts.fail === 0 ? 'ok  ' : 'FAIL'
  console.log(status + '  ' + section.padEnd(22) + counts.pass + ' passed' + (counts.fail ? ', ' + counts.fail + ' failed' : ''))
}
const failures = results.filter((r) => !r.ok)
if (failures.length) {
  console.log('\nfailures:')
  failures.forEach((f) => {
    console.log('\n✗ ' + f.name)
    console.log('  ' + (f.err && f.err.message ? f.err.message : f.err))
  })
}
const total = results.length
const passed = total - failures.length
console.log('\n' + (failures.length ? '✗' : '✓') + ' ' + passed + '/' + total + ' tests passed\n')
process.exit(failures.length ? 1 : 0)
