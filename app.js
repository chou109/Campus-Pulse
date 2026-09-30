const stats = require('./utils/statistics')
const challengeRules = require('./utils/challenge-rules')
const defaultChallenges = require('./utils/default-challenges')

const STORAGE_KEYS = {
  records: 'campus-fit-records',
  challenges: 'campus-fit-challenges',
  settings: 'campus-fit-settings',
  onboarding: 'campus-fit-onboarding-seen',
  announcements: 'campus-fit-announcements'
}

const DEFAULT_SETTINGS = {
  publicRank: true,
  shareCheckIn: true,
  reminders: false,
  weeklyGoalKm: 10,
  useLocalAdminBackend: false
}

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
  const parsedDate = new Date(record && record.createdAt)
  const createdAt = record && record.createdAt && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString()
  const distance = Number(record && record.distance)
  const duration = Number(record && record.duration)
  const calories = Number(record && record.calories)
  const points = Array.isArray(record && record.points) ? record.points.filter(point => {
    const latitude = Number(point && point.latitude)
    const longitude = Number(point && point.longitude)
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
  }).map(point => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) })) : []
  return Object.assign({}, record, {
    id: record && record.id ? String(record.id) : `record-${createdAt}-${index}`,
    date: record && record.date ? String(record.date) : formatDate(new Date(createdAt)),
    createdAt,
    distance: Number.isFinite(distance) && distance >= 0 ? distance : 0,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : 0,
    calories: Number.isFinite(calories) && calories >= 0 ? calories : 0,
    points
  })
}


const app = {
  globalData: {
    demoMode: true,
    user: { name: '林同学', avatarText: '林' },
    records: [],
    challenges: [],
    announcements: [],
    medals: [],
    streak: 0,
    settings: DEFAULT_SETTINGS,
    onboardingSeen: false
  },

  onLaunch() {
    const savedRecords = wx.getStorageSync(STORAGE_KEYS.records)
    const savedChallenges = wx.getStorageSync(STORAGE_KEYS.challenges)
    const savedSettings = wx.getStorageSync(STORAGE_KEYS.settings)
    const savedAnnouncements = wx.getStorageSync(STORAGE_KEYS.announcements)
    const savedOnboarding = wx.getStorageSync(STORAGE_KEYS.onboarding)

    const records = Array.isArray(savedRecords) ? savedRecords : makeDefaultRecords()
    this.globalData.records = records.map(normalizeRecord)
    this.globalData.challenges = Array.isArray(savedChallenges) ? savedChallenges : defaultChallenges.getDefaultChallenges()
    this.globalData.announcements = Array.isArray(savedAnnouncements) ? savedAnnouncements : []
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {})
    this.globalData.onboardingSeen = Boolean(savedOnboarding)
    this.refreshDerivedState()
  },

  fetchPublicAdminConfig(callback) {
    if (!this.globalData.settings.useLocalAdminBackend || typeof wx.request !== 'function') {
      if (callback) callback(false)
      return
    }
    wx.request({
      url: 'http://127.0.0.1:8790/api/public/config',
      method: 'GET',
      timeout: 2500,
      success: response => {
        const payload = response && response.statusCode === 200 && response.data
        if (!payload || !Array.isArray(payload.challenges) || !Array.isArray(payload.announcements)) {
          if (callback) callback(false)
          return
        }
        const previous = new Map(this.globalData.challenges.map(item => [String(item.id), item]))
        this.globalData.challenges = payload.challenges.map(item => {
          const local = previous.get(String(item.id)) || {}
          return Object.assign({}, item, { joined: Boolean(local.joined), progress: Number(local.progress || item.progress || 0) })
        })
        this.globalData.announcements = payload.announcements
        wx.setStorageSync(STORAGE_KEYS.challenges, this.globalData.challenges)
        wx.setStorageSync(STORAGE_KEYS.announcements, this.globalData.announcements)
        this.refreshDerivedState()
        if (callback) callback(true)
      },
      fail: () => { if (callback) callback(false) }
    })
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

  resetOnboarding() {
    this.globalData.onboardingSeen = false
    wx.removeStorageSync(STORAGE_KEYS.onboarding)
  },

  clearRecords() {
    this.globalData.records = []
    wx.setStorageSync(STORAGE_KEYS.records, [])
    this.refreshDerivedState()
  },

  resetDemoData() {
    this.globalData.records = makeDefaultRecords().map(normalizeRecord)
    this.globalData.challenges = defaultChallenges.getDefaultChallenges()
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS)
    wx.setStorageSync(STORAGE_KEYS.records, this.globalData.records)
    wx.setStorageSync(STORAGE_KEYS.challenges, this.globalData.challenges)
    wx.setStorageSync(STORAGE_KEYS.settings, this.globalData.settings)
    this.refreshDerivedState()
  },

  refreshDerivedState() {
    const records = this.globalData.records
    const totalDistance = stats.sumDistance(records)
    const streak = stats.calculateStreak(records)
    const challenges = this.globalData.challenges.map(item => challengeRules.decorate(item, records))
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
