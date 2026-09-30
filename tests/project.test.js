const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const stats = require('../utils/statistics')
const challengeRules = require('../utils/challenge-rules')

const ROOT = path.resolve(__dirname, '..')

function localDate(day, hour = 8) {
  return new Date(2026, 8, day, hour, 0, 0, 0)
}

function record(id, date, distance) {
  return { id, createdAt: date.toISOString(), distance, duration: 30, calories: 200, pace: "7'30\"", points: [] }
}

function loadApp(storageSeed = {}) {
  const storage = new Map(Object.entries(storageSeed))
  let appConfig
  const modalResponses = []
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast() {},
    showModal(options) { modalResponses.push(options); if (options.success) options.success({ confirm: true, cancel: false }) },
    navigateBack() {}, navigateTo() {}, switchTab() {},
    setClipboardData(options) { if (options.success) options.success() },
    getLocation() {}
  }
  const context = {
    wx,
    console,
    App: config => { appConfig = config },
    Page: config => { context.pageConfig = config },
    getApp: () => appConfig
  }
  context.require = request => {
    if (request === './utils/statistics') return stats
    if (request === './utils/challenge-rules') return challengeRules
    if (request.startsWith('../../utils/')) return require(path.join(ROOT, 'utils', path.basename(request)))
    throw new Error(`Unexpected require: ${request}`)
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), context, { filename: 'app.js' })
  appConfig.onLaunch()
  return { app: appConfig, storage, wx, context, modalResponses }
}

