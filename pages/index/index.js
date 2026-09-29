const app = getApp()

function formatDistance(value) {
  return Number(value || 0).toFixed(1)
}

function startOfWeek(date) {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - day + 1)
  return result
}

function isCurrentWeek(record) {
  if (!record.createdAt) return false
  const createdAt = new Date(record.createdAt)
  const now = new Date()
  return createdAt >= startOfWeek(now)
}

Page({
  data: {
    user: app.globalData.user,
    totalDistance: '0.0',
    weeklyDistance: '0.0',
    remainingDistance: '10.0',
    weekProgress: 0,
    streak: 6,
    bars: [0, 0, 0, 0, 0, 0, 0],
    days: ['一', '二', '三', '四', '五', '六', '日'],
    feed: [],
    hasRecords: false
  },

  onShow() {
    const records = app.globalData.records || []
    const total = records.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const currentWeekRecords = records.filter(isCurrentWeek)
    const weekRecords = currentWeekRecords.length ? currentWeekRecords : records.slice(0, 2)
    const week = weekRecords.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const bars = this.buildBars(records)
    const progress = Math.min(100, Math.round((week / 10) * 100))

    this.setData({
      totalDistance: formatDistance(total),
      weeklyDistance: formatDistance(week),
      remainingDistance: formatDistance(Math.max(0, 10 - week)),
      weekProgress: progress,
      bars,
      feed: records.slice(0, 3),
      hasRecords: records.length > 0
    })
  },

  buildBars(records) {
    const values = [0, 0, 0, 0, 0, 0, 0]
    records.slice(0, 7).forEach((item, index) => { values[6 - index] = Number(item.distance || 0) })
    const max = Math.max.apply(null, values.concat([1]))
    return values.map(value => value ? Math.max(14, Math.round((value / max) * 100)) : 8)
  },

  startRun() { wx.navigateTo({ url: '/pages/run/run' }) },
  openRank() { wx.switchTab({ url: '/pages/rank/rank' }) },
  openChallenges() { wx.switchTab({ url: '/pages/challenges/challenges' }) }
})
