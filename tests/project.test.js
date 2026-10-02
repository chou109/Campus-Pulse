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

function loadApp(storageSeed = {}, wxOverrides = {}) {
  const storage = new Map(Object.entries(storageSeed))
  let appConfig
  const modalResponses = []
  const wx = Object.assign({
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showToast() {},
    showModal(options) { modalResponses.push(options); if (options.success) options.success({ confirm: true, cancel: false }) },
    navigateBack() {}, navigateTo() {}, switchTab() {},
    setClipboardData(options) { if (options.success) options.success() },
    getLocation() {}
  }, wxOverrides)
  const context = {
    Date,
    wx,
    console,
    App: config => { appConfig = config },
    Page: config => { context.pageConfig = config },
    getApp: () => appConfig
  }
  context.require = request => {
    if (request === './utils/statistics') return stats
    if (request === './utils/challenge-rules') return challengeRules
    if (request === './utils/default-challenges') return require('../utils/default-challenges')
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
    Date,
    wx,
    console,
    getApp: () => app,
    Page: config => { page = config },
    require: request => {
      if (request.startsWith('../../utils/')) return require(path.join(ROOT, 'utils', path.basename(request)))
      if (request === '../../services/ai/workout-review') return require(path.join(ROOT, 'services/ai/workout-review'))
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

test('app can load local admin public config and preserve local enrollment', () => {
  const { app } = loadApp({}, {
    request(options) {
      options.success({ statusCode: 200, data: {
        challenges: [{ id: '1', title: '后台挑战', subtitle: '测试规则', ruleType: 'weeklyDistance', target: 8, published: true }],
        announcements: [{ id: 'notice-1', title: '测试公告', body: '仅本机展示', published: true }]
      } })
    }
  })
  app.globalData.settings.useLocalAdminBackend = true
  app.globalData.challenges[0].joined = true
  let connected = false
  app.fetchPublicAdminConfig(value => { connected = value })
  assert.equal(connected, true)
  assert.equal(app.globalData.challenges.length, 1)
  assert.equal(app.globalData.challenges[0].joined, true)
  assert.equal(app.globalData.announcements[0].title, '测试公告')
})

test('failed local Admin sync keeps the last saved config rather than clearing it', () => {
  const savedChallenge = { id: 'cached', title: '缓存挑战', subtitle: '仅本地缓存', ruleType: 'weeklyDistance', target: 8, joined: true }
  const savedAnnouncement = { id: 'cached-notice', title: '缓存公告', body: '仅本地缓存', published: true }
  const { app } = loadApp({
    'campus-fit-challenges': [savedChallenge],
    'campus-fit-announcements': [savedAnnouncement],
    'campus-fit-settings': { useLocalAdminBackend: true }
  }, {
    request(options) { options.fail({ errMsg: 'request:fail' }) }
  })
  let connected
  app.fetchPublicAdminConfig(value => { connected = value })
  assert.equal(connected, false)
  assert.equal(app.globalData.challenges[0].id, 'cached')
  assert.equal(app.globalData.announcements[0].id, 'cached-notice')
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
    assert.ok(fs.existsSync(path.join(ROOT, `${page}.json`)), `${page}.json missing`)
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(ROOT, `${page}.json`), 'utf8')), `${page}.json invalid`)
  }
})

test('home aggregates current week and month and switches trend datasets', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 30, 12) })
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


for (const scenario of [
  { name: 'month rollover', now: new Date(2026, 9, 1, 12), dates: [new Date(2026, 8, 30, 8), new Date(2026, 9, 1, 8)], week: '5.0', month: '3.0' },
  { name: 'Monday week rollover', now: new Date(2026, 9, 5, 12), dates: [new Date(2026, 9, 4, 8), new Date(2026, 9, 5, 8)], week: '3.0', month: '5.0' },
  { name: 'year rollover', now: new Date(2027, 0, 1, 12), dates: [new Date(2026, 11, 31, 8), new Date(2027, 0, 1, 8)], week: '5.0', month: '3.0' }
]) {
  test('home statistics remain correct at ' + scenario.name, t => {
    t.mock.timers.enable({ apis: ['Date'], now: scenario.now })
    const { app } = loadApp()
    app.globalData.records = scenario.dates.map((date, index) => record('boundary-' + index, date, index + 2))
    const { page } = loadPage('pages/index/index.js', app)
    page.onShow()
    assert.equal(page.data.weeklyDistance, scenario.week)
    assert.equal(page.data.monthlyDistance, scenario.month)
    assert.equal(page.data.trendTotal, scenario.week)
    page.selectTrend({ currentTarget: { dataset: { mode: 'month' } } })
    assert.equal(page.data.trendTotal, scenario.month)
  })
}