function loadPage(relativePath, app, wxOverrides = {}) {
  let page
  const wx = Object.assign({
    showToast() {},
    showModal(options) { if (options.success) options.success({ confirm: true, cancel: false }) },
    navigateBack() {}, navigateTo() {}, switchTab() {},
    setClipboardData(options) { if (options.success) options.success() },
    getLocation() {}
  }, wxOverrides)
  const context = {
    wx,
    console,
    getApp: () => app,
    Page: config => { page = config },
    require: request => {
      if (request.startsWith('../../utils/')) return require(path.join(ROOT, 'utils', path.basename(request)))
      throw new Error(`Unexpected require: ${request}`)
    }
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'), context, { filename: relativePath })
  page.setData = patch => { page.data = Object.assign({}, page.data, patch) }
  return { page, wx }
}

test('week and month ranges use local calendar boundaries', () => {
  const ref = new Date(2026, 8, 30, 12)
  const week = stats.getWeekRange(ref)
  assert.equal(week.start.getDay(), 1)
  assert.equal(week.start.getDate(), 28)
  assert.equal(week.end.getDate(), 5)
  const month = stats.getMonthRange(ref)
  assert.equal(month.start.getDate(), 1)
  assert.equal(month.end.getMonth(), 9)
})

test('distance aggregation ignores invalid and negative values', () => {
  assert.equal(stats.sumDistance([{ distance: 1.5 }, { distance: -2 }, { distance: 'bad' }, {}]), 1.5)
})

test('streak counts consecutive active days and expires after a missed day', () => {
  const today = localDate(30)
  assert.equal(stats.calculateStreak([record('a', localDate(30), 1), record('b', localDate(29), 2), record('c', localDate(28), 1)], 0, today), 3)
  assert.equal(stats.calculateStreak([record('a', localDate(28), 1)], 0, today), 0)
  assert.equal(stats.calculateStreak([record('a', localDate(29), 1)], 2, today), 0)
})

test('weekly challenge requires the daily target on every streak day', () => {
  const records = [record('a', localDate(30), 2.1), record('b', localDate(29), 1.9)]
  const challenge = { ruleType: 'streak', target: 7, dailyTargetKm: 2 }
  assert.equal(challengeRules.progressFor(challenge, records, localDate(30)), 1 / 7)
})

test('monthly challenge progress is capped and uses the current month', () => {
  const challenge = { ruleType: 'monthlyDistance', target: 10 }
  const records = [record('a', localDate(2), 6), record('b', localDate(30), 8), record('c', new Date(2026, 7, 31), 40)]
  assert.equal(challengeRules.progressFor(challenge, records, localDate(30)), 1)
})

test('weekly chart places runs on their actual weekday', () => {
  const chart = stats.buildWeekChart([record('mon', localDate(28), 2), record('wed', localDate(30), 3)], localDate(30))
  assert.equal(chart[0].distance, 2)
  assert.equal(chart[2].distance, 3)
  assert.equal(chart[6].distance, 0)
})

test('app initializes demo data, derives challenge and medal state', () => {
  const { app } = loadApp()
  assert.equal(app.globalData.records.length, 4)
  assert.ok(app.globalData.records.every(item => item.id && item.createdAt))
  assert.equal(app.globalData.medals.find(item => item.title === '晨光初跑').unlocked, true)
  assert.ok(app.globalData.challenges[0].progress > 0)
})

test('cleared records stay empty after app relaunch', () => {
  const { app } = loadApp()
  app.clearRecords()
  app.onLaunch()
  assert.equal(app.globalData.records.length, 0)
})

test('reset restores demo records, settings, and challenges', () => {
  const { app } = loadApp()
  app.clearRecords()
  app.updateSettings({ weeklyGoalKm: 20, publicRank: false })
  app.resetDemoData()
  assert.equal(app.globalData.records.length, 4)
  assert.equal(app.globalData.settings.weeklyGoalKm, 10)
  assert.equal(app.globalData.settings.publicRank, true)
})

test('weekly goal updates remain constrained by profile options', () => {
  const { app } = loadApp()
  const { page } = loadPage('pages/profile/profile.js', app)
  page.data = Object.assign({}, page.data)
  page.setGoal({ currentTarget: { dataset: { goal: '20' } } })
  assert.equal(app.globalData.settings.weeklyGoalKm, 20)
})

test('ranking uses local personal totals and hides personal identity when private', () => {
  const { app } = loadApp()
  app.globalData.records = [record('a', localDate(30), 4.25)]
  app.globalData.settings.publicRank = false
  let page
  const context = { getApp: () => app, Page: config => { page = config }, require: () => stats }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pages/rank/rank.js'), 'utf8'), context)
  page.setData = patch => { page.data = Object.assign({}, page.data, patch) }
  page.onShow()
  assert.equal(page.data.mineDistance, '4.3')
  assert.equal(page.data.list.find(item => item.me).name, '我的排名（已隐藏）')
})

test('record detail share obeys local share preference and never shares route URL', () => {
  const { app } = loadApp()
  app.globalData.records = [record('record-1', localDate(30), 2.5)]
  app.globalData.settings.shareCheckIn = false
  const { page } = loadPage('pages/record-detail/record-detail.js', app)
  page.data = Object.assign({}, page.data, { record: app.globalData.records[0] })
  assert.equal(page.onShareAppMessage().title, '和我一起体验校园燃动')
  assert.equal(page.onShareAppMessage().path, '/pages/index/index')
})

test('run page rejects invalid GPS and requires sufficient valid route before finish', () => {
  const { app } = loadApp()
  const { page } = loadPage('pages/run/run.js', app)
  page.data = Object.assign({}, page.data, { running: true, demoMode: true })
  page.updatePoint({ latitude: NaN, longitude: 1 })
  assert.equal(page.data.points.length, 0)
  page.updatePoint({ latitude: 31.23, longitude: 121.47, accuracy: 5 })
  assert.equal(page.data.canFinish, false)
  page.updatePoint({ latitude: 31.2306, longitude: 121.4700, accuracy: 5 })
  assert.equal(page.data.canFinish, true)
  assert.equal(page.data.polyline[0].points.length, 2)
})

test('run page rejects inaccurate and implausible jumps', () => {
  const { app } = loadApp()
  const { page } = loadPage('pages/run/run.js', app)
  page.data = Object.assign({}, page.data, { running: true, demoMode: true })
  page.updatePoint({ latitude: 31.23, longitude: 121.47, accuracy: 5 })
  page.updatePoint({ latitude: 31.23, longitude: 121.47, accuracy: 150 })
  assert.equal(page.data.points.length, 1)
  page.updatePoint({ latitude: 31.25, longitude: 121.49, accuracy: 5 })
  assert.equal(page.data.points.length, 1)
})

test('challenge detail calculates current progress and handles missing challenge', () => {
  const { app } = loadApp()
  const challenge = app.globalData.challenges[0]
  const { page } = loadPage('pages/challenge-detail/challenge-detail.js', app)
  page.onLoad({ id: String(challenge.id) })
  assert.equal(page.data.hasChallenge, true)
  assert.equal(page.data.progressText, `${Math.round(challenge.progress * 100)}%`)
  page.onLoad({ id: 'unknown' })
  assert.equal(page.data.hasChallenge, false)
})

test('project page registry contains each page file', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  for (const page of config.pages) {
    assert.ok(fs.existsSync(path.join(ROOT, `${page}.js`)), `${page}.js missing`)
    assert.ok(fs.existsSync(path.join(ROOT, `${page}.wxml`)), `${page}.wxml missing`)
    assert.ok(fs.existsSync(path.join(ROOT, `${page}.wxss`)), `${page}.wxss missing`)
  }
})

test('home aggregates current week and month and switches trend datasets', () => {
  const { app } = loadApp()
  app.globalData.records = [record('today', localDate(30), 2.5), record('old', new Date(2026, 7, 31), 4)]
  app.globalData.settings.weeklyGoalKm = 5
  const { page } = loadPage('pages/index/index.js', app)
  page.onShow()
  assert.equal(page.data.weeklyDistance, '2.5')
  assert.equal(page.data.monthlyDistance, '2.5')
  assert.equal(page.data.remainingDistance, '2.5')
  assert.equal(page.data.weekProgress, 50)
  page.selectTrend({ currentTarget: { dataset: { mode: 'month' } } })
  assert.equal(page.data.trendTitle, '本月趋势')
  assert.equal(page.data.trendTotal, '2.5')
})

