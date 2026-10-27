/**
 * dsh-body-clock — Client half.
 *
 * Registers a free-floating, freely draggable window in the frame-wide
 * `shell.overlay` slot: pick breakfast / lunch / dinner at random, three times
 * per meal per day, with an editable candidate list. Position, collapsed state
 * and the candidate data are kept in localStorage so they survive reloads.
 *
 * The overlay layer is click-through, so only the window / pill box opts back
 * into pointer events; the rest of the page stays usable.
 */
window.__ModuleLoader__.load({
  id: 'dsh-body-clock',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React
    /* Real React has useLayoutEffect; the test/preview fake React only has
     * useEffect, so fall back there (measurement is a no-op without a DOM). */
    const useLayoutEffect = React.useLayoutEffect || React.useEffect

    const NS = 'dsh-body-clock'
    const STORAGE_DATA = 'dsh-body-clock:data:v2'
    const STORAGE_UI = 'dsh-body-clock:ui:v1'
    const STORAGE_SETTINGS = 'dsh-body-clock:reminders:v1'
    const STORAGE_WATER = 'dsh-body-clock:water:v1'
    const STORAGE_STAND = 'dsh-body-clock:stand:v1'
    const MEALS = ['breakfast', 'lunch', 'dinner']
    const MEAL_EMOJI = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }
    const MAX_PICKS = 3
    const WINDOW_WIDTH = 316
    /* Every view (meals / water / stand-up / settings) shares one window height,
     * so switching tabs never resizes the floating window. The value is the
     * natural height of the tallest view (meals), so nothing has to scroll at
     * this size; shorter views centre their content. */
    const WINDOW_HEIGHT = 600
    /* Header + segments + the smallest usable body: the floor when the viewport
     * is too short for the full height. */
    const WINDOW_HEIGHT_MIN = 305
    /* Header (41) + segments (52): the fixed chrome above the scrolling body. */
    const WINDOW_CHROME_HEIGHT = 93
    /* Diameter of the collapsed floating ball (a perfect circle). */
    const PILL_SIZE = 32

    /* ------------------------------------------------------------------ */
    /* Locale                                                             */
    /* ------------------------------------------------------------------ */

    const DICT_ZH = {
      title: '身体时钟',
      dragHint: '拖动这里移动窗口',
      minimize: '收起为悬浮球',
      'meal.breakfast': '早饭',
      'meal.lunch': '午饭',
      'meal.dinner': '晚饭',
      'result.label': '今日饭票',
      'result.pending': '还没决定',
      'ticket.stamp': '今日',
      'ticket.waiting': '等待开票',
      'pick': '帮我决定',
      'remaining.3': '今天还能纠结 3 次',
      'remaining.2': '还有 2 次机会哦',
      'remaining.1': '再纠结 1 次就没啦',
      'remaining.0': '纠结次数已用光，明天再来',
      'foods.title': '候选食物',
      'foods.empty': '还没有食物，快添加吧',
      add: '添加',
      delete: '删除',
      done: '完成',
      'add.placeholder': '输入食物名，如：螺蛳粉',
      confirm: '确定',
      cancel: '取消',
      'toast.noPicks': '次数用光啦！明天再来纠结吧',
      'toast.empty': '还没有食物哦，快添加吧',
      'toast.needName': '嘿！写点吃的名字呗',
      'toast.duplicate': '已经有这个啦',
      'toast.deleted': '已删除：',
      'toast.added': '已添加：',
      'remind.breakfast': '⏰ 到点啦，该吃早饭了',
      'remind.lunch': '⏰ 到点啦，该吃午饭了',
      'remind.dinner': '⏰ 到点啦，该吃晚饭了',
      'pill.breakfast': '该吃早饭了',
      'pill.lunch': '该吃午饭了',
      'pill.dinner': '该吃晚饭了',
      'reminders.title': '吃饭提醒',
      'reminders.settingsTitle': '提醒设置',
      'reminders.openSettings': '打开提醒设置',
      'reminders.open': '打开吃饭提醒设置',
      'reminders.back': '完成',
      'reminders.enable': '开启提醒',
      'reminders.hint': '到点后浮窗会晃动提醒你：收起成小图标时，晃的就是那个小图标，不会自动展开。每个饭点每天只提醒一次；编辑期间暂停提醒，点「完成」后才开始计时。',
      'reminders.time': '提醒时间',
      'reminders.time24': '提醒时间 · 24 小时制（HH:MM）',
      'reminders.badTime': '时间不对：小时 0–23、分钟 0–59',
      'reminders.hour': '小时',
      'reminders.minute': '分钟',
      'reminders.test': '试一下晃动',
      'sound.label': '提醒音效',
      'sound.test': '试听',
      'sound.hint': '三类提醒共用，音色各不相同；到点会连续响约 3 秒，试听依次播放。',
      'sound.blocked': '没有音频输出设备，或系统拦截了自动播放',
      'reminders.fired': '已提醒',
      'reminders.reset': '重置今天的提醒',
      'reminders.resetDone': '已重置，今天可以再次提醒',
      'mode.food': '吃饭',
      'mode.water': '喝水',
      'water.cup': '喝了一杯',
      'water.undo': '撤销一杯',
      'water.unit': '杯',
      'water.ml': '约 ',
      'water.mlUnit': ' ml',
      'water.next': '下次提醒',
      'water.ended': '今天的提醒已结束',
      'water.done': '🎉 今天达标啦',
      'water.off': '喝水提醒已关闭',
      'water.paused': '今天已暂停',
      'water.pause': '今天暂停',
      'water.resume': '继续提醒',
      'water.snooze': '稍后 30 分钟',
      'water.remind': '该喝水啦',
      'water.settings': '喝水提醒',
      'water.reset': '重置今天的水',
      'water.resetDone': '今天的水已重置',
      'water.every': '间隔',
      'water.everyUnit': '分钟',
      'water.goal': '目标',
      'water.start': '开始',
      'water.end': '结束',
      'water.hint': '达到目标或过了结束时间就不再提醒；点「喝了一杯」会把下次提醒推后一个间隔。',
      'water.badNumber': '数字不对，请检查后再填',
      'water.progress': '喝水进度',
      'mode.stand': '站立',
      'stand.settings': '站立提醒',
      'stand.remind': '该起来站一会儿啦',
      'stand.unit': '次',
      'stand.now': '现在站一下',
      'stand.standing': '站立中',
      'stand.finish': '完成',
      'stand.skip': '跳过',
      'stand.snooze': '稍后 10 分钟',
      'stand.every': '间隔',
      'stand.duration': '站立时长',
      'stand.goal': '每天次数',
      'stand.goalReached': '🎉 今天的站立都完成啦',
      'stand.off': '站立提醒已关闭',
      'stand.doneToast': '✅ 站够了，活动一下真不错',
      'stand.skippedToast': '这次先跳过，之后再来',
      'stand.reset': '重置今天的站立',
      'stand.resetDone': '今天的站立已重置',
      'stand.hint': '久坐后提醒你起来活动：到点浮窗会晃动，点「现在站一下」有倒计时。达到每日次数或过了结束时间就不再提醒。',
      'stand.progress': '站立进度',
    }

    const DICT_EN = {
      title: 'Body Clock',
      dragHint: 'Drag here to move the window',
      minimize: 'Collapse to floating pill',
      'meal.breakfast': 'Breakfast',
      'meal.lunch': 'Lunch',
      'meal.dinner': 'Dinner',
      'result.label': "TODAY'S TICKET",
      'result.pending': 'Undecided',
      'ticket.stamp': 'TODAY',
      'ticket.waiting': 'Not issued yet',
      'pick': 'Decide for me',
      'remaining.3': '3 decisions left today',
      'remaining.2': '2 chances left',
      'remaining.1': 'Last chance to dither',
      'remaining.0': 'Out of picks. See you tomorrow',
      'foods.title': 'Candidates',
      'foods.empty': 'No food yet, add some',
      add: 'Add',
      delete: 'Delete',
      done: 'Done',
      'add.placeholder': 'Dish name, e.g. ramen',
      confirm: 'OK',
      cancel: 'Cancel',
      'toast.noPicks': 'Out of picks! Come back tomorrow',
      'toast.empty': 'No food yet, add some first',
      'toast.needName': 'Write a dish name first',
      'toast.duplicate': 'Already on the list',
      'toast.deleted': 'Deleted: ',
      'toast.added': 'Added: ',
      'remind.breakfast': '⏰ Time for breakfast',
      'remind.lunch': '⏰ Time for lunch',
      'remind.dinner': '⏰ Time for dinner',
      'pill.breakfast': 'Breakfast time',
      'pill.lunch': 'Lunch time',
      'pill.dinner': 'Dinner time',
      'reminders.title': 'Meal reminders',
      'reminders.settingsTitle': 'Reminder settings',
      'reminders.openSettings': 'Open reminder settings',
      'reminders.open': 'Open meal reminder settings',
      'reminders.back': 'Done',
      'reminders.enable': 'Enable reminders',
      'reminders.hint': 'At mealtime the floating window shakes. While collapsed, only the small pill shakes — it never pops the window open. Each meal reminds you once a day; reminders pause while you edit and start after Done.',
      'reminders.time': 'Time',
      'reminders.time24': 'Time · 24-hour (HH:MM)',
      'reminders.badTime': 'Invalid time: hour 0–23, minute 0–59',
      'reminders.hour': 'hour',
      'reminders.minute': 'minute',
      'reminders.test': 'Test shake',
      'sound.label': 'Reminder sound',
      'sound.test': 'Preview',
      'sound.hint': 'Shared by all three reminders, each with its own tone; it chimes for about 3s when due. Preview plays them in order.',
      'sound.blocked': 'No audio output, or the system blocked playback',
      'reminders.fired': 'Notified',
      'reminders.reset': 'Reset today\'s reminders',
      'mode.food': 'Food',
      'mode.water': 'Water',
      'water.cup': 'Drank a cup',
      'water.undo': 'Undo a cup',
      'water.unit': 'cups',
      'water.ml': '~ ',
      'water.mlUnit': ' ml',
      'water.next': 'Next',
      'water.ended': 'No reminders left today',
      'water.done': '🎉 Goal reached',
      'water.off': 'Water reminders are off',
      'water.paused': 'Paused for today',
      'water.pause': 'Pause today',
      'water.resume': 'Resume',
      'water.snooze': 'Snooze 30 min',
      'water.remind': 'Time for water',
      'water.settings': 'Water reminders',
      'water.reset': 'Reset today',
      'water.resetDone': 'Water reset for today',
      'water.every': 'Every',
      'water.everyUnit': 'min',
      'water.goal': 'Goal',
      'water.start': 'Start',
      'water.end': 'End',
      'water.hint': 'Reminders stop at the goal or after the end time. "Drank a cup" pushes the next reminder one interval later.',
      'water.badNumber': 'Invalid number',
      'water.progress': 'Water progress',
      'mode.stand': 'Stand',
      'stand.settings': 'Stand-up reminders',
      'stand.remind': 'Time to stand up',
      'stand.unit': 'times',
      'stand.now': 'Stand now',
      'stand.standing': 'Standing',
      'stand.finish': 'Done',
      'stand.skip': 'Skip',
      'stand.snooze': 'Snooze 10 min',
      'stand.every': 'Every',
      'stand.duration': 'For',
      'stand.goal': 'Per day',
      'stand.goalReached': '🎉 All standing done for today',
      'stand.off': 'Stand-up reminders are off',
      'stand.doneToast': '✅ Nicely done — keep moving',
      'stand.skippedToast': 'Skipped this one',
      'stand.reset': 'Reset today',
      'stand.resetDone': 'Stand-up count reset',
      'stand.hint': 'Reminds you to get up after sitting. The window shakes at the due time and "Stand now" starts a countdown. Reminders stop at the daily goal or after the end time.',
      'stand.progress': 'Stand-up progress',
      'reminders.resetDone': 'Reset — reminders can fire again today',
    }

    /* ------------------------------------------------------------------ */
    /* Data                                                               */
    /* ------------------------------------------------------------------ */

    const DEFAULT_FOODS = {
      breakfast: ['豆浆+油条', '豆浆+包子', '白粥+咸菜', '牛奶+面包', '面条', '煎饼果子', '肠粉', '小笼包'],
      lunch: ['米饭+炒菜', '盖浇饭', '面条', '水饺', '麻辣烫', '黄焖鸡', '煲仔饭', '炒饭', '炸鸡', '汉堡'],
      dinner: ['火锅', '烧烤', '小龙虾', '炒菜', '烤肉', '酸菜鱼', '麻辣香锅', '串串', '寿司', '水煮鱼'],
    }

    const EMOJI_RULES = [
      { keys: ['豆浆', '牛奶'], emoji: '🥛' },
      { keys: ['油条'], emoji: '🍟' },
      { keys: ['粥'], emoji: '🥣' },
      { keys: ['包子', '饺子', '小笼', '蒸饺', '水饺'], emoji: '🥟' },
      { keys: ['面条', '拉面', '炒面', '拌面'], emoji: '🍜' },
      { keys: ['煎饼', '手抓饼'], emoji: '🥞' },
      { keys: ['米饭', '盖饭', '炒饭'], emoji: '🍚' },
      { keys: ['麻辣烫', '香锅', '火锅'], emoji: '🍲' },
      { keys: ['烧烤', '烤肉'], emoji: '🍖' },
      { keys: ['沙拉', '凉菜'], emoji: '🥗' },
      { keys: ['汉堡'], emoji: '🍔' },
      { keys: ['炸鸡', '鸡腿'], emoji: '🍗' },
      { keys: ['寿司'], emoji: '🍣' },
      { keys: ['小龙虾'], emoji: '🦞' },
      { keys: ['串串'], emoji: '🍢' },
      { keys: ['鱼'], emoji: '🐟' },
      { keys: ['面包', '吐司'], emoji: '🍞' },
      { keys: ['鸡蛋', '蛋饼'], emoji: '🥚' },
    ]

    function emojiOf(name) {
      const text = String(name || '')
      for (let i = 0; i < EMOJI_RULES.length; i += 1) {
        const rule = EMOJI_RULES[i]
        for (let j = 0; j < rule.keys.length; j += 1) {
          if (text.indexOf(rule.keys[j]) !== -1) return rule.emoji
        }
      }
      if (text.indexOf('粥') !== -1) return '🥣'
      if (text.indexOf('面') !== -1 || text.indexOf('粉') !== -1) return '🍜'
      if (text.indexOf('饭') !== -1) return '🍚'
      if (text.indexOf('鸡') !== -1) return '🍗'
      if (text.indexOf('蛋') !== -1) return '🥚'
      return '🍽️'
    }

    function todayKey() {
      const d = new Date()
      const m = ('0' + (d.getMonth() + 1)).slice(-2)
      const day = ('0' + d.getDate()).slice(-2)
      return d.getFullYear() + '-' + m + '-' + day
    }

    function emptyMeals() {
      return { breakfast: [], lunch: [], dinner: [] }
    }

    function zeroCounts() {
      return { breakfast: 0, lunch: 0, dinner: 0 }
    }

    function freshFoods() {
      return {
        breakfast: DEFAULT_FOODS.breakfast.slice(),
        lunch: DEFAULT_FOODS.lunch.slice(),
        dinner: DEFAULT_FOODS.dinner.slice(),
      }
    }

    function freshData() {
      return {
        lastDate: todayKey(),
        foods: freshFoods(),
        counts: zeroCounts(),
        picked: emptyMeals(),
        lastResult: null,
      }
    }

    function isArray(value) {
      return Object.prototype.toString.call(value) === '[object Array]'
    }

    function normalizeData(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const today = todayKey()
      const sameDay = source.lastDate === today
      const out = freshData()
      for (let i = 0; i < MEALS.length; i += 1) {
        const meal = MEALS[i]
        const list = source.foods ? source.foods[meal] : null
        out.foods[meal] = isArray(list)
          ? list.filter((item) => typeof item === 'string' && item.trim() !== '')
          : DEFAULT_FOODS[meal].slice()
        const count = source.counts ? source.counts[meal] : 0
        out.counts[meal] = typeof count === 'number' && isFinite(count) && count >= 0 ? Math.floor(count) : 0
        const picked = source.picked ? source.picked[meal] : null
        out.picked[meal] = isArray(picked) ? picked.filter((item) => typeof item === 'string') : []
      }
      // A new day resets the pick budget and the stored result.
      if (!sameDay) {
        out.counts = zeroCounts()
        out.picked = emptyMeals()
        out.lastResult = null
      }
      const lastResult = source.lastResult
      if (sameDay && lastResult && typeof lastResult === 'object'
        && MEALS.indexOf(lastResult.meal) !== -1 && typeof lastResult.name === 'string') {
        out.lastResult = {
          meal: lastResult.meal,
          name: lastResult.name,
          emoji: typeof lastResult.emoji === 'string' ? lastResult.emoji : emojiOf(lastResult.name),
        }
      }
      out.lastDate = today
      return out
    }

    function readJson(key) {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        return JSON.parse(raw)
      } catch (err) {
        return null
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch (err) {
        /* storage unavailable: fall back to in-memory state */
      }
    }

    /* ------------------------------------------------------------------ */
    /* Geometry                                                           */
    /* ------------------------------------------------------------------ */

    function viewport() {
      return {
        w: window.innerWidth || 1280,
        h: window.innerHeight || 800,
      }
    }

    function clamp(value, low, high) {
      return Math.min(Math.max(value, low), high)
    }

    /* A keydown that merely commits an IME candidate (Chinese/Japanese input)
     * must never be treated as "confirm". React exposes the native event, and
     * keyCode 229 is the legacy "still composing" signal. */
    function isComposingKey(event) {
      const native = event && event.nativeEvent
      if (!native) return false
      return native.isComposing === true || native.keyCode === 229
    }

    function defaultPosition() {
      const vp = viewport()
      return {
        x: Math.max(12, vp.w - WINDOW_WIDTH - 28),
        y: clamp(96, 12, Math.max(12, vp.h - WINDOW_HEIGHT - 12)),
      }
    }

    /* Window height for the meals body: never below the current height (so the
     * window cannot shrink when switching tabs), capped by the viewport. */
    function mealWindowHeight(mealBodyScrollHeight, currentHeight, viewportHeight) {
      const needed = WINDOW_CHROME_HEIGHT + mealBodyScrollHeight
      if (!(needed > currentHeight)) return currentHeight
      const cap = Math.max(WINDOW_HEIGHT_MIN, viewportHeight - 16)
      return Math.min(needed, cap)
    }

    function clampPosition(pos, width, height) {
      const vp = viewport()
      const boxWidth = typeof width === 'number' ? width : WINDOW_WIDTH
      const maxX = Math.max(8, vp.w - boxWidth - 8)
      /* A collapsed ball may sit near the bottom edge (64px is enough to grab
       * it); the expanded window keeps its whole height on screen. */
      const maxY = Math.max(8, typeof height === 'number' ? vp.h - height - 8 : vp.h - 64)
      const x = typeof pos.x === 'number' && isFinite(pos.x) ? pos.x : defaultPosition().x
      const y = typeof pos.y === 'number' && isFinite(pos.y) ? pos.y : defaultPosition().y
      return { x: Math.round(clamp(x, 8, maxX)), y: Math.round(clamp(y, 8, maxY)) }
    }

    /* ------------------------------------------------------------------ */
    /* Reminder settings                                                  */
    /* ------------------------------------------------------------------ */

    const DEFAULT_SETTINGS = {
      enabled: true,
      /* Short chime on reminders; users can switch it off in settings. */
      sound: true,
      meals: {
        breakfast: { on: true, time: '07:30' },
        lunch: { on: true, time: '12:00' },
        dinner: { on: true, time: '18:30' },
      },
      lastFired: { date: '', meals: [] },
    }

    const REMIND_GRACE_MINUTES = 30
    const SHAKE_DURATION = 6000

    /* Two soft sine notes at most; the pattern hints at the reminder kind
     * without being a jingle. Values are frequencies in Hz. */
    const CHIME_NOTES = {
      meal: [660, 880],
      water: [990, 1320],
      stand: [880, 660],
    }
    /* One chime "round" is two notes ~0.28s apart; rounds repeat every 0.5s.
     * A reminder keeps chiming for ~3s so it is hard to miss; the preview
     * button plays a shorter 1s version of each tone. */
    const CHIME_ROUND_SEC = 0.5
    const CHIME_REMIND_SEC = 3
    const CHIME_PREVIEW_SEC = 1
    function chimeNotes(kind) {
      return CHIME_NOTES[kind] || CHIME_NOTES.meal
    }
    function chimeRepeats(seconds) {
      const total = typeof seconds === 'number' && isFinite(seconds) ? seconds : CHIME_REMIND_SEC
      return Math.max(1, Math.round(total / CHIME_ROUND_SEC))
    }

    function isValidTime(value) {
      return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    }

    function pad2(value) {
      return (value < 10 ? '0' : '') + value
    }

    /* Parse one half of the split "hour : minute" fields. Empty or out-of-range
     * input returns null so the caller can revert and warn. */
    function normalizeTimePart(text, max) {
      const digits = String(text === null || text === undefined ? '' : text).replace(/\D/g, '')
      if (!digits) return null
      const value = parseInt(digits, 10)
      if (!isFinite(value) || value < 0 || value > max) return null
      return value
    }

    function parseTime(value) {
      if (!isValidTime(value)) return null
      const parts = value.split(':')
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
    }

    function normalizeSettings(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const out = {
        enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
        sound: typeof source.sound === 'boolean' ? source.sound : DEFAULT_SETTINGS.sound,
        meals: {},
        lastFired: { date: '', meals: [] },
      }
      for (let i = 0; i < MEALS.length; i += 1) {
        const meal = MEALS[i]
        const stored = source.meals && typeof source.meals[meal] === 'object' ? source.meals[meal] : null
        out.meals[meal] = {
          on: stored && typeof stored.on === 'boolean' ? stored.on : true,
          time: stored && isValidTime(stored.time) ? stored.time : DEFAULT_SETTINGS.meals[meal].time,
        }
      }
      const fired = source.lastFired
      if (fired && typeof fired === 'object' && typeof fired.date === 'string' && isArray(fired.meals)) {
        out.lastFired = {
          date: fired.date,
          meals: fired.meals.filter((meal) => MEALS.indexOf(meal) !== -1),
        }
      }
      return out
    }

    /* The first enabled meal whose time has arrived today (with a grace
     * window), skipping meals already reminded today. */
    function dueMeal(settings, now) {
      if (!settings.enabled) return null
      const date = todayKey()
      const fired = settings.lastFired && settings.lastFired.date === date
        ? settings.lastFired.meals || []
        : []
      const minutes = now.getHours() * 60 + now.getMinutes()
      for (let i = 0; i < MEALS.length; i += 1) {
        const meal = MEALS[i]
        const entry = settings.meals[meal]
        if (!entry || !entry.on) continue
        if (fired.indexOf(meal) !== -1) continue
        const target = parseTime(entry.time)
        if (target === null) continue
        const diff = minutes - target
        if (diff >= 0 && diff <= REMIND_GRACE_MINUTES) return meal
      }
      return null
    }

    /* ------------------------------------------------------------------ */
    /* Water reminder                                                     */
    /* ------------------------------------------------------------------ */

    const WATER_ML_PER_CUP = 250
    const WATER_SNOOZE_MS = 30 * 60 * 1000
    /* 1 minute is allowed on purpose: it makes the reminder easy to try out. */
    const WATER_EVERY_MIN = 1
    const WATER_EVERY_MAX = 240
    const WATER_GOAL_MIN = 1
    const WATER_GOAL_MAX = 24
    const WATER_CATCHUP_GRACE_MS = 30 * 60 * 1000

    const DEFAULT_WATER = {
      on: true,
      start: '09:00',
      end: '21:00',
      every: 60,
      goal: 8,
    }

    function normalizeWaterSettings(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const start = isValidTime(source.start) ? source.start : DEFAULT_WATER.start
      const end = isValidTime(source.end) ? source.end : DEFAULT_WATER.end
      const every = typeof source.every === 'number' && isFinite(source.every)
        ? Math.round(source.every)
        : DEFAULT_WATER.every
      const goal = typeof source.goal === 'number' && isFinite(source.goal)
        ? Math.round(source.goal)
        : DEFAULT_WATER.goal
      return {
        on: typeof source.on === 'boolean' ? source.on : DEFAULT_WATER.on,
        start,
        /* An end before the start would make the window empty: fall back. */
        end: parseTime(end) > parseTime(start) ? end : DEFAULT_WATER.end,
        every: clamp(every, WATER_EVERY_MIN, WATER_EVERY_MAX),
        goal: clamp(goal, WATER_GOAL_MIN, WATER_GOAL_MAX),
      }
    }

    function waterWindow(settings) {
      const start = parseTime(settings.start)
      const end = parseTime(settings.end)
      const from = start === null ? 540 : start
      const to = end === null || end <= from ? from + 60 : end
      return { start: from, end: to }
    }

    function dayAtMinutes(date, minutes) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes, 0, 0).getTime()
    }

    /* A time `delayMs` from now, clamped into today's active window and rolled
     * over to tomorrow's start once the window is over. */
    function nextInWindow(window_, nowMs, delayMs) {
      const now = new Date(nowMs)
      const dayStart = dayAtMinutes(now, window_.start)
      const dayEnd = dayAtMinutes(now, window_.end)
      let nextAt = nowMs + delayMs
      if (nextAt > dayEnd) {
        const tomorrow = new Date(nowMs + 24 * 3600 * 1000)
        nextAt = dayAtMinutes(tomorrow, window_.start)
      }
      if (nextAt < dayStart) nextAt = dayStart
      return nextAt
    }

    /* The next reminder time for a water schedule. */
    function waterScheduleFrom(water, nowMs, delayMs) {
      const settings = water.settings
      const delay = typeof delayMs === 'number' ? delayMs : settings.every * 60000
      return Object.assign({}, water, {
        nextAt: nextInWindow(waterWindow(settings), nowMs, delay),
      })
    }

    function normalizeWater(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const settings = normalizeWaterSettings(source.settings)
      const today = todayKey()
      const sameDay = source.date === today
      const cups = sameDay && typeof source.cups === 'number' && isFinite(source.cups)
        ? clamp(Math.floor(source.cups), 0, 99)
        : 0
      const lastDrink = sameDay && typeof source.lastDrink === 'number' && isFinite(source.lastDrink)
        ? source.lastDrink
        : 0
      const pausedUntil = sameDay && typeof source.pausedUntil === 'number' && isFinite(source.pausedUntil)
        ? source.pausedUntil
        : 0
      let nextAt = sameDay && typeof source.nextAt === 'number' && isFinite(source.nextAt)
        ? source.nextAt
        : 0
      const now = Date.now()
      if (!nextAt) {
        const seeded = waterScheduleFrom({ settings }, now)
        nextAt = seeded.nextAt
      }
      /* A long absence must not dump a pile of catch-up reminders: allow one. */
      if (nextAt < now - WATER_CATCHUP_GRACE_MS) nextAt = now + settings.every * 60000
      return { date: today, cups, lastDrink, pausedUntil, nextAt, settings }
    }

    function waterDue(water, now) {
      if (!water.settings.on) return false
      if (water.cups >= water.settings.goal) return false
      if (water.pausedUntil && now.getTime() < water.pausedUntil) return false
      const window_ = waterWindow(water.settings)
      const minutes = now.getHours() * 60 + now.getMinutes()
      if (minutes < window_.start || minutes > window_.end) return false
      return now.getTime() >= water.nextAt
    }

    /* After a reminder fired: advance one interval from the planned time (not
     * from "now"), so the cadence does not drift; stop for today at the end. */
    function waterAfterFire(water, nowMs) {
      const settings = water.settings
      const window_ = waterWindow(settings)
      const interval = settings.every * 60000
      const now = new Date(nowMs)
      const dayEnd = dayAtMinutes(now, window_.end)
      let nextAt = water.nextAt + interval
      if (nextAt <= nowMs) nextAt = nowMs + interval
      if (nextAt > dayEnd) {
        const tomorrow = new Date(nowMs + 24 * 3600 * 1000)
        nextAt = dayAtMinutes(tomorrow, window_.start)
      }
      return Object.assign({}, water, { nextAt })
    }

    /* "HH:MM" for a timestamp, used by the next-reminder hint. */
    function clockOf(timestamp) {
      const date = new Date(timestamp)
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes())
    }

    /* ------------------------------------------------------------------ */
    /* Stand-up reminder                                                  */
    /* ------------------------------------------------------------------ */

    const STAND_SNOOZE_MS = 10 * 60 * 1000
    const STAND_EVERY_MIN = 1
    const STAND_EVERY_MAX = 120
    const STAND_DURATION_MIN = 1
    const STAND_DURATION_MAX = 10
    const STAND_GOAL_MIN = 1
    const STAND_GOAL_MAX = 20

    const DEFAULT_STAND = {
      on: true,
      start: '09:00',
      end: '21:00',
      every: 45,
      duration: 3,
      goal: 6,
    }

    function normalizeStandSettings(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const start = isValidTime(source.start) ? source.start : DEFAULT_STAND.start
      const end = isValidTime(source.end) ? source.end : DEFAULT_STAND.end
      const every = typeof source.every === 'number' && isFinite(source.every)
        ? Math.round(source.every)
        : DEFAULT_STAND.every
      const duration = typeof source.duration === 'number' && isFinite(source.duration)
        ? Math.round(source.duration)
        : DEFAULT_STAND.duration
      const goal = typeof source.goal === 'number' && isFinite(source.goal)
        ? Math.round(source.goal)
        : DEFAULT_STAND.goal
      return {
        on: typeof source.on === 'boolean' ? source.on : DEFAULT_STAND.on,
        start,
        end: parseTime(end) > parseTime(start) ? end : DEFAULT_STAND.end,
        every: clamp(every, STAND_EVERY_MIN, STAND_EVERY_MAX),
        duration: clamp(duration, STAND_DURATION_MIN, STAND_DURATION_MAX),
        goal: clamp(goal, STAND_GOAL_MIN, STAND_GOAL_MAX),
      }
    }

    function standWindow(settings) {
      const start = parseTime(settings.start)
      const end = parseTime(settings.end)
      const from = start === null ? 540 : start
      const to = end === null || end <= from ? from + 60 : end
      return { start: from, end: to }
    }

    function standScheduleFrom(stand, nowMs, delayMs) {
      const settings = stand.settings
      const delay = typeof delayMs === 'number' ? delayMs : settings.every * 60000
      return Object.assign({}, stand, {
        nextAt: nextInWindow(standWindow(settings), nowMs, delay),
      })
    }

    function normalizeStand(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const settings = normalizeStandSettings(source.settings)
      const today = todayKey()
      const sameDay = source.date === today
      const count = sameDay && typeof source.count === 'number' && isFinite(source.count)
        ? clamp(Math.floor(source.count), 0, 99)
        : 0
      const lastStandAt = sameDay && typeof source.lastStandAt === 'number' && isFinite(source.lastStandAt)
        ? source.lastStandAt
        : 0
      const pausedUntil = sameDay && typeof source.pausedUntil === 'number' && isFinite(source.pausedUntil)
        ? source.pausedUntil
        : 0
      const standingUntil = sameDay && typeof source.standingUntil === 'number' && isFinite(source.standingUntil)
        ? source.standingUntil
        : 0
      let nextAt = sameDay && typeof source.nextAt === 'number' && isFinite(source.nextAt)
        ? source.nextAt
        : 0
      const now = Date.now()
      if (!nextAt) nextAt = standScheduleFrom({ settings }, now).nextAt
      if (nextAt < now - WATER_CATCHUP_GRACE_MS) nextAt = now + settings.every * 60000
      return { date: today, count, lastStandAt, pausedUntil, standingUntil, nextAt, settings }
    }

    function standDue(stand, now) {
      if (!stand.settings.on) return false
      if (stand.count >= stand.settings.goal) return false
      if (stand.standingUntil && now.getTime() < stand.standingUntil) return false
      if (stand.pausedUntil && now.getTime() < stand.pausedUntil) return false
      const window_ = standWindow(stand.settings)
      const minutes = now.getHours() * 60 + now.getMinutes()
      if (minutes < window_.start || minutes > window_.end) return false
      return now.getTime() >= stand.nextAt
    }

    /* Today's clock time of a meal reminder, used to order due reminders. */
    function mealTargetMs(settings, mealId, now) {
      const minutes = parseTime(settings.meals[mealId].time)
      if (minutes === null) return now.getTime()
      return dayAtMinutes(now, minutes)
    }

    /* ------------------------------------------------------------------ */
    /* Initial state                                                      */
    /* ------------------------------------------------------------------ */

    function loadInitialState() {
      const storedUi = readJson(STORAGE_UI)
      const ui = storedUi && typeof storedUi === 'object' ? storedUi : {}
      const meal = MEALS.indexOf(ui.meal) !== -1 ? ui.meal : 'breakfast'
      const position = typeof ui.x === 'number' && typeof ui.y === 'number'
        ? { x: ui.x, y: ui.y }
        : defaultPosition()
      const tab = ui.tab === 'water' || ui.tab === 'stand' ? ui.tab : 'food'
      return {
        data: normalizeData(readJson(STORAGE_DATA)),
        meal,
        tab,
        water: normalizeWater(readJson(STORAGE_WATER)),
        stand: normalizeStand(readJson(STORAGE_STAND)),
        /* Always start as the minimized floating pill: reopening DSH (or a page
         * reload) never pops the full window open by itself — a due reminder
         * shakes the pill instead and leaves it marked until the user opens
         * it with one click. */
        open: false,
        pos: clampPosition(position),
        settings: normalizeSettings(readJson(STORAGE_SETTINGS)),
      }
    }

    /* ------------------------------------------------------------------ */
    /* Styles (component-local; removed together with the component)      */
    /* ------------------------------------------------------------------ */

    const CSS = [
      '.dfp-root{position:fixed;z-index:60;pointer-events:auto;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;text-align:left;--dfp-meal:#c62b3a;--dfp-water:#1a6ab5;--dfp-stand:#1a7f4f;--dfp-ink:var(--dsw-alias-label-primary);--dfp-ink-2:var(--dsw-alias-label-secondary);--dfp-surface:var(--dsw-alias-bg-layer-1);--dfp-surface-2:var(--dsw-alias-bg-layer-2);--dfp-line:var(--dsw-alias-border-l2);--dfp-line-soft:var(--dsw-alias-border-l1);--dfp-hover:var(--dsw-alias-interactive-bg-hover);--dfp-ring:var(--dsw-alias-label-primary);--dfp-accent:var(--dfp-meal);--dfp-serif:"Songti SC","STSong","SimSun","Noto Serif CJK SC",serif;--dfp-ease:cubic-bezier(.22,1,.36,1);--dfp-dur:160ms}',
      '/* A ticket, not a card: square-ish corners, hairline edges, a dashed tear line. */',
      '.dfp-win{position:relative;display:flex;flex-direction:column;box-sizing:border-box;width:' + WINDOW_WIDTH + 'px;max-width:calc(100vw - 16px);border-radius:10px;border:1px solid var(--dfp-line);background:var(--dfp-surface);box-shadow:0 14px 32px -10px rgba(15,17,21,.34),0 2px 6px rgba(15,17,21,.08);overflow:hidden}',
      '.dfp-head{display:flex;align-items:center;gap:7px;padding:8px 8px 8px 12px;border-bottom:1px dashed var(--dfp-line);cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}',
      '.dfp-head:active{cursor:grabbing}',
      '/* Perforation dots instead of a drag grip. */',
      '.dfp-grip{display:inline-flex;flex-direction:row;align-items:center;gap:3px;flex:none;color:var(--dfp-ink-2);opacity:.55}',
      '.dfp-grip i{display:block;width:2px;height:2px;border-radius:50%;background:currentColor}',
      '.dfp-title{min-width:0;font-family:var(--dfp-serif);font-size:13.5px;font-weight:600;letter-spacing:.08em;color:var(--dfp-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dfp-spacer{flex:1 1 auto}',
      '.dfp-icon-btn{flex:none;width:26px;height:26px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:13px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background-color var(--dfp-dur) var(--dfp-ease),color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-icon-btn:hover{background:var(--dfp-hover);color:var(--dfp-ink)}',
      '.dfp-icon-btn:active{background:var(--dfp-hover)}',
      '.dfp-icon-btn.dfp-icon-btn-on{background:var(--dfp-hover);color:var(--dfp-ink)}',
      '.dfp-body{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;padding:0 12px 12px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}',
      '/* Level 1: section tabs, printed like ticket stubs (ink reverse for active). */',
      '.dfp-modetabs{display:flex;gap:2px;margin:10px 12px 8px;padding:2px;border:1px solid var(--dfp-line);border-radius:7px}',
      '.dfp-modetab{position:relative;flex:1;display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 6px;border:0;border-radius:5px;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:12.5px;font-weight:600;letter-spacing:.03em;white-space:nowrap;cursor:pointer;transition:background-color var(--dfp-dur) var(--dfp-ease),color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-modetab:hover{color:var(--dfp-ink)}',
      '.dfp-modetab.dfp-on{background:var(--dfp-ink);color:var(--dfp-surface)}',
      '.dfp-tabdot{display:inline-block;width:5px;height:5px;margin-left:4px;border-radius:50%;background:var(--dfp-meal);vertical-align:middle}',
      '.dfp-tabdot-water{background:var(--dfp-water)}',
      '.dfp-tabdot-stand{background:var(--dfp-stand)}',
      '/* Level 2: meal tabs keep the accent underline, in plain type. */',
      '.dfp-tabs{display:flex;gap:2px;margin-top:8px;border-bottom:1px solid var(--dfp-line-soft)}',
      '.dfp-tab{flex:1;min-height:32px;margin-bottom:-1px;padding:0 2px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:color var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-tab:hover{color:var(--dfp-ink)}',
      '.dfp-tab.dfp-on{color:var(--dfp-ink);border-bottom-color:var(--dfp-accent)}',
      '/* The ticket itself. */',
      '.dfp-ticket{position:relative;margin-top:12px;padding:9px 12px 10px;border:1px solid color-mix(in srgb,var(--dfp-accent) 20%,var(--dfp-line-soft));border-radius:7px;background:color-mix(in srgb,var(--dfp-accent) 4%,var(--dfp-surface));animation:dfp-ticket-in 260ms var(--dfp-ease)}',
      '.dfp-ticket.is-pending{border-style:dashed;background:var(--dfp-surface)}',
      '.dfp-ticket-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
      '.dfp-ticket-title{font-family:var(--dfp-serif);font-size:12px;font-weight:600;letter-spacing:.18em;color:var(--dfp-ink)}',
      '.dfp-ticket-no{font-size:12px;letter-spacing:.1em;color:var(--dfp-ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dfp-ticket-main{display:flex;align-items:center;gap:10px;margin-top:7px}',
      '.dfp-ticket-plate{flex:none;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:color-mix(in srgb,var(--dfp-accent) 10%,var(--dfp-surface));border:1px solid color-mix(in srgb,var(--dfp-accent) 26%,transparent);font-size:22px;line-height:1;animation:dfp-plate-in 260ms var(--dfp-ease)}',
      '.dfp-ticket-text{min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dfp-ticket-name{font-family:var(--dfp-serif);font-size:21px;font-weight:700;line-height:1.25;letter-spacing:.02em;color:var(--dfp-ink);word-break:break-word;overflow-wrap:anywhere;text-wrap:balance}',
      '.dfp-ticket-name.dfp-muted{font-family:inherit;font-size:14px;font-weight:600;letter-spacing:0;color:var(--dfp-ink-2)}',
      '.dfp-ticket-meta{font-size:12px;letter-spacing:.02em;color:var(--dfp-ink-2);font-variant-numeric:tabular-nums}',
      '.dfp-ticket-tear{position:relative;height:0;margin:9px -13px 0;border-top:1px dashed color-mix(in srgb,var(--dfp-accent) 26%,var(--dfp-line))}',
      '.dfp-ticket-tear::before,.dfp-ticket-tear::after{content:\'\';position:absolute;top:-5px;width:9px;height:9px;border-radius:50%;background:var(--dfp-surface)}',
      '.dfp-ticket-tear::before{left:-4px}',
      '.dfp-ticket-tear::after{right:-4px}',
      '.dfp-ticket-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}',
      '.dfp-ticket-left{font-size:12px;color:var(--dfp-ink-2)}',
      '.dfp-ticket-stamp{flex:none;padding:1px 6px;border-radius:2px;background:var(--dfp-accent);color:#fff;font-family:var(--dfp-serif);font-size:12px;font-weight:600;letter-spacing:.12em;line-height:1.5;transform:rotate(-6deg);animation:dfp-stamp-in 240ms var(--dfp-ease) both}',
      '@keyframes dfp-ticket-in{from{opacity:.55;transform:translateY(6px) rotate(-1.2deg)}to{opacity:1;transform:none}}',
      '@keyframes dfp-plate-in{from{transform:scale(.86)}to{transform:none}}',
      '@keyframes dfp-stamp-in{from{opacity:0;transform:rotate(-6deg) scale(1.35)}to{opacity:1;transform:rotate(-6deg) scale(1)}}',
      '/* Primary action reads like "issue the ticket". */',
      '.dfp-pick{width:100%;min-height:42px;margin-top:10px;padding:9px 12px;border:0;border-radius:7px;background:var(--dfp-accent);color:#fff;font:inherit;font-size:14px;font-weight:600;letter-spacing:.08em;cursor:pointer;transition:filter var(--dfp-dur) var(--dfp-ease),transform 110ms var(--dfp-ease),background-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-pick:hover:not(:disabled){filter:brightness(1.08)}',
      '.dfp-pick:active:not(:disabled){transform:scale(.99);filter:brightness(.95)}',
      '.dfp-pick:disabled{background:color-mix(in srgb,var(--dfp-ink) 8%,transparent);color:var(--dfp-ink-2);cursor:not-allowed}',
      '.dfp-sec{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--dfp-line-soft)}',
      '.dfp-sec-title{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dfp-ink)}',
      '.dfp-sec-count{padding:0 5px;border:1px solid var(--dfp-line);border-radius:3px;font-size:12px;color:var(--dfp-ink-2);font-variant-numeric:tabular-nums}',
      '.dfp-foods{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;padding-bottom:2px;align-content:flex-start}',
      '.dfp-empty{width:100%;padding:16px 8px;border:1px dashed var(--dfp-line);border-radius:6px;text-align:center;font-size:12px;color:var(--dfp-ink-2)}',
      '.dfp-chip{position:relative;display:inline-flex;align-items:center;gap:5px;overflow-wrap:anywhere;max-width:100%;min-height:28px;padding:4px 10px;border:1px solid var(--dfp-line-soft);border-radius:6px;background:var(--dfp-surface);font-size:13px;line-height:1.45;color:var(--dfp-ink);transition:background-color var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-chip.dfp-chip-on{padding-left:16px;background:color-mix(in srgb,var(--dfp-accent) 7%,var(--dfp-surface));border-color:color-mix(in srgb,var(--dfp-accent) 34%,transparent);font-weight:600}',
      '.dfp-chip.dfp-chip-on::before{content:\'\';position:absolute;left:6px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:var(--dfp-accent)}',
      '.dfp-chip.dfp-del{background:color-mix(in srgb,var(--dfp-accent) 5%,var(--dfp-surface));border-style:dashed;border-color:color-mix(in srgb,var(--dfp-accent) 26%,var(--dfp-line));cursor:pointer}',
      '.dfp-chip.dfp-del:hover{background:color-mix(in srgb,var(--dfp-accent) 12%,var(--dfp-surface))}',
      '.dfp-chip-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-left:1px;border-radius:2px;background:var(--dfp-accent);color:#fff;font-size:12px;font-weight:700;line-height:1}',
      '.dfp-addrow{display:flex;gap:6px;margin-top:8px}',
      '.dfp-input{flex:1;min-width:0;height:32px;padding:0 10px;border:1px solid var(--dfp-line);border-radius:6px;background:var(--dfp-surface);color:var(--dfp-ink);font:inherit;font-size:13px;outline:none;transition:border-color var(--dfp-dur) var(--dfp-ease),box-shadow var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-input::placeholder{color:var(--dfp-ink-2);opacity:.9}',
      '.dfp-input:focus{border-color:color-mix(in srgb,var(--dfp-accent) 55%,var(--dfp-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--dfp-accent) 16%,transparent)}',
      '.dfp-mini{flex:none;min-height:32px;padding:0 12px;border:1px solid var(--dfp-line);border-radius:6px;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color var(--dfp-dur) var(--dfp-ease),color var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-mini:hover:not(:disabled){background:var(--dfp-hover);color:var(--dfp-ink)}',
      '.dfp-mini:disabled{color:var(--dfp-ink-2);border-color:var(--dfp-line-soft);cursor:not-allowed}',
      '.dfp-mini.dfp-mini-primary{border-color:transparent;background:var(--dfp-accent);color:#fff;font-weight:600}',
      '.dfp-mini.dfp-mini-primary:hover:not(:disabled){background:var(--dfp-accent);color:#fff;filter:brightness(1.08)}',
      '.dfp-actions{display:flex;gap:8px;margin-top:9px}',
      '.dfp-action{flex:1;min-height:32px;padding:0 8px;border:1px solid var(--dfp-line);border-radius:6px;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color var(--dfp-dur) var(--dfp-ease),color var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-action:hover{background:var(--dfp-hover);color:var(--dfp-ink)}',
      '.dfp-action.dfp-action-on{background:color-mix(in srgb,var(--dfp-accent) 10%,transparent);border-color:color-mix(in srgb,var(--dfp-accent) 32%,transparent);color:var(--dfp-ink);font-weight:600}',
      '/* Toast as a small receipt. */',
      '.dfp-toast{position:absolute;left:12px;right:12px;top:44px;z-index:2;padding:7px 12px;border:1px solid var(--dfp-line);border-radius:5px;background:var(--dfp-surface-2);color:var(--dfp-ink);font-size:13px;text-align:center;box-shadow:0 8px 20px -8px rgba(15,17,21,.35);pointer-events:none;opacity:0;transform:translateY(-4px);transition:opacity var(--dfp-dur) var(--dfp-ease),transform var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-toast.dfp-show{opacity:1;transform:translateY(0)}',
      '.dfp-pill{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid var(--dfp-line);border-radius:50%;background:var(--dfp-surface);box-shadow:0 4px 12px -2px rgba(15,17,21,.3);cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;transition:transform var(--dfp-dur) var(--dfp-ease),box-shadow var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-pill:hover{transform:scale(1.08);box-shadow:0 6px 16px -3px rgba(15,17,21,.36)}',
      '.dfp-pill:active{cursor:grabbing}',
      '.dfp-pill-emoji{font-size:15px;line-height:1}',
      '.dfp-pill.dfp-pending{border-color:color-mix(in srgb,var(--dfp-meal) 60%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dfp-meal) 24%,transparent),0 4px 12px -2px rgba(15,17,21,.3)}',
      '.dfp-pill.dfp-pending-water{border-color:color-mix(in srgb,var(--dfp-water) 62%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dfp-water) 26%,transparent),0 4px 12px -2px rgba(15,17,21,.3)}',
      '.dfp-pill.dfp-pending-stand{border-color:color-mix(in srgb,var(--dfp-stand) 62%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dfp-stand) 26%,transparent),0 4px 12px -2px rgba(15,17,21,.3)}',
      '/* Panels share the ticket\'s plain, ruled structure. */',
      '.dfp-panel-hero{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:10px}',
      '.dfp-panel-emoji{font-size:26px;line-height:1.15}',
      '.dfp-panel-count{font-size:18px;font-weight:600;color:var(--dfp-ink);font-variant-numeric:tabular-nums}',
      '.dfp-panel-count b{font-size:26px;font-weight:700}',
      '.dfp-panel-sub{font-size:12px;color:var(--dfp-ink-2)}',
      '.dfp-panel-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:14px 0 2px}',
      '.dfp-panel-dot{width:8px;height:8px;border-radius:50%;background:color-mix(in srgb,var(--dfp-ink) 14%,transparent)}',
      '.dfp-panel-dot-on{background:var(--dfp-water)}',
      '.dfp-panel-dot-stand.dfp-panel-dot-on{background:var(--dfp-stand)}',
      '.dfp-panel-next{margin-top:8px;text-align:center;font-size:12px;color:var(--dfp-ink-2);font-variant-numeric:tabular-nums}',
      '.dfp-panel-cta{margin-top:14px}',
      '.dfp-body-water,.dfp-body-set-water{--dfp-accent:var(--dfp-water)}',
      '.dfp-body-stand,.dfp-body-set-stand{--dfp-accent:var(--dfp-stand)}',
      '.dfp-body-food,.dfp-body-set-food{--dfp-accent:var(--dfp-meal)}',
      '.dfp-stand-timer{margin-top:2px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:.01em;color:var(--dfp-ink);font-variant-numeric:tabular-nums}',
      '.dfp-stand-bar{height:6px;margin:12px 0 0;border-radius:999px;background:color-mix(in srgb,var(--dfp-ink) 12%,transparent);overflow:hidden}',
      '.dfp-stand-bar-fill{height:100%;border-radius:999px;background:var(--dfp-stand);transition:width .4s linear}',
      '.dfp-panel-row{display:flex;gap:6px;margin-top:10px}',
      '.dfp-panel-row .dfp-mini{flex:1;min-width:0;padding:0 4px;white-space:nowrap}',
      '/* Settings: ruled rows, printed section headers, stamped "fired" marks. */',
      '.dfp-set-row{display:flex;align-items:center;gap:8px;margin-top:12px;min-height:32px}',
      '.dfp-set-label{flex:1;min-width:0;font-size:13px;font-weight:500;color:var(--dfp-ink)}',
      '.dfp-set-hint{margin-top:10px;font-size:12px;line-height:1.65;color:var(--dfp-ink-2)}',
      '.dfp-set-divider{margin-top:16px;padding-top:12px;border-top:1px dashed var(--dfp-line);font-family:var(--dfp-serif);font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--dfp-ink-2)}',
      '.dfp-set-meal{flex-direction:column;align-items:stretch;gap:5px}',
      '.dfp-set-meal-main{display:flex;align-items:center;gap:8px}',
      '.dfp-set-meal-name{flex:1;min-width:0;font-size:13px;color:var(--dfp-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dfp-set-meal.dfp-off .dfp-set-meal-name{color:var(--dfp-ink-2)}',
      '.dfp-time-split{display:inline-flex;align-items:center;gap:3px;flex:none}',
      '.dfp-time-part{flex:none;width:34px;height:30px;padding:0;border:1px solid var(--dfp-line);border-radius:6px;background:var(--dfp-surface);color:var(--dfp-ink);font:inherit;font-size:13px;font-variant-numeric:tabular-nums;text-align:center;outline:none;transition:border-color var(--dfp-dur) var(--dfp-ease),box-shadow var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-time-part:focus{border-color:color-mix(in srgb,var(--dfp-accent) 55%,var(--dfp-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--dfp-accent) 16%,transparent)}',
      '.dfp-time-part:disabled{border-color:var(--dfp-line-soft);background:transparent;color:var(--dfp-ink-2);cursor:not-allowed}',
      '.dfp-time-part::placeholder{color:var(--dfp-ink-2);opacity:.9}',
      '.dfp-time-sep{color:var(--dfp-ink-2);font-size:13px;line-height:1}',
      '.dfp-switch{position:relative;flex:none;width:38px;height:24px;padding:0;border:1px solid var(--dfp-line);border-radius:999px;background:color-mix(in srgb,var(--dfp-ink) 8%,transparent);cursor:pointer;transition:background-color var(--dfp-dur) var(--dfp-ease),border-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dfp-ink-2);transition:transform var(--dfp-dur) var(--dfp-ease),background-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-switch.dfp-switch-on{background:var(--dfp-ink);border-color:transparent}',
      '.dfp-switch.dfp-switch-on .dfp-switch-knob{background:var(--dfp-surface);transform:translateX(14px)}',
      '.dfp-switch:disabled{opacity:.55;cursor:not-allowed}',
      '.dfp-num-part{width:44px;height:30px;padding:0;border:1px solid var(--dfp-line);border-radius:6px;background:var(--dfp-surface);color:var(--dfp-ink);font:inherit;font-size:13px;font-variant-numeric:tabular-nums;text-align:center;outline:none;transition:border-color var(--dfp-dur) var(--dfp-ease),box-shadow var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-num-part:focus{border-color:color-mix(in srgb,var(--dfp-accent) 55%,var(--dfp-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--dfp-accent) 16%,transparent)}',
      '.dfp-num-part:disabled{border-color:var(--dfp-line-soft);background:transparent;color:var(--dfp-ink-2);cursor:not-allowed}',
      '.dfp-set-unit{flex:none;font-size:12px;color:var(--dfp-ink-2)}',
      '.dfp-set-fired{flex:none;padding:1px 6px;border-radius:2px;background:var(--dfp-accent);color:#fff;font-family:var(--dfp-serif);font-size:12px;font-weight:600;letter-spacing:.08em;line-height:1.5;white-space:nowrap;transform:rotate(-4deg)}',
      '.dfp-set-resetrow{display:flex;justify-content:center;margin-top:12px}',
      '.dfp-link-btn{padding:4px 6px;border:0;border-radius:5px;background:transparent;color:var(--dfp-ink-2);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;transition:color var(--dfp-dur) var(--dfp-ease),background-color var(--dfp-dur) var(--dfp-ease)}',
      '.dfp-link-btn:hover{background:var(--dfp-hover);color:var(--dfp-ink)}',
      '.dfp-set-actions{display:flex;gap:8px;margin-top:16px}',
      '.dfp-set-actions .dfp-mini{flex:1}',
      '/* Focus: the host exposes --dsw-focus-ring-color as transparent, so the ring is',
      ' * drawn with the label colour instead of relying on it. */',
      '.dfp-root :where(button,input,[role="button"],[tabindex]):focus-visible{outline:2px solid var(--dfp-ring);outline-offset:2px}',
      '/* Reminder shake: a short wobble of the whole window (or of the ball). */',
      '@keyframes dfp-shake{0%,100%{transform:translate(0,0) rotate(0)}10%{transform:translate(-3px,2px) rotate(-.9deg)}22%{transform:translate(3px,-2px) rotate(.9deg)}34%{transform:translate(-3px,-1px) rotate(-.7deg)}46%{transform:translate(3px,1px) rotate(.7deg)}58%{transform:translate(-2px,2px) rotate(-.5deg)}70%{transform:translate(2px,-2px) rotate(.5deg)}84%{transform:translate(-1px,1px) rotate(-.3deg)}}',
      '.dfp-win.dfp-shake,.dfp-pill.dfp-shake{animation:dfp-shake .45s ease-in-out 13;box-shadow:0 0 0 3px color-mix(in srgb,var(--dfp-meal) 45%,transparent),0 14px 32px -10px rgba(15,17,21,.34)}',
      '@media (prefers-reduced-motion:reduce){.dfp-root *{transition-duration:1ms!important}.dfp-ticket,.dfp-ticket-plate,.dfp-ticket-stamp{animation:none}.dfp-win.dfp-shake,.dfp-pill.dfp-shake{animation:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--dfp-meal) 60%,transparent),0 14px 32px -10px rgba(15,17,21,.34)}}',
    ].join('\n')

    /* ------------------------------------------------------------------ */
    /* Component                                                          */
    /* ------------------------------------------------------------------ */

    function makeFoodPicker(t) {
      function FoodPicker() {
        const initial = useRef(null)
        if (initial.current === null) initial.current = loadInitialState()

        const [data, setData] = useState(initial.current.data)
        const [meal, setMeal] = useState(initial.current.meal)
        const [open, setOpen] = useState(initial.current.open)
        const [pos, setPos] = useState(initial.current.pos)
        const [deleteMode, setDeleteMode] = useState(false)
        const [adding, setAdding] = useState(false)
        const [draft, setDraft] = useState('')
        const [toast, setToast] = useState({ text: '', seq: 0 })
        const [toastOn, setToastOn] = useState(false)
        const [dragging, setDragging] = useState(false)
        const [view, setView] = useState('main')
        const [settings, setSettings] = useState(initial.current.settings)
        const [water, setWater] = useState(initial.current.water)
        const [stand, setStand] = useState(initial.current.stand)
        const [shaking, setShaking] = useState(false)
        /* Top level switch of the window: the meal picker or the water panel. */
        const [tab, setTab] = useState(initial.current.tab)
        /* Which settings block is shown: meal reminders or water reminders. */
        const [settingsTab, setSettingsTab] = useState('food')
        /* Unread reminders. `latest` says which one is shown on the collapsed
         * ball; each flag keeps the dot on its own tab until acknowledged. */
        const [pending, setPending] = useState({ meal: null, water: false, stand: false, latest: null })
        /* Milliseconds left of the stand-up countdown, ticked while standing. */
        const [standLeftMs, setStandLeftMs] = useState(0)
        /* Which meal's time field is being typed in, and the raw text in it. */
        const [timeEdit, setTimeEdit] = useState(null)
        /* Raw text of the water interval / goal number field being edited. */
        const [numEdit, setNumEdit] = useState(null)
        /* Bumped on every successful pick so the result can settle in. */
        const [freshSeq, setFreshSeq] = useState(0)
        /* Window height: starts at the meals-panel height and only ever grows,
         * so the meals view never needs an inner scrollbar. Every other view
         * shares this height. */
        const [winH, setWinH] = useState(WINDOW_HEIGHT)
        const winHRef = useRef(WINDOW_HEIGHT)
        const mealBodyRef = useRef(null)
        winHRef.current = winH

        const toastTimer = useRef(null)
        const shakeTimer = useRef(null)
        const audioRef = useRef(null)
        const settingsRef = useRef(settings)
        const dragRef = useRef(null)
        const inputRef = useRef(null)
        const openRef = useRef(open)
        const pendingRef = useRef(pending)
        const mealRef = useRef(meal)
        const posRef = useRef(pos)
        const tabRef = useRef(tab)
        const waterRef = useRef(water)
        const standRef = useRef(stand)
        const engineGateRef = useRef(0)
        const openAckRef = useRef(false)
        openRef.current = open
        pendingRef.current = pending
        mealRef.current = meal
        posRef.current = pos
        tabRef.current = tab
        waterRef.current = water
        standRef.current = stand
        settingsRef.current = settings

        /* Persist the business data. */
        useEffect(() => {
          writeJson(STORAGE_DATA, data)
        }, [data])

        /* Persist the pill's position and the selected meal. The open/closed state is
         * deliberately not restored: every launch starts collapsed. */
        const saveUi = useCallback((overrides) => {
          const next = overrides || {}
          writeJson(STORAGE_UI, {
            meal: typeof next.meal === 'string' ? next.meal : mealRef.current,
            tab: typeof next.tab === 'string' ? next.tab : tabRef.current,
            x: next.pos ? next.pos.x : posRef.current.x,
            y: next.pos ? next.pos.y : posRef.current.y,
          })
        }, [])

        useEffect(() => {
          saveUi()
        }, [meal, tab, saveUi])

        /* Persist the water / stand-up progress and schedules. */
        useEffect(() => {
          writeJson(STORAGE_WATER, water)
        }, [water])

        useEffect(() => {
          writeJson(STORAGE_STAND, stand)
        }, [stand])

        /* Roll the water / stand-up day over without a reload. */
        useEffect(() => {
          const timer = window.setInterval(() => {
            setWater((prev) => {
              if (prev.date === todayKey()) return prev
              return normalizeWater({ settings: prev.settings })
            })
            setStand((prev) => {
              if (prev.date === todayKey()) return prev
              return normalizeStand({ settings: prev.settings })
            })
          }, 60000)
          return () => window.clearInterval(timer)
        }, [])

        /* Keep the window inside the frame when the viewport changes. */
        useEffect(() => {
          const onResize = () => {
            const current = posRef.current
            const next = clampPosition(current)
            if (next.x === current.x && next.y === current.y) return
            setPos(next)
            saveUi({ pos: next })
          }
          window.addEventListener('resize', onResize)
          return () => window.removeEventListener('resize', onResize)
        }, [saveUi])

        /* Roll over to a new day without needing a reload. */
        useEffect(() => {
          const timer = window.setInterval(() => {
            setData((prev) => {
              const today = todayKey()
              if (prev.lastDate === today) return prev
              return Object.assign({}, prev, {
                lastDate: today,
                counts: zeroCounts(),
                picked: emptyMeals(),
                lastResult: null,
              })
            })
          }, 60000)
          return () => window.clearInterval(timer)
        }, [])

        const notify = useCallback((text, duration) => {
          setToast((prev) => ({ text, seq: prev.seq + 1 }))
          setToastOn(true)
          if (toastTimer.current) clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToastOn(false), duration || 1800)
        }, [])

        useEffect(() => () => {
          if (toastTimer.current) clearTimeout(toastTimer.current)
          if (shakeTimer.current) clearTimeout(shakeTimer.current)
        }, [])

        /* Browsers hand out an AudioContext in the "suspended" state until the
         * page has seen a user gesture. Unlock it on the first interaction so a
         * reminder that fires later — while nobody is touching the window — can
         * still make a sound. */
        useEffect(() => {
          const unlock = () => {
            try {
              const Ctx = window.AudioContext || window.webkitAudioContext
              if (!Ctx) return
              if (!audioRef.current) audioRef.current = new Ctx()
              const ctx = audioRef.current
              if (ctx.state === 'suspended' && ctx.resume) {
                const resumed = ctx.resume()
                if (resumed && resumed.catch) resumed.catch(() => {})
              }
            } catch (err) {
              /* No audio device: reminders still shake. */
            }
          }
          window.addEventListener('pointerdown', unlock, true)
          window.addEventListener('keydown', unlock, true)
          return () => {
            window.removeEventListener('pointerdown', unlock, true)
            window.removeEventListener('keydown', unlock, true)
          }
        }, [])

        /* A very short WebAudio chime. It stays silent when the user switched
         * sound off, on muted systems, or where WebAudio is unavailable; the
         * shake still carries the reminder in those cases. Returns false when
         * nothing could be played (used by the preview button to explain why). */
        const playChime = useCallback((kind, force, delay, seconds) => {
          if (!force && settingsRef.current && settingsRef.current.sound === false) return false
          try {
            const Ctx = window.AudioContext || window.webkitAudioContext
            if (!Ctx) return false
            let ctx = audioRef.current
            if (!ctx) {
              ctx = new Ctx()
              audioRef.current = ctx
            }
            /* Autoplay policy: resume on demand, ignore a rejected promise. */
            if (ctx.state === 'suspended' && ctx.resume) {
              const resumed = ctx.resume()
              if (resumed && resumed.catch) resumed.catch(() => {})
            }
            const start = ctx.currentTime + 0.02 + (typeof delay === 'number' ? delay : 0)
            const repeats = chimeRepeats(typeof seconds === 'number' ? seconds : CHIME_REMIND_SEC)
            for (let round = 0; round < repeats; round += 1) {
              chimeNotes(kind).forEach((freq, index) => {
                const oscillator = ctx.createOscillator()
                const gain = ctx.createGain()
                const at = start + round * CHIME_ROUND_SEC + index * 0.12
                oscillator.type = 'triangle'
                oscillator.frequency.setValueAtTime(freq, at)
                gain.gain.setValueAtTime(0.0001, at)
                gain.gain.exponentialRampToValueAtTime(0.14, at + 0.01)
                gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
                oscillator.connect(gain)
                gain.connect(ctx.destination)
                oscillator.start(at)
                oscillator.stop(at + 0.16)
              })
            }
            return true
          } catch (err) {
            /* No audio device / blocked context: keep the visual reminder. */
            return false
          }
        }, [])

        /* The preview button plays all three reminder chimes in sequence, so
         * the user can hear that meals, water and stand-up each have one. If
         * playback is impossible, say so instead of looking broken. */
        const previewChime = useCallback(() => {
          let ok = true
          ok = playChime('meal', true, 0, CHIME_PREVIEW_SEC) && ok
          ok = playChime('water', true, 1.3, CHIME_PREVIEW_SEC) && ok
          ok = playChime('stand', true, 2.6, CHIME_PREVIEW_SEC) && ok
          if (!ok) notify(t('sound.blocked'), 3000)
        }, [notify, playChime, t])

        /* ---- meal reminders ------------------------------------------- */

        useEffect(() => {
          writeJson(STORAGE_SETTINGS, settings)
        }, [settings])

        const startShake = useCallback(() => {
          setShaking(true)
          if (shakeTimer.current) clearTimeout(shakeTimer.current)
          shakeTimer.current = setTimeout(() => setShaking(false), SHAKE_DURATION)
        }, [])

        const markPending = useCallback((kind, mealId) => {
          setPending((prev) => ({
            meal: kind === 'meal' ? mealId : prev.meal,
            water: kind === 'water' ? true : prev.water,
            stand: kind === 'stand' ? true : prev.stand,
            latest: kind,
          }))
        }, [])

        const clearPending = useCallback((kind) => {
          setPending((prev) => {
            if (kind === 'meal') return prev.meal ? Object.assign({}, prev, { meal: null }) : prev
            const key = kind === 'water' ? 'water' : 'stand'
            return prev[key] ? Object.assign({}, prev, { [key]: false }) : prev
          })
        }, [])

        const fireReminder = useCallback((remindedMeal) => {
          const entry = settings.meals[remindedMeal]
          startShake()
          playChime('meal')
          /* Never expand on its own, and keep the meal marked afterwards: the
           * collapsed ball shows the eating icon until it is acknowledged, and
           * when the window is open the tab gets a dot. */
          markPending('meal', remindedMeal)
          setMeal(remindedMeal)
          notify(t('remind.' + remindedMeal) + ' · ' + entry.time, SHAKE_DURATION)
          setSettings((prev) => {
            const today = todayKey()
            const fired = prev.lastFired && prev.lastFired.date === today ? prev.lastFired.meals.slice() : []
            if (fired.indexOf(remindedMeal) === -1) fired.push(remindedMeal)
            return Object.assign({}, prev, { lastFired: { date: today, meals: fired } })
          })
        }, [markPending, notify, playChime, settings, startShake, t])

        const fireWater = useCallback(() => {
          startShake()
          playChime('water')
          const current = waterRef.current
          markPending('water')
          notify(
            t('water.remind') + ' · ' + current.cups + '/' + current.settings.goal + ' ' + t('water.unit'),
            SHAKE_DURATION,
          )
          setWater((prev) => waterAfterFire(prev, Date.now()))
        }, [markPending, notify, playChime, startShake, t])

        const fireStand = useCallback(() => {
          startShake()
          playChime('stand')
          const current = standRef.current
          markPending('stand')
          notify(
            t('stand.remind') + ' · ' + current.count + '/' + current.settings.goal + ' ' + t('stand.unit'),
            SHAKE_DURATION,
          )
          setStand((prev) => standScheduleFrom(prev, Date.now()))
        }, [markPending, notify, playChime, startShake, t])

        /* Opening the window acknowledges what the ball announced: land on that
         * tab, clear its mark, and explain it with a toast. Anything that
         * arrived at the same time stays marked on the other tab.
         * This only fires on the closed → open transition: a reminder that
         * arrives while the window is already open must not yank the user to
         * another tab (it only dots it). */
        useEffect(() => {
          if (open === openAckRef.current) return undefined
          openAckRef.current = open
          if (!open) return undefined
          const p = pendingRef.current
          if (!p.meal && !p.water && !p.stand) return undefined
          const has = { meal: !!p.meal, water: !!p.water, stand: !!p.stand }
          const kind = has[p.latest] ? p.latest : (has.meal ? 'meal' : (has.water ? 'water' : 'stand'))
          if (kind === 'water') {
            setTab('water')
            clearPending('water')
            const current = waterRef.current
            notify(
              t('water.remind') + ' · ' + current.cups + '/' + current.settings.goal + ' ' + t('water.unit'),
              2600,
            )
            return undefined
          }
          if (kind === 'stand') {
            setTab('stand')
            clearPending('stand')
            const current = standRef.current
            notify(
              t('stand.remind') + ' · ' + current.count + '/' + current.settings.goal + ' ' + t('stand.unit'),
              2600,
            )
            return undefined
          }
          const mealId = p.meal
          setTab('food')
          setView('main')
          setMeal(mealId)
          clearPending('meal')
          const entry = settings.meals[mealId]
          notify(t('pill.' + mealId) + (entry && entry.time ? ' · ' + entry.time : ''), 2600)
          return undefined
        }, [open, clearPending, notify, settings, t])

        /* Visiting a tab acknowledges its dot. */
        useEffect(() => {
          if (!open) return
          const p = pendingRef.current
          if (tab === 'water' && p.water) clearPending('water')
          else if (tab === 'stand' && p.stand) clearPending('stand')
          else if (tab === 'food' && p.meal) clearPending('meal')
        }, [tab, open, pending, clearPending])

        useEffect(() => {
          /* While the reminder settings are being edited, keep quiet: the timer
           * only starts once the user leaves the settings view ("完成"). */
          if (view === 'settings' && openRef.current) return undefined
          const check = () => {
            const now = new Date()
            const nowMs = now.getTime()
            if (nowMs < engineGateRef.current) return
            const priority = { meal: 0, water: 1, stand: 2 }
            const candidates = []
            const mealId = dueMeal(settings, now)
            if (mealId) candidates.push({ kind: 'meal', meal: mealId, at: mealTargetMs(settings, mealId, now) })
            if (waterDue(water, now)) candidates.push({ kind: 'water', at: water.nextAt })
            if (standDue(stand, now)) candidates.push({ kind: 'stand', at: stand.nextAt })
            if (candidates.length === 0) return
            /* The reminder that came due first fires first; ties keep the
             * meal > water > stand order. */
            candidates.sort((a, b) => (a.at - b.at) || (priority[a.kind] - priority[b.kind]))
            const first = candidates[0]
            if (first.kind === 'meal') fireReminder(first.meal)
            else if (first.kind === 'water') fireWater()
            else fireStand()
            /* One shake at a time: the next reminder waits a minute. */
            engineGateRef.current = nowMs + 60000
          }
          check()
          const timer = window.setInterval(check, 5000)
          return () => window.clearInterval(timer)
        }, [settings, water, stand, fireReminder, fireWater, fireStand, view, open])

        const toggleSettings = useCallback(() => {
          /* Opening the settings lands on the section that matches the visible
           * tab (meals or water). */
          setSettingsTab(['water', 'stand'].indexOf(tabRef.current) !== -1 ? tabRef.current : 'food')
          setView((prev) => (prev === 'settings' ? 'main' : 'settings'))
          setAdding(false)
          setDeleteMode(false)
        }, [])

        const setReminderEnabled = useCallback((enabled) => {
          setSettings((prev) => Object.assign({}, prev, { enabled }))
        }, [])

        const setSoundEnabled = useCallback((enabled) => {
          setSettings((prev) => Object.assign({}, prev, { sound: enabled }))
        }, [])

        const setMealReminder = useCallback((mealId, patch) => {
          setSettings((prev) => {
            const before = prev.meals[mealId] || {}
            const meals = Object.assign({}, prev.meals)
            meals[mealId] = Object.assign({}, before, patch)
            let lastFired = prev.lastFired
            /* Changing the time re-arms that meal for today, so a newly chosen
             * time can still fire today instead of being blocked by an earlier
             * reminder for the same meal. */
            if (typeof patch.time === 'string' && patch.time !== before.time) {
              const today = todayKey()
              const fired = lastFired && lastFired.date === today
                ? lastFired.meals.filter((item) => item !== mealId)
                : []
              lastFired = { date: today, meals: fired }
            }
            return Object.assign({}, prev, { meals, lastFired })
          })
        }, [])

        /* Clear today's "already reminded" marks so the reminder can fire again
         * today — useful right after changing a time, or for trying it out. */
        const resetRemindersToday = useCallback(() => {
          setSettings((prev) => Object.assign({}, prev, {
            lastFired: { date: todayKey(), meals: [] },
          }))
          notify(t('reminders.resetDone'))
        }, [notify, t])

        /* Test button: shake without recording a reminder. */
        const testShake = useCallback(() => {
          startShake()
          notify(t('reminders.test') + ' 🎵', SHAKE_DURATION)
        }, [notify, startShake, t])

        /* ---- water actions -------------------------------------------- */

        const drinkWater = useCallback(() => {
          const now = Date.now()
          setWater((prev) => waterScheduleFrom(
            Object.assign({}, prev, {
              cups: Math.min(prev.cups + 1, 99),
              lastDrink: now,
              pausedUntil: 0,
            }),
            now,
          ))
        }, [])

        const undoWater = useCallback(() => {
          setWater((prev) => (prev.cups > 0 ? Object.assign({}, prev, { cups: prev.cups - 1 }) : prev))
        }, [])

        const snoozeWater = useCallback(() => {
          setWater((prev) => {
            const now = Date.now()
            if (prev.cups >= prev.settings.goal) return prev
            return waterScheduleFrom(prev, now, WATER_SNOOZE_MS)
          })
        }, [])

        const togglePauseWater = useCallback(() => {
          setWater((prev) => {
            const now = Date.now()
            if (prev.pausedUntil && prev.pausedUntil > now) {
              return waterScheduleFrom(Object.assign({}, prev, { pausedUntil: 0 }), now)
            }
            const window_ = waterWindow(prev.settings)
            return Object.assign({}, prev, { pausedUntil: dayAtMinutes(new Date(now), window_.end) })
          })
        }, [])

        const setWaterSettings = useCallback((patch) => {
          setWater((prev) => waterScheduleFrom(
            Object.assign({}, prev, { settings: Object.assign({}, prev.settings, patch) }),
            Date.now(),
          ))
        }, [])

        const resetWaterToday = useCallback(() => {
          setWater((prev) => waterScheduleFrom(
            Object.assign({}, prev, { cups: 0, lastDrink: 0, pausedUntil: 0 }),
            Date.now(),
          ))
          notify(t('water.resetDone'))
        }, [notify, t])

        /* ---- stand-up actions ------------------------------------------ */

        const startStanding = useCallback(() => {
          const now = Date.now()
          setStand((prev) => {
            if (prev.standingUntil && prev.standingUntil > now) return prev
            return Object.assign({}, prev, {
              standingUntil: now + prev.settings.duration * 60000,
              pausedUntil: 0,
            })
          })
          clearPending('stand')
        }, [clearPending])

        const finishStanding = useCallback((counted) => {
          const now = Date.now()
          setStand((prev) => {
            if (!prev.standingUntil) return prev
            const next = Object.assign({}, prev, { standingUntil: 0 })
            if (counted) {
              next.count = Math.min(prev.count + 1, 99)
              next.lastStandAt = now
            }
            return standScheduleFrom(next, now)
          })
          notify(counted ? t('stand.doneToast') : t('stand.skippedToast'))
        }, [notify, t])

        const snoozeStand = useCallback(() => {
          setStand((prev) => {
            const now = Date.now()
            if (prev.count >= prev.settings.goal) return prev
            return standScheduleFrom(prev, now, STAND_SNOOZE_MS)
          })
        }, [])

        const togglePauseStand = useCallback(() => {
          setStand((prev) => {
            const now = Date.now()
            if (prev.pausedUntil && prev.pausedUntil > now) {
              return standScheduleFrom(Object.assign({}, prev, { pausedUntil: 0 }), now)
            }
            return Object.assign({}, prev, {
              pausedUntil: dayAtMinutes(new Date(now), standWindow(prev.settings).end),
            })
          })
        }, [])

        const setStandSettings = useCallback((patch) => {
          setStand((prev) => standScheduleFrom(
            Object.assign({}, prev, { settings: Object.assign({}, prev.settings, patch) }),
            Date.now(),
          ))
        }, [])

        const resetStandToday = useCallback(() => {
          setStand((prev) => standScheduleFrom(
            Object.assign({}, prev, { count: 0, lastStandAt: 0, pausedUntil: 0, standingUntil: 0 }),
            Date.now(),
          ))
          notify(t('stand.resetDone'))
        }, [notify, t])

        /* The stand-up countdown ticks twice a second and completes itself when
         * the time is up (also when the window is collapsed). */
        useEffect(() => {
          if (!stand.standingUntil) {
            setStandLeftMs(0)
            return undefined
          }
          const tick = () => {
            const left = standRef.current.standingUntil - Date.now()
            if (left <= 0) {
              setStandLeftMs(0)
              finishStanding(true)
              return
            }
            setStandLeftMs(left)
          }
          setStandLeftMs(Math.max(0, stand.standingUntil - Date.now()))
          const timer = window.setInterval(tick, 500)
          return () => window.clearInterval(timer)
        }, [stand.standingUntil, finishStanding])

        /* Focus the inline add field when it appears. */
        useEffect(() => {
          if (adding && inputRef.current) {
            try { inputRef.current.focus() } catch (err) { /* noop */ }
          }
        }, [adding])

        const list = data.foods[meal] || []
        const todayFired = settings.lastFired && settings.lastFired.date === todayKey()
          ? settings.lastFired.meals
          : []
        const used = data.counts[meal] || 0
        const left = Math.max(0, MAX_PICKS - used)
        const result = data.lastResult && data.lastResult.meal === meal ? data.lastResult : null

        const remainingText = useMemo(() => {
          if (left >= MAX_PICKS) return t('remaining.3')
          if (left === 2) return t('remaining.2')
          if (left === 1) return t('remaining.1')
          return t('remaining.0')
        }, [left, t])

        const pick = useCallback(() => {
          if (left <= 0) {
            notify(t('toast.noPicks'))
            return
          }
          if (!list.length) {
            notify(t('toast.empty'))
            return
          }
          const picked = data.picked[meal] || []
          let pool = list.filter((food) => picked.indexOf(food) === -1)
          if (!pool.length) pool = list.slice()
          const name = pool[Math.floor(Math.random() * pool.length)]
          setData((prev) => {
            const counts = Object.assign({}, prev.counts, { [meal]: (prev.counts[meal] || 0) + 1 })
            const pickedNext = Object.assign({}, prev.picked, { [meal]: (prev.picked[meal] || []).concat([name]) })
            return Object.assign({}, prev, {
              counts,
              picked: pickedNext,
              lastResult: { meal, name, emoji: emojiOf(name) },
            })
          })
          setFreshSeq((n) => n + 1)
        }, [data, left, list, meal, notify, t])

        const deleteFood = useCallback((food) => {
          setData((prev) => {
            const foods = Object.assign({}, prev.foods, {
              [meal]: (prev.foods[meal] || []).filter((item) => item !== food),
            })
            const picked = Object.assign({}, prev.picked, {
              [meal]: (prev.picked[meal] || []).filter((item) => item !== food),
            })
            return Object.assign({}, prev, { foods, picked })
          })
          notify(t('toast.deleted') + food)
        }, [meal, notify, t])

        const confirmAdd = useCallback(() => {
          const name = draft.trim()
          if (!name) {
            notify(t('toast.needName'))
            return
          }
          if (list.indexOf(name) !== -1) {
            notify(t('toast.duplicate'))
            return
          }
          setData((prev) => Object.assign({}, prev, {
            foods: Object.assign({}, prev.foods, {
              [meal]: (prev.foods[meal] || []).concat([name]),
            }),
          }))
          setDraft('')
          setAdding(false)
          notify(t('toast.added') + name)
        }, [draft, list, meal, notify, t])

        /* ---- dragging ------------------------------------------------- */

        const onPointerDown = useCallback((event) => {
          if (event.button !== undefined && event.button !== 0) return
          const target = event.target
          if (target && target.closest && target.closest('button,input')) return
          const origin = posRef.current
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: origin.x,
            originY: origin.y,
            moved: false,
          }
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch (err) { /* noop */ }
          setDragging(true)
          if (event.preventDefault) event.preventDefault()
        }, [])

        const onPointerMove = useCallback((event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
          if (!drag.moved) return
          const next = clampPosition(
            { x: drag.originX + dx, y: drag.originY + dy },
            openRef.current ? WINDOW_WIDTH : PILL_SIZE,
            /* 收起态保持旧边界（vp.h - 64），只有展开的大窗口才按真实高度收进视口。 */
            openRef.current ? winHRef.current : undefined,
          )
          setPos((prev) => (prev.x === next.x && prev.y === next.y ? prev : next))
        }, [])

        const endDrag = useCallback((event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          dragRef.current = null
          setDragging(false)
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch (err) { /* noop */ }
          if (!drag.moved) {
            if (!openRef.current) {
              /* The ball may sit in a corner the full window would overflow. */
              setPos((prev) => {
                const next = clampPosition(prev, WINDOW_WIDTH, winHRef.current)
                return next.x === prev.x && next.y === prev.y ? prev : next
              })
              setOpen(true)
            }
          } else {
            saveUi()
          }
        }, [saveUi])

        const dragHandlers = {
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        }

        /* ---- keep the meals view scroll-free ---------------------------- */

        /* The window is as tall as the tallest view (meals). Measuring the
         * meals body lets the window grow instead of scrolling when the user
         * adds food, or when the host font renders taller than the estimate.
         * It never shrinks, so switching tabs cannot resize the window. */
        useLayoutEffect(() => {
          const el = mealBodyRef.current
          if (!el) return
          const vp = window.innerHeight || 800
          const next = mealWindowHeight(el.scrollHeight, winHRef.current, vp)
          if (next <= winHRef.current) return
          winHRef.current = next
          setWinH(next)
          /* A taller window must not push its own bottom off screen. */
          const position = posRef.current
          if (position.y + next > vp - 8) {
            const y = Math.max(8, vp - next - 8)
            if (y !== position.y) setPos({ x: position.x, y })
          }
        })

        /* ---- render ---------------------------------------------------- */

        /* The window keeps WINDOW_HEIGHT unless the viewport is too short for the
         * current position; then it shrinks and the body scrolls instead. */
        const winMaxHeight = Math.max(
          WINDOW_HEIGHT_MIN,
          (window.innerHeight || 800) - pos.y - 8,
        )

        const header = h('div', Object.assign({
          className: 'dfp-head',
          title: t('dragHint'),
          style: dragging ? { cursor: 'grabbing' } : null,
        }, dragHandlers), [
          h('span', { key: 'grip', className: 'dfp-grip', 'aria-hidden': 'true' }, [
            h('i', { key: 'a' }), h('i', { key: 'b' }), h('i', { key: 'c' }),
          ]),
          h('span', { key: 'title', className: 'dfp-title' }, view === 'settings' ? t('reminders.settingsTitle') : t('title')),
          h('span', { key: 'spacer', className: 'dfp-spacer' }),
          h('button', {
            key: 'settings',
            type: 'button',
            className: 'dfp-icon-btn' + (view === 'settings' ? ' dfp-icon-btn-on' : ''),
            title: view === 'settings' ? t('reminders.back') : t('reminders.openSettings'),
            'aria-label': view === 'settings' ? t('reminders.back') : t('reminders.openSettings'),
            'aria-pressed': view === 'settings' ? 'true' : 'false',
            onClick: toggleSettings,
            onPointerDown: (event) => event.stopPropagation(),
          }, view === 'settings' ? '‹' : '⏰'),
          h('button', {
            key: 'min',
            type: 'button',
            className: 'dfp-icon-btn',
            title: t('minimize'),
            'aria-label': t('minimize'),
            onClick: () => setOpen(false),
            onPointerDown: (event) => event.stopPropagation(),
          }, '—'),
        ])

        if (!open) {
          /* The collapsed ball shows the newest unread reminder: meal keeps the
           * red ring, water a blue one, stand-up a green one. */
          const has = { meal: !!pending.meal, water: !!pending.water, stand: !!pending.stand }
          const shownKind = has[pending.latest]
            ? pending.latest
            : (has.meal ? 'meal' : (has.water ? 'water' : (has.stand ? 'stand' : null)))
          const shownMeal = shownKind === 'meal' ? pending.meal : null
          const mealEntry = shownMeal ? settings.meals[shownMeal] : null
          const label = shownKind === 'water'
            ? t('water.remind') + ' · ' + water.cups + '/' + water.settings.goal + ' ' + t('water.unit')
            : shownKind === 'stand'
              ? t('stand.remind') + ' · ' + stand.count + '/' + stand.settings.goal + ' ' + t('stand.unit')
              : shownMeal
                ? t('pill.' + shownMeal) + (mealEntry && mealEntry.time ? ' · ' + mealEntry.time : '')
                : t('title')
          const pillClass = shownKind === 'water'
            ? ' dfp-pending-water'
            : (shownKind === 'stand' ? ' dfp-pending-stand' : (shownMeal ? ' dfp-pending' : ''))
          const pillEmoji = shownKind === 'water'
            ? '💧'
            : (shownKind === 'stand' ? '🧍' : '🍽️')
          return h('div', { className: 'dfp-root', style: { left: pos.x + 'px', top: pos.y + 'px' } }, [
            h('style', { key: 'style' }, CSS),
            h('div', Object.assign({
              key: 'pill',
              className: 'dfp-pill' + pillClass + (shaking ? ' dfp-shake' : ''),
              title: label + ' · ' + t('dragHint'),
              role: 'button',
              tabIndex: 0,
              'aria-label': label,
              'aria-live': 'polite',
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                  if (event.preventDefault) event.preventDefault()
                  /* Same guard as a click: the ball may sit where the full
                   * window would overflow. */
                  setPos((prev) => {
                    const next = clampPosition(prev, WINDOW_WIDTH, winHRef.current)
                    return next.x === prev.x && next.y === prev.y ? prev : next
                  })
                  setOpen(true)
                }
              },
            }, dragHandlers), [
              h('span', { key: 'e', className: 'dfp-pill-emoji', 'aria-hidden': 'true' }, pillEmoji),
            ]),
          ])
        }

        const tabs = h('div', { className: 'dfp-tabs', role: 'tablist' }, MEALS.map((id) => h('button', {
          key: id,
          type: 'button',
          role: 'tab',
          className: 'dfp-tab' + (meal === id ? ' dfp-on' : ''),
          'aria-selected': meal === id ? 'true' : 'false',
          onClick: () => {
            setMeal(id)
            setAdding(false)
          },
        }, t('meal.' + id))))

        /* The result is a meal ticket: header with the ticket number, the
         * plate, the dish name, a tear-off line and the stamp. */
        const mealTime = settings.meals[meal] && settings.meals[meal].time
        const ticketNo = used ? pad2(used) : '--'
        const resultBlock = h('div', {
          key: 'ticket' + freshSeq,
          className: 'dfp-ticket' + (result ? '' : ' is-pending'),
        }, [
          h('div', { key: 'head', className: 'dfp-ticket-head' }, [
            h('span', { key: 't', className: 'dfp-ticket-title' }, t('result.label')),
            h('span', { key: 'n', className: 'dfp-ticket-no' }, 'NO.' + ticketNo),
          ]),
          h('div', { key: 'main', className: 'dfp-ticket-main' }, [
            h('div', { key: 'plate', className: 'dfp-ticket-plate', 'aria-hidden': 'true' },
              result ? result.emoji : '🤔'),
            h('div', { key: 'text', className: 'dfp-ticket-text' }, [
              h('div', {
                key: 'name',
                className: 'dfp-ticket-name' + (result ? '' : ' dfp-muted'),
                'aria-live': 'polite',
              }, result ? result.name : t('result.pending')),
              h('div', { key: 'meta', className: 'dfp-ticket-meta' },
                result
                  ? t('meal.' + meal) + (mealTime ? ' · ' + mealTime : '')
                  : t('ticket.waiting')),
            ]),
          ]),
          h('div', { key: 'tear', className: 'dfp-ticket-tear', 'aria-hidden': 'true' }),
          h('div', { key: 'foot', className: 'dfp-ticket-foot' }, [
            h('span', { key: 'l', className: 'dfp-ticket-left' }, remainingText),
            result
              ? h('span', { key: 's', className: 'dfp-ticket-stamp', 'aria-hidden': 'true' }, t('ticket.stamp'))
              : null,
          ]),
        ])

        const chips = list.length === 0
          ? h('div', { className: 'dfp-empty' }, t('foods.empty'))
          : list.map((food, index) => h('div', {
            key: food + ':' + index,
            className: 'dfp-chip'
              + (deleteMode ? ' dfp-del' : '')
              + (!deleteMode && result && result.name === food ? ' dfp-chip-on' : ''),
            role: deleteMode ? 'button' : undefined,
            tabIndex: deleteMode ? 0 : undefined,
            title: deleteMode ? t('delete') + ' ' + food : undefined,
            onClick: deleteMode ? () => deleteFood(food) : undefined,
            onKeyDown: deleteMode ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                deleteFood(food)
              }
            } : undefined,
          }, [
            h('span', { key: 'e', 'aria-hidden': 'true' }, emojiOf(food)),
            h('span', { key: 'n' }, food),
            deleteMode ? h('span', { key: 'x', className: 'dfp-chip-x', 'aria-hidden': 'true' }, '×') : null,
          ]))

        const addRow = adding ? h('div', { className: 'dfp-addrow' }, [
          h('input', {
            key: 'input',
            ref: inputRef,
            className: 'dfp-input',
            type: 'text',
            maxLength: 20,
            value: draft,
            placeholder: t('add.placeholder'),
            autoComplete: 'off',
            'aria-label': t('add.placeholder'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (isComposingKey(event)) return
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmAdd()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setAdding(false)
                setDraft('')
              }
            },
          }),
          h('button', { key: 'ok', type: 'button', className: 'dfp-mini dfp-mini-primary', onClick: confirmAdd }, t('confirm')),
          h('button', {
            key: 'no',
            type: 'button',
            className: 'dfp-mini',
            onClick: () => {
              setAdding(false)
              setDraft('')
            },
          }, t('cancel')),
        ]) : null

        const mainBody = h('div', {
          className: 'dfp-body dfp-body-food',
          ref: mealBodyRef,
        }, [
          tabs,
          resultBlock,
          h('button', {
            key: 'pick',
            type: 'button',
            className: 'dfp-pick',
            disabled: left <= 0,
            onClick: pick,
          }, t('pick')),
          h('div', { key: 'sec', className: 'dfp-sec' }, [
            h('span', { key: 't', className: 'dfp-sec-title' }, t('foods.title')),
            h('span', { key: 'c', className: 'dfp-sec-count' }, String(list.length)),
            h('span', { key: 's', className: 'dfp-spacer' }),
          ]),
          h('div', { key: 'foods', className: 'dfp-foods' }, chips),
          addRow,
          h('div', { key: 'actions', className: 'dfp-actions' }, [
            h('button', {
              key: 'add',
              type: 'button',
              className: 'dfp-action',
              onClick: () => {
                setAdding(true)
                setDeleteMode(false)
              },
            }, '+ ' + t('add')),
            h('button', {
              key: 'del',
              type: 'button',
              className: 'dfp-action' + (deleteMode ? ' dfp-action-on' : ''),
              onClick: () => {
                setDeleteMode((prev) => !prev)
                setAdding(false)
              },
            }, deleteMode ? t('done') : t('delete')),
          ]),
        ])

        /* ---- reminder settings view ------------------------------------ */

        const switchButton = (checked, onToggle, label, disabled) => h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          className: 'dfp-switch' + (checked ? ' dfp-switch-on' : ''),
          disabled: !!disabled,
          onClick: () => onToggle(!checked),
          onPointerDown: (event) => event.stopPropagation(),
        }, h('span', { className: 'dfp-switch-knob' }))

        /* ---- split hour : minute fields -------------------------------- */

        /* One time group is edited at a time. A group is a meal id, or
         * "waterStart" / "waterEnd" for the water reminder window. */
        const timeValueOf = (group) => {
          if (group === 'waterStart') return water.settings.start
          if (group === 'waterEnd') return water.settings.end
          if (group === 'standStart') return stand.settings.start
          if (group === 'standEnd') return stand.settings.end
          return settings.meals[group].time
        }

        const timeGroupLabel = (group) => {
          if (group === 'waterStart') return t('water.start')
          if (group === 'waterEnd') return t('water.end')
          if (group === 'standStart') return t('water.start')
          if (group === 'standEnd') return t('water.end')
          return t('meal.' + group)
        }

        const timeGroupDisabled = (group) => {
          if (group === 'waterStart' || group === 'waterEnd') return !water.settings.on
          if (group === 'standStart' || group === 'standEnd') return !stand.settings.on
          return !settings.enabled
        }

        /* Draft for one time group: the two raw field texts. */
        const timeDraftFor = (group) => {
          if (timeEdit && timeEdit.group === group) return timeEdit
          const stored = timeValueOf(group)
          const parts = isValidTime(stored) ? stored.split(':') : ['07', '30']
          return { group, hour: parts[0], minute: parts[1] }
        }

        const startTimeEdit = (group) => {
          if (!timeEdit || timeEdit.group !== group) setTimeEdit(timeDraftFor(group))
        }

        const editTimePart = (group, field, raw) => {
          const base = timeDraftFor(group)
          const next = Object.assign({}, base)
          next[field] = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '').slice(0, 2)
          setTimeEdit(next)
        }

        const applyTime = (group, value) => {
          if (group === 'waterStart') setWaterSettings({ start: value })
          else if (group === 'waterEnd') setWaterSettings({ end: value })
          else if (group === 'standStart') setStandSettings({ start: value })
          else if (group === 'standEnd') setStandSettings({ end: value })
          else setMealReminder(group, { time: value })
        }

        const commitTimeGroup = (group) => {
          if (!timeEdit || timeEdit.group !== group) return
          const hour = normalizeTimePart(timeEdit.hour, 23)
          const minute = normalizeTimePart(timeEdit.minute, 59)
          setTimeEdit(null)
          if (hour === null || minute === null) {
            notify(t('reminders.badTime'))
            return
          }
          applyTime(group, pad2(hour) + ':' + pad2(minute))
        }

        /* Commit when focus leaves the whole hour/minute group, not when it
         * moves from the hour field to the minute field. */
        const blurTimePart = (event, group) => {
          const next = event.relatedTarget
          if (next && next.dataset && next.dataset.timeGroup === group && next.dataset.timeField) return
          commitTimeGroup(group)
        }

        const timePart = (group, field, value) => h('input', {
          key: group + ':' + field,
          className: 'dfp-time-part',
          type: 'text',
          inputMode: 'numeric',
          maxLength: 2,
          value: value,
          disabled: timeGroupDisabled(group),
          placeholder: '00',
          'data-time-group': group,
          'data-time-field': field,
          'aria-label': timeGroupLabel(group) + ' ' + t(field === 'hour' ? 'reminders.hour' : 'reminders.minute'),
          onFocus: () => startTimeEdit(group),
          onChange: (event) => editTimePart(group, field, event.target.value),
          onBlur: (event) => blurTimePart(event, group),
          onKeyDown: (event) => {
            if (isComposingKey(event)) return
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.currentTarget.blur) event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setTimeEdit(null)
            }
          },
        })

        /* The "HH : MM" pair for one group, with any in-progress text. */
        const timeSplit = (group) => {
          const editing = !!timeEdit && timeEdit.group === group
          const stored = timeValueOf(group)
          const parts = isValidTime(stored) ? stored.split(':') : ['07', '30']
          return h('div', { key: 'split', className: 'dfp-time-split' }, [
            timePart(group, 'hour', editing ? timeEdit.hour : parts[0]),
            h('span', { key: 'sep', className: 'dfp-time-sep' }, ':'),
            timePart(group, 'minute', editing ? timeEdit.minute : parts[1]),
          ])
        }

        /* ---- water number fields --------------------------------------- */

        const commitNumber = (scope, field, min, max) => {
          if (!numEdit || numEdit.scope !== scope || numEdit.field !== field) return
          const text = numEdit.text
          setNumEdit(null)
          const value = normalizeTimePart(text, max)
          if (value === null || value < min) {
            notify(t('water.badNumber'))
            return
          }
          const patch = {}
          patch[field] = value
          if (scope === 'stand') setStandSettings(patch)
          else setWaterSettings(patch)
        }

        const numberField = (scope, field, value, min, max, label, disabled) => {
          const editing = !!numEdit && numEdit.scope === scope && numEdit.field === field
          return h('input', {
            key: scope + ':' + field,
            className: 'dfp-num-part',
            type: 'text',
            inputMode: 'numeric',
            maxLength: 3,
            value: editing ? numEdit.text : String(value),
            disabled: !!disabled,
            'data-num-scope': scope,
            'data-num-field': field,
            'aria-label': label,
            onFocus: () => setNumEdit({ scope, field, text: String(value) }),
            onChange: (event) => setNumEdit({
              scope,
              field,
              text: String(event.target.value).replace(/\D/g, '').slice(0, 3),
            }),
            onBlur: () => commitNumber(scope, field, min, max),
            onKeyDown: (event) => {
              if (isComposingKey(event)) return
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.currentTarget.blur) event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setNumEdit(null)
              }
            },
          })
        }

        /* ---- settings bodies ------------------------------------------- */

        const foodSettingsRows = [
          h('div', { key: 'enable', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('reminders.enable')),
            switchButton(settings.enabled, setReminderEnabled, t('reminders.enable')),
          ]),
          h('div', { key: 'sound', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('sound.label')),
            h('button', {
              key: 'preview',
              type: 'button',
              className: 'dfp-mini',
              onClick: previewChime,
            }, t('sound.test')),
            switchButton(settings.sound, setSoundEnabled, t('sound.label')),
          ]),
          h('div', { key: 'soundHint', className: 'dfp-set-hint' }, t('sound.hint')),
          h('div', { key: 'hint', className: 'dfp-set-hint' }, t('reminders.hint')),
          h('div', { key: 'divider', className: 'dfp-set-divider' }, t('reminders.time24')),
          ...MEALS.map((id) => h('div', {
            key: id,
            className: 'dfp-set-row dfp-set-meal'
              + (settings.enabled && settings.meals[id].on ? '' : ' dfp-off'),
          }, [
            h('div', { key: 'main', className: 'dfp-set-meal-main' }, [
              h('span', { key: 'n', className: 'dfp-set-meal-name' },
                MEAL_EMOJI[id] + ' ' + t('meal.' + id)),
              todayFired.indexOf(id) !== -1
                ? h('span', { key: 'f', className: 'dfp-set-fired' }, t('reminders.fired'))
                : null,
              timeSplit(id),
              switchButton(
                settings.meals[id].on,
                (next) => setMealReminder(id, { on: next }),
                t('meal.' + id) + ' ' + t('reminders.enable'),
                !settings.enabled,
              ),
            ]),
          ])),
        ]

        const waterSettingsRows = [
          h('div', { key: 'enable', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('water.settings')),
            switchButton(water.settings.on, (next) => setWaterSettings({ on: next }), t('water.settings')),
          ]),
          h('div', { key: 'hint', className: 'dfp-set-hint' }, t('water.hint')),
          h('div', { key: 'divider', className: 'dfp-set-divider' }, t('reminders.time24')),
          h('div', {
            key: 'start',
            className: 'dfp-set-row dfp-set-meal' + (water.settings.on ? '' : ' dfp-off'),
          }, [
            h('div', { key: 'main', className: 'dfp-set-meal-main' }, [
              h('span', { key: 'n', className: 'dfp-set-meal-name' }, '💧 ' + t('water.start')),
              timeSplit('waterStart'),
            ]),
          ]),
          h('div', {
            key: 'end',
            className: 'dfp-set-row dfp-set-meal' + (water.settings.on ? '' : ' dfp-off'),
          }, [
            h('div', { key: 'main', className: 'dfp-set-meal-main' }, [
              h('span', { key: 'n', className: 'dfp-set-meal-name' }, '💧 ' + t('water.end')),
              timeSplit('waterEnd'),
            ]),
          ]),
          h('div', { key: 'every', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('water.every')),
            numberField('water', 'every', water.settings.every, WATER_EVERY_MIN, WATER_EVERY_MAX, t('water.every'), !water.settings.on),
            h('span', { key: 'u', className: 'dfp-set-unit' }, t('water.everyUnit')),
          ]),
          h('div', { key: 'goal', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('water.goal')),
            numberField('water', 'goal', water.settings.goal, WATER_GOAL_MIN, WATER_GOAL_MAX, t('water.goal'), !water.settings.on),
            h('span', { key: 'u', className: 'dfp-set-unit' }, t('water.unit')),
          ]),
        ]

        const standSettingsRows = [
          h('div', { key: 'enable', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('stand.settings')),
            switchButton(stand.settings.on, (next) => setStandSettings({ on: next }), t('stand.settings')),
          ]),
          h('div', { key: 'hint', className: 'dfp-set-hint' }, t('stand.hint')),
          h('div', { key: 'divider', className: 'dfp-set-divider' }, t('reminders.time24')),
          h('div', {
            key: 'start',
            className: 'dfp-set-row dfp-set-meal' + (stand.settings.on ? '' : ' dfp-off'),
          }, [
            h('div', { key: 'main', className: 'dfp-set-meal-main' }, [
              h('span', { key: 'n', className: 'dfp-set-meal-name' }, '🧍 ' + t('water.start')),
              timeSplit('standStart'),
            ]),
          ]),
          h('div', {
            key: 'end',
            className: 'dfp-set-row dfp-set-meal' + (stand.settings.on ? '' : ' dfp-off'),
          }, [
            h('div', { key: 'main', className: 'dfp-set-meal-main' }, [
              h('span', { key: 'n', className: 'dfp-set-meal-name' }, '🧍 ' + t('water.end')),
              timeSplit('standEnd'),
            ]),
          ]),
          h('div', { key: 'every', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('stand.every')),
            numberField('stand', 'every', stand.settings.every, STAND_EVERY_MIN, STAND_EVERY_MAX, t('stand.every'), !stand.settings.on),
            h('span', { key: 'u', className: 'dfp-set-unit' }, t('water.everyUnit')),
          ]),
          h('div', { key: 'duration', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('stand.duration')),
            numberField('stand', 'duration', stand.settings.duration, STAND_DURATION_MIN, STAND_DURATION_MAX, t('stand.duration'), !stand.settings.on),
            h('span', { key: 'u', className: 'dfp-set-unit' }, t('water.everyUnit')),
          ]),
          h('div', { key: 'goal', className: 'dfp-set-row' }, [
            h('span', { key: 'l', className: 'dfp-set-label' }, t('stand.goal')),
            numberField('stand', 'goal', stand.settings.goal, STAND_GOAL_MIN, STAND_GOAL_MAX, t('stand.goal'), !stand.settings.on),
            h('span', { key: 'u', className: 'dfp-set-unit' }, t('stand.unit')),
          ]),
        ]

        const settingsFooter = [
          h('div', { key: 'actions', className: 'dfp-set-actions' }, [
            h('button', { key: 'test', type: 'button', className: 'dfp-mini', onClick: testShake }, t('reminders.test')),
            h('button', {
              key: 'back',
              type: 'button',
              className: 'dfp-mini dfp-mini-primary',
              onClick: () => setView('main'),
            }, t('reminders.back')),
          ]),
          h('div', { key: 'reset', className: 'dfp-set-resetrow' }, [
            h('button', {
              key: 'reset-btn',
              type: 'button',
              className: 'dfp-link-btn',
              onClick: settingsTab === 'water' ? resetWaterToday
                : (settingsTab === 'stand' ? resetStandToday : resetRemindersToday),
            }, settingsTab === 'water' ? t('water.reset')
              : (settingsTab === 'stand' ? t('stand.reset') : t('reminders.reset'))),
          ]),
        ]

        const settingsBody = h('div', {
          /* 设置页用 dfp-body-set-*：强调色跟着设置 tab 走，但不套用面板的居中/留白规则。 */
          className: 'dfp-body dfp-body-set-' + settingsTab,
        }, settingsTab === 'water'
          ? waterSettingsRows.concat(settingsFooter)
          : (settingsTab === 'stand'
            ? standSettingsRows.concat(settingsFooter)
            : foodSettingsRows.concat(settingsFooter)))

        /* ---- water panel ------------------------------------------------ */

        const waterNow = Date.now()
        const waterDone = water.cups >= water.settings.goal
        const waterPaused = !!(water.pausedUntil && water.pausedUntil > waterNow)
        const waterNextText = !water.settings.on
          ? t('water.off')
          : waterDone
            ? t('water.done')
            : waterPaused
              ? t('water.paused')
              : t('water.next') + ' ' + clockOf(water.nextAt)

        const waterBody = h('div', {
          className: 'dfp-body dfp-body-water',
        }, [
          h('div', { key: 'hero', className: 'dfp-panel-hero' }, [
            h('div', { key: 'drop', className: 'dfp-panel-emoji', 'aria-hidden': 'true' }, '💧'),
            h('div', {
              key: 'count',
              className: 'dfp-panel-count',
              'aria-live': 'polite',
              'aria-label': t('water.progress') + ' ' + water.cups + '/' + water.settings.goal,
            }, [
              h('b', { key: 'n' }, String(water.cups)),
              h('span', { key: 's' }, ' / ' + water.settings.goal + ' ' + t('water.unit')),
            ]),
            h('div', { key: 'ml', className: 'dfp-panel-sub' },
              t('water.ml') + String(water.cups * WATER_ML_PER_CUP) + t('water.mlUnit')),
          ]),
          h('div', { key: 'dots', className: 'dfp-panel-dots' }, Array.from({ length: water.settings.goal }, (_, index) => h('span', {
            key: index,
            className: 'dfp-panel-dot' + (index < water.cups ? ' dfp-panel-dot-on' : ''),
          }))),
          h('div', { key: 'next', className: 'dfp-panel-next' }, waterNextText),
          h('button', {
            key: 'drink',
            type: 'button',
            className: 'dfp-pick dfp-panel-cta',
            disabled: !water.settings.on,
            onClick: drinkWater,
          }, '💧 ' + t('water.cup')),
          h('div', { key: 'row', className: 'dfp-panel-row' }, [
            h('button', {
              key: 'undo',
              type: 'button',
              className: 'dfp-mini',
              disabled: water.cups <= 0,
              onClick: undoWater,
            }, t('water.undo')),
            h('button', {
              key: 'snooze',
              type: 'button',
              className: 'dfp-mini',
              disabled: !water.settings.on || waterPaused || waterDone,
              onClick: snoozeWater,
            }, t('water.snooze')),
            h('button', {
              key: 'pause',
              type: 'button',
              className: 'dfp-mini',
              disabled: !water.settings.on || waterDone,
              onClick: togglePauseWater,
            }, waterPaused ? t('water.resume') : t('water.pause')),
          ]),
        ])

        /* ---- stand-up panel -------------------------------------------- */

        const standNow = Date.now()
        const standDone = stand.count >= stand.settings.goal
        const standPaused = !!(stand.pausedUntil && stand.pausedUntil > standNow)
        const standing = !!(stand.standingUntil && stand.standingUntil > standNow)
        const standNextText = !stand.settings.on
          ? t('stand.off')
          : standDone
            ? t('stand.goalReached')
            : standPaused
              ? t('water.paused')
              : t('water.next') + ' ' + clockOf(stand.nextAt)

        const standRemainSec = Math.max(0, Math.ceil(standLeftMs / 1000))
        const standTimerText = pad2(Math.floor(standRemainSec / 60)) + ':' + pad2(standRemainSec % 60)
        const standDurationMs = Math.max(1, stand.settings.duration * 60000)
        const standProgress = Math.max(0, Math.min(100, Math.round((1 - standLeftMs / standDurationMs) * 100)))

        const standBody = h('div', {
          className: 'dfp-body dfp-body-stand',
        }, standing && standLeftMs > 0 ? [
          h('div', { key: 'hero', className: 'dfp-panel-hero' }, [
            h('div', { key: 'emoji', className: 'dfp-panel-emoji', 'aria-hidden': 'true' }, '🧍'),
            h('div', { key: 'title', className: 'dfp-panel-sub' }, t('stand.standing')),
            h('div', { key: 'timer', className: 'dfp-stand-timer', 'aria-live': 'polite' }, standTimerText),
          ]),
          h('div', { key: 'bar', className: 'dfp-stand-bar' }, [
            h('div', { key: 'fill', className: 'dfp-stand-bar-fill', style: { width: standProgress + '%' } }),
          ]),
          h('div', { key: 'row', className: 'dfp-panel-row' }, [
            h('button', {
              key: 'done',
              type: 'button',
              className: 'dfp-mini dfp-mini-primary',
              onClick: () => finishStanding(true),
            }, t('stand.finish')),
            h('button', {
              key: 'skip',
              type: 'button',
              className: 'dfp-mini',
              onClick: () => finishStanding(false),
            }, t('stand.skip')),
          ]),
        ] : [
          h('div', { key: 'hero', className: 'dfp-panel-hero' }, [
            h('div', { key: 'emoji', className: 'dfp-panel-emoji', 'aria-hidden': 'true' }, '🧍'),
            h('div', {
              key: 'count',
              className: 'dfp-panel-count',
              'aria-live': 'polite',
              'aria-label': t('stand.progress') + ' ' + stand.count + '/' + stand.settings.goal,
            }, [
              h('b', { key: 'n' }, String(stand.count)),
              h('span', { key: 's' }, ' / ' + stand.settings.goal + ' ' + t('stand.unit')),
            ]),
            h('div', { key: 'sub', className: 'dfp-panel-sub' },
              t('stand.every') + ' ' + stand.settings.every + ' ' + t('water.everyUnit')
                + ' · ' + t('stand.duration') + ' ' + stand.settings.duration + ' ' + t('water.everyUnit')),
          ]),
          h('div', { key: 'dots', className: 'dfp-panel-dots' }, Array.from({ length: stand.settings.goal }, (_, index) => h('span', {
            key: index,
            className: 'dfp-panel-dot' + (index < stand.count ? ' dfp-panel-dot-on dfp-panel-dot-stand' : ''),
          }))),
          h('div', { key: 'next', className: 'dfp-panel-next' }, standNextText),
          h('button', {
            key: 'start',
            type: 'button',
            className: 'dfp-pick dfp-panel-cta',
            disabled: !stand.settings.on,
            onClick: startStanding,
          }, '🧍 ' + t('stand.now')),
          h('div', { key: 'row', className: 'dfp-panel-row' }, [
            h('button', {
              key: 'snooze',
              type: 'button',
              className: 'dfp-mini',
              disabled: !stand.settings.on || standPaused || standDone,
              onClick: snoozeStand,
            }, t('stand.snooze')),
            h('button', {
              key: 'pause',
              type: 'button',
              className: 'dfp-mini',
              disabled: !stand.settings.on || standDone,
              onClick: togglePauseStand,
            }, standPaused ? t('water.resume') : t('water.pause')),
          ]),
        ])

        /* ---- top level tabs -------------------------------------------- */

        const tabDot = (kind) => h('span', {
          key: 'dot',
          className: 'dfp-tabdot'
            + (kind === 'water' ? ' dfp-tabdot-water' : (kind === 'stand' ? ' dfp-tabdot-stand' : '')),
          'aria-hidden': 'true',
        })

        const modeTabs = h('div', { className: 'dfp-modetabs', role: 'tablist', 'aria-label': t('title') }, [
          h('button', {
            key: 'food',
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'food' ? 'true' : 'false',
            className: 'dfp-modetab' + (tab === 'food' ? ' dfp-on' : ''),
            onClick: () => setTab('food'),
          }, [
            h('span', { key: 'l' }, '🍽️ ' + t('mode.food')),
            pending.meal ? tabDot('food') : null,
          ]),
          h('button', {
            key: 'water',
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'water' ? 'true' : 'false',
            className: 'dfp-modetab' + (tab === 'water' ? ' dfp-on' : ''),
            onClick: () => setTab('water'),
          }, [
            h('span', { key: 'l' }, '💧 ' + t('mode.water')),
            pending.water ? tabDot('water') : null,
          ]),
          h('button', {
            key: 'stand',
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'stand' ? 'true' : 'false',
            className: 'dfp-modetab' + (tab === 'stand' ? ' dfp-on' : ''),
            onClick: () => setTab('stand'),
          }, [
            h('span', { key: 'l' }, '🧍 ' + t('mode.stand')),
            pending.stand ? tabDot('stand') : null,
          ]),
        ])

        const settingsTabs = h('div', { className: 'dfp-modetabs', role: 'tablist' }, [
          h('button', {
            key: 'food',
            type: 'button',
            role: 'tab',
            'aria-selected': settingsTab === 'food' ? 'true' : 'false',
            className: 'dfp-modetab' + (settingsTab === 'food' ? ' dfp-on' : ''),
            onClick: () => setSettingsTab('food'),
          }, '🍽️ ' + t('reminders.title')),
          h('button', {
            key: 'water',
            type: 'button',
            role: 'tab',
            'aria-selected': settingsTab === 'water' ? 'true' : 'false',
            className: 'dfp-modetab' + (settingsTab === 'water' ? ' dfp-on' : ''),
            onClick: () => setSettingsTab('water'),
          }, '💧 ' + t('water.settings')),
          h('button', {
            key: 'stand',
            type: 'button',
            role: 'tab',
            'aria-selected': settingsTab === 'stand' ? 'true' : 'false',
            className: 'dfp-modetab' + (settingsTab === 'stand' ? ' dfp-on' : ''),
            onClick: () => setSettingsTab('stand'),
          }, '🧍 ' + t('stand.settings')),
        ])

        const segments = view === 'settings' ? settingsTabs : modeTabs
        const body = view === 'settings'
          ? settingsBody
          : (tab === 'water' ? waterBody : (tab === 'stand' ? standBody : mainBody))

        const win = h('div', {
          className: 'dfp-win' + (shaking ? ' dfp-shake' : ''),
          role: 'dialog',
          'aria-label': t('title'),
          style: { height: winH + 'px', maxHeight: winMaxHeight + 'px' },
        }, [
          h('div', {
            key: 'toast',
            className: 'dfp-toast' + (toastOn ? ' dfp-show' : ''),
            role: 'status',
            'aria-live': 'polite',
          }, toast.text),
          header,
          segments,
          body,
        ])

        return h('div', { className: 'dfp-root', style: { left: pos.x + 'px', top: pos.y + 'px' } }, [
          h('style', { key: 'style' }, CSS),
          win,
        ])
      }

      return FoodPicker
    }

    return {
      name: NS,
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }),
          'dsh-body-clock: dictionaries',
        )
        const t = ctx.locale.bind(NS)
        const FoodPicker = makeFoodPicker(t)
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: NS,
          order: 60,
          locale: NS,
        }, (props) => h(FoodPicker, props)))
      },
    }
  },
})