test('home handles empty records at a fixed month boundary', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 1) })
  const { app } = loadApp()
  app.globalData.records = []
  const { page } = loadPage('pages/index/index.js', app)
  page.onShow()
  assert.equal(page.data.weeklyDistance, '0.0')
  assert.equal(page.data.monthlyDistance, '0.0')
  assert.equal(page.data.weekProgress, 0)
  assert.equal(page.data.hasRecords, false)
  assert.equal(page.data.trendEmpty, true)
  page.selectTrend({ currentTarget: { dataset: { mode: 'month' } } })
  assert.equal(page.data.trendEmpty, true)
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

test('AI proxy sanitizes input and forwards only aggregate workout data', async t => {
  const http = require('node:http')
  const { createProxyServer } = require('../dev/ai-proxy')
  let observedHeaders = null
  let observedRequest = null
  const upstream = http.createServer(async (request, response) => {
    observedHeaders = request.headers
    let raw = ''
    for await (const chunk of request) raw += chunk
    observedRequest = JSON.parse(raw)
    const content = JSON.stringify({
      summary: '完成一段平稳运动。',
      positive_feedback: '你正稳步积累。',
      next_action: '按舒适节奏继续。',
      safety_note: '如有不适请停止。'
    })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content } }] }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => upstream.close(resolve)))

  const upstreamAddress = upstream.address()
  const proxy = createProxyServer({
    apiKey: 'unit-test-only',
    model: 'test-model',
    baseUrl: `http://127.0.0.1:${upstreamAddress.port}/v1`
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => proxy.close(resolve)))

  const proxyAddress = proxy.address()
  const response = await fetch(`http://127.0.0.1:${proxyAddress.port}/api/ai/workout-review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      distance_km: 3.1,
      duration_minutes: 27,
      pace: "8'42\"",
      recent_sessions: 2,
      weekly_goal_km: 10,
      weekly_completed_km: 6.5,
      nickname: 'must-not-forward',
      route_points: [{ latitude: 31.2, longitude: 121.4 }]
    })
  })
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.review.summary, '完成一段平稳运动。')
  assert.equal(observedHeaders.authorization, 'Bearer unit-test-only')
  assert.equal(observedRequest.model, 'test-model')
  assert.equal(observedRequest.messages[1].content.includes('must-not-forward'), false)
  assert.equal(observedRequest.messages[1].content.includes('route_points'), false)
})

test('AI proxy rejects invalid fields and clearly reports missing server key', async t => {
  const http = require('node:http')
  const { createProxyServer } = require('../dev/ai-proxy')
  const proxy = createProxyServer({ apiKey: '', baseUrl: 'https://aigw.wenxiaobai.com/v1' })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => proxy.close(resolve)))
  const address = proxy.address()
  const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/workout-review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /missing server configuration/)
})

test('AI client sends only aggregate fields and falls back when the local proxy is unavailable', async () => {
  const sent = []
  const context = {
    module: { exports: {} },
    exports: {},
    require: () => stats,
    wx: {
      request(options) {
        sent.push(options)
        options.fail({ errMsg: 'request:fail' })
      }
    }
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'services/ai/workout-review.js'), 'utf8'), context)
  const service = context.module.exports
  const workout = Object.assign(record('ai-test', localDate(30), 3.1), { points: [{ latitude: 31.2, longitude: 121.4 }] })
  const result = await service.generateWorkoutReview(workout, [workout], 10)
  assert.equal(result.source, 'local-fallback')
  assert.equal(sent.length, 1)
  assert.deepEqual(Object.keys(sent[0].data).sort(), ['distance_km', 'duration_minutes', 'pace', 'recent_sessions', 'weekly_completed_km', 'weekly_goal_km'].sort())
  assert.equal(Object.hasOwn(sent[0].data, 'points'), false)
})

test('AI client accepts a valid structured proxy response', async () => {
  let sentData
  const expectedReview = {
    summary: '完成 3.1 公里。',
    positive_feedback: '你在稳定积累。',
    next_action: '按舒适节奏安排下一次运动。',
    safety_note: '如有不适请停止。'
  }
  const context = {
    module: { exports: {} },
    exports: {},
    require: () => stats,
    wx: {
      request(options) {
        sentData = options.data
        options.success({ statusCode: 200, data: { review: expectedReview } })
      }
    }
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'services/ai/workout-review.js'), 'utf8'), context)
  const service = context.module.exports
  const result = await service.generateWorkoutReview(record('ai-success', localDate(30), 3.1), [], 10)
  assert.equal(result.source, 'ai')
  assert.deepEqual(result.review, expectedReview)
  assert.equal(sentData.distance_km, 3.1)
})