test('profile privacy settings persist and refresh derived state', () => {
  const { app } = loadApp()
  const { page } = loadPage('pages/profile/profile.js', app)
  page.changeSetting({ currentTarget: { dataset: { key: 'publicRank' } }, detail: { value: false } })
  assert.equal(app.globalData.settings.publicRank, false)
  assert.equal(page.data.settings.publicRank, false)
  page.changeSetting({ currentTarget: { dataset: { key: 'shareCheckIn' } }, detail: { value: false } })
  assert.equal(app.globalData.settings.shareCheckIn, false)
})

test('challenge list joins and leaves without losing local progress', () => {
  const { app } = loadApp()
  let confirm = true
  const { page } = loadPage('pages/challenges/challenges.js', app, {
    showModal(options) { if (options.success) options.success({ confirm, cancel: !confirm }) }
  })
  page.onShow()
  const challenge = app.globalData.challenges.find(item => !item.joined)
  page.join({ currentTarget: { dataset: { id: challenge.id } } })
  assert.equal(app.globalData.challenges.find(item => item.id === challenge.id).joined, true)
  confirm = true
  page.leave({ currentTarget: { dataset: { id: challenge.id } } })
  assert.equal(app.globalData.challenges.find(item => item.id === challenge.id).joined, false)
})

test('challenge detail join action writes local enrollment', () => {
  const { app } = loadApp()
  const challenge = app.globalData.challenges.find(item => !item.joined)
  const { page } = loadPage('pages/challenge-detail/challenge-detail.js', app)
  page.onLoad({ id: String(challenge.id) })
  page.join()
  assert.equal(app.globalData.challenges.find(item => item.id === challenge.id).joined, true)
})

test('record list removes a single item and leaves other records intact', () => {
  const { app } = loadApp()
  const firstId = app.globalData.records[0].id
  const { page } = loadPage('pages/records/records.js', app)
  page.onShow()
  page.remove({ currentTarget: { dataset: { id: firstId } } })
  assert.equal(app.globalData.records.some(item => item.id === firstId), false)
  assert.equal(app.globalData.records.length, 3)
})

test('record detail renders only valid route points and copies check-in text', () => {
  const { app } = loadApp()
  const workout = Object.assign(record('route-record', localDate(30), 2.2), {
    points: [{ latitude: 31.2, longitude: 121.4 }, { latitude: 'bad', longitude: 121.5 }, { latitude: 31.21, longitude: 121.41 }]
  })
  app.globalData.records = [workout]
  let clipboard = ''
  const { page } = loadPage('pages/record-detail/record-detail.js', app, {
    setClipboardData(options) { clipboard = options.data; if (options.success) options.success() }
  })
  page.onLoad({ id: workout.id })
  page.onShow()
  assert.equal(page.data.polyline[0].points.length, 2)
  assert.equal(page.data.shareEnabled, true)
  page.copyCheckIn()
  assert.match(clipboard, /2.20 km/)
})

test('WXML files have balanced bindings and avoid method calls', () => {
  const files = []
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.wxml')) files.push(full)
    }
  }
  walk(ROOT)
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert.equal((text.match(/\{\{/g) || []).length, (text.match(/\}\}/g) || []).length, `${file}: unbalanced binding`)
    assert.equal(/\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(text), false, `${file}: method invocation not supported in WXML`)
  }
})

test('rule-based challenge recommendation explains its reason without a model call', () => {
  const challenges = [{ id: 1, joined: true, ruleType: 'streak', target: 7, dailyTargetKm: 2 }]
  const records = [record('today', localDate(30), 2.5)]
  assert.deepEqual(challengeRules.recommend(challenges, records, 1, localDate(30)), {
    challengeId: 1,
    reason: '你已连续运动 1 天，再坚持几天就能解锁连续挑战勋章。'
  })
})

test('feedback draft is local, reloadable, copyable, and clearable', () => {
  const { app, storage } = loadApp()
  let copied = ''
  const { page } = loadPage('pages/feedback/feedback.js', app, {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    setClipboardData(options) { copied = options.data; if (options.success) options.success() },
    showModal(options) { if (options.success) options.success({ confirm: true }) }
  })
  page.onInput({ detail: { value: '活动页面很好用' } })
  assert.equal(storage.get('campus-fit-feedback-draft'), '活动页面很好用')
  page.copyDraft()
  assert.equal(copied, '活动页面很好用')
  page.clearDraft()
  assert.equal(storage.has('campus-fit-feedback-draft'), false)
})
