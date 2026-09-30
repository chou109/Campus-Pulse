const STORAGE_KEYS = {
  records: 'campus-fit-records',
  challenges: 'campus-fit-challenges',
  settings: 'campus-fit-settings',
  onboarding: 'campus-fit-onboarding-seen'
}

const DEFAULT_SETTINGS = {
  publicRank: true,
  shareCheckIn: true,
  reminders: false,
  weeklyGoalKm: 10
}

const DEFAULT_CHALLENGES = [
  { id: 1, title: '七日晨跑计划', subtitle: '连续 7 天完成 2 km', progress: 0, joined: true, tone: 'orange', reward: '早起鸟勋章', ruleType: 'streak', target: 7 },
  { id: 2, title: '校园环线挑战', subtitle: '本月累计跑满 30 km', progress: 0, joined: true, tone: 'blue', reward: '校园探索家', ruleType: 'monthlyDistance', target: 30 },
  { id: 3, title: '社团接力赛', subtitle: '和队友一起冲进周榜前十', progress: 0.36, joined: false, tone: 'purple', reward: '团队能量值', ruleType: 'static', target: 1 }
]

function pad(value) { return String(value).padStart(2, '0') }

function formatDate(date) {
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

function dateAtOffset(offsetDays, hour) {
  const date = new Date()
  date.setHours(hour || 8, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date
}

function makeDefaultRecords() {
  return [
    { date: formatDate(dateAtOffset(0)), createdAt: dateAtOffset(0).toISOString(), distance: 3.8, duration: 29, pace: '7\'38"', calories: 276, source: 'demo' },
    { date: formatDate(dateAtOffset(-1)), createdAt: dateAtOffset(-1).toISOString(), distance: 5.2, duration: 39, pace: '7\'30"', calories: 381, source: 'demo' },
    { date: formatDate(dateAtOffset(-5)), createdAt: dateAtOffset(-5).toISOString(), distance: 2.6, duration: 20, pace: '7\'41"', calories: 188, source: 'demo' },
    { date: formatDate(dateAtOffset(-8)), createdAt: dateAtOffset(-8).toISOString(), distance: 4.5, duration: 34, pace: '7\'33"', calories: 329, source: 'demo' }
  ]
}

function normalizeRecord(record, index) {
  const createdAt = record.createdAt || new Date().toISOString()
  return Object.assign({}, record, {
    id: record.id || `record-${createdAt}-${index}`,
    date: record.date || formatDate(new Date(createdAt)),
    createdAt,
    distance: Number(record.distance || 0),
    duration: Number(record.duration || 0),
    calories: Number(record.calories || 0),
    points: Array.isArray(record.points) ? record.points : []
  })
}

function distinctDateKeys(records) {
  return Array.from(new Set(records.map(item => new Date(item.createdAt).toDateString())))
    .map(value => new Date(value).getTime())
    .sort((a, b) => b - a)
}

function calculateStreak(records) {
  const dates = distinctDateKeys(records)
  if (!dates.length) return 0
  let streak = 1
  for (let index = 1; index < dates.length; index += 1) {
    const diff = Math.round((dates[index - 1] - dates[index]) / 86400000)
    if (diff !== 1) break
    streak += 1
  }
  return streak
}

function calculateChallengeProgress(challenge, records) {
  if (challenge.ruleType === 'streak') return Math.min(1, calculateStreak(records) / challenge.target)
  if (challenge.ruleType === 'monthlyDistance') {
    const now = new Date()
    const total = records.filter(item => {
      const date = new Date(item.createdAt)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    }).reduce((sum, item) => sum + item.distance, 0)
    return Math.min(1, total / challenge.target)
  }
  return Number(challenge.progress || 0)
}

const app = {
  globalData: {
    demoMode: true,
    user: { name: '林同学', avatarText: '林' },
    records: [],
    challenges: [],
    medals: [],
    streak: 0,
    settings: DEFAULT_SETTINGS,
    onboardingSeen: false
  },

  onLaunch() {
    const savedRecords = wx.getStorageSync(STORAGE_KEYS.records)
    const savedChallenges = wx.getStorageSync(STORAGE_KEYS.challenges)
    const savedSettings = wx.getStorageSync(STORAGE_KEYS.settings)
    const savedOnboarding = wx.getStorageSync(STORAGE_KEYS.onboarding)

    const records = Array.isArray(savedRecords) ? savedRecords : makeDefaultRecords()
    this.globalData.records = records.map(normalizeRecord)
    this.globalData.challenges = Array.isArray(savedChallenges) ? savedChallenges : DEFAULT_CHALLENGES
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {})
    this.globalData.onboardingSeen = Boolean(savedOnboarding)
    this.refreshDerivedState()
  },

  addRecord(record) {
    const normalized = normalizeRecord(Object.assign({ source: this.globalData.demoMode ? 'demo' : 'location' }, record), Date.now())
    this.globalData.records.unshift(normalized)
    wx.setStorageSync(STORAGE_KEYS.records, this.globalData.records)
    this.refreshDerivedState()
  },

  removeRecord(recordId) {
    this.globalData.records = this.globalData.records.filter(item => item.id !== recordId)
    wx.setStorageSync(STORAGE_KEYS.records, this.globalData.records)
    this.refreshDerivedState()
  },

  updateChallenges(challenges) {
    this.globalData.challenges = challenges
    wx.setStorageSync(STORAGE_KEYS.challenges, challenges)
  },

  updateSettings(patch) {
    this.globalData.settings = Object.assign({}, this.globalData.settings, patch)
    wx.setStorageSync(STORAGE_KEYS.settings, this.globalData.settings)
    this.refreshDerivedState()
  },

  markOnboardingSeen() {
    this.globalData.onboardingSeen = true
    wx.setStorageSync(STORAGE_KEYS.onboarding, true)
  },

  clearRecords() {
    this.globalData.records = []
    wx.setStorageSync(STORAGE_KEYS.records, [])
    this.refreshDerivedState()
  },

  resetDemoData() {
    this.globalData.records = makeDefaultRecords().map(normalizeRecord)
    this.globalData.challenges = DEFAULT_CHALLENGES.map(item => Object.assign({}, item))
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS)
    wx.setStorageSync(STORAGE_KEYS.records, this.globalData.records)
    wx.setStorageSync(STORAGE_KEYS.challenges, this.globalData.challenges)
    wx.setStorageSync(STORAGE_KEYS.settings, this.globalData.settings)
    this.refreshDerivedState()
  },

  refreshDerivedState() {
    const records = this.globalData.records
    const totalDistance = records.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const streak = calculateStreak(records)
    const challenges = this.globalData.challenges.map(item => Object.assign({}, item, { progress: calculateChallengeProgress(item, records) }))
    this.globalData.challenges = challenges
    this.globalData.streak = streak
    this.globalData.medals = [
      { icon: '☀', title: '晨光初跑', desc: '完成第一次晨跑', unlocked: records.length > 0 },
      { icon: '🔥', title: '连续七天', desc: '连续打卡 7 天', unlocked: streak >= 7 },
      { icon: '✦', title: '校园探索家', desc: '累计跑满 30 km', unlocked: totalDistance >= 30 },
      { icon: '♞', title: '社团领跑者', desc: '带领社团进入周榜', unlocked: false }
    ]
  }
}

App(app)
