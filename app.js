const STORAGE_KEYS = {
  records: 'campus-fit-records',
  challenges: 'campus-fit-challenges',
  settings: 'campus-fit-settings'
}

const DEFAULT_CHALLENGES = [
  { id: 1, title: '七日晨跑计划', subtitle: '连续 7 天完成 2 km', progress: 0.57, joined: true, tone: 'orange', reward: '早起鸟勋章' },
  { id: 2, title: '校园环线挑战', subtitle: '本月累计跑满 30 km', progress: 0.36, joined: true, tone: 'blue', reward: '校园探索家' },
  { id: 3, title: '社团接力赛', subtitle: '和队友一起冲进周榜前十', progress: 0, joined: false, tone: 'purple', reward: '团队能量值' }
]

const DEFAULT_SETTINGS = {
  publicRank: true,
  shareCheckIn: true,
  reminders: false
}

App({
  globalData: {
    demoMode: true,
    user: { name: '林同学', avatarText: '林' },
    records: [],
    challenges: [],
    medals: [
      { icon: '☀', title: '晨光初跑', desc: '完成第一次晨跑', unlocked: true },
      { icon: '🔥', title: '连续七天', desc: '连续打卡 7 天', unlocked: true },
      { icon: '✦', title: '校园探索家', desc: '累计跑满 30 km', unlocked: false },
      { icon: '♞', title: '社团领跑者', desc: '带领社团进入周榜', unlocked: false }
    ],
    settings: DEFAULT_SETTINGS
  },

  onLaunch() {
    const savedRecords = wx.getStorageSync(STORAGE_KEYS.records)
    const savedChallenges = wx.getStorageSync(STORAGE_KEYS.challenges)
    const savedSettings = wx.getStorageSync(STORAGE_KEYS.settings)

    this.globalData.records = Array.isArray(savedRecords) ? savedRecords : [
      { date: '09/29', createdAt: '2026-09-29T08:00:00.000Z', distance: 3.8, duration: 29, pace: '7\'38\"', calories: 276, source: 'demo' },
      { date: '09/28', createdAt: '2026-09-28T08:00:00.000Z', distance: 5.2, duration: 39, pace: '7\'30\"', calories: 381, source: 'demo' },
      { date: '09/24', createdAt: '2026-09-24T08:00:00.000Z', distance: 2.6, duration: 20, pace: '7\'41\"', calories: 188, source: 'demo' },
      { date: '09/21', createdAt: '2026-09-21T08:00:00.000Z', distance: 4.5, duration: 34, pace: '7\'33\"', calories: 329, source: 'demo' }
    ]
    this.globalData.challenges = Array.isArray(savedChallenges) ? savedChallenges : DEFAULT_CHALLENGES
    this.globalData.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {})
    this.refreshDerivedState()
  },

  addRecord(record) {
    const normalized = Object.assign({ source: this.globalData.demoMode ? 'demo' : 'location' }, record)
    this.globalData.records.unshift(normalized)
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
  },

  clearRecords() {
    this.globalData.records = []
    wx.removeStorageSync(STORAGE_KEYS.records)
    this.refreshDerivedState()
  },

  refreshDerivedState() {
    const totalDistance = this.globalData.records.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const hasRecord = this.globalData.records.length > 0
    this.globalData.medals = this.globalData.medals.map(medal => {
      if (medal.title === '晨光初跑') return Object.assign({}, medal, { unlocked: hasRecord })
      if (medal.title === '连续七天') return Object.assign({}, medal, { unlocked: this.globalData.records.length >= 2 })
      if (medal.title === '校园探索家') return Object.assign({}, medal, { unlocked: totalDistance >= 30 })
      return medal
    })
  }
})
