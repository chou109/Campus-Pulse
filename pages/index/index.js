const app = getApp()
const stats = require('../../utils/statistics')

function formatDistance(value) { return Number(value || 0).toFixed(1) }

function sameLocalWeek(record, range) {
  const date = stats.validDate(record.createdAt)
  return Boolean(date && date >= range.start && date < range.end)
}

Page({
  data: {
    user: app.globalData.user,
    totalDistance: '0.0',
    weeklyDistance: '0.0',
    monthlyDistance: '0.0',
    weeklyGoalKm: 10,
    remainingDistance: '10.0',
    weekProgress: 0,
    streak: 0,
    chartBars: [],
    trendMode: 'week',
    trendTitle: '本周趋势',
    trendTotal: '0.0',
    trendEmpty: true,
    feed: [],
    hasRecords: false,
    showOnboarding: false,
    shareCheckIn: true,
    changeText: '和上周相比暂无变化'
  },

  onShow() {
    const records = app.globalData.records || []
    const total = stats.sumDistance(records)
    const weekRange = stats.getWeekRange(new Date())
    const currentWeekRecords = records.filter(item => sameLocalWeek(item, weekRange))
    const week = stats.sumDistance(currentWeekRecords)
    const month = stats.sumDistance(stats.filterRange(records, stats.getMonthRange(new Date())))
    const previousWeek = stats.sumDistance(stats.filterRange(records, stats.previousWeekRange(new Date())))
    const weeklyGoalKm = Math.max(1, Number(app.globalData.settings.weeklyGoalKm || 10))
    const progress = Math.min(100, Math.round((week / weeklyGoalKm) * 100))
    const change = previousWeek > 0 ? Math.round((week - previousWeek) / previousWeek * 100) : 0
    const changeText = previousWeek > 0 ? `${change >= 0 ? '+' : ''}${change}% 较上周` : '上周暂无记录'
    const feed = records.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3).map(item => Object.assign({}, item, {
      visibilityText: app.globalData.settings.shareCheckIn ? '可分享' : '仅自己可见',
      distanceText: formatDistance(item.distance)
    }))

    this.setData({
      totalDistance: formatDistance(total),
      weeklyDistance: formatDistance(week),
      monthlyDistance: formatDistance(month),
      weeklyGoalKm,
      remainingDistance: formatDistance(Math.max(0, weeklyGoalKm - week)),
      weekProgress: progress,
      chartBars: this.buildChart(records, this.data.trendMode),
      trendTitle: this.data.trendMode === 'week' ? '本周趋势' : '本月趋势',
      trendTotal: formatDistance(this.data.trendMode === 'week' ? week : month),
      trendEmpty: this.data.trendMode === 'week' ? week === 0 : month === 0,
      feed,
      streak: app.globalData.streak || 0,
      hasRecords: records.length > 0,
      showOnboarding: !app.globalData.onboardingSeen,
      shareCheckIn: app.globalData.settings.shareCheckIn,
      changeText
    })
  },

  buildChart(records, mode) {
    const chart = mode === 'week' ? stats.buildWeekChart(records) : stats.buildMonthChart(records)
    return chart.map(item => Object.assign({}, item, { heightText: `${item.height}%`, distanceText: formatDistance(item.distance) }))
  },

  selectTrend(event) {
    const trendMode = event.currentTarget.dataset.mode
    const records = app.globalData.records || []
    const amount = trendMode === 'week'
      ? stats.sumDistance(stats.filterRange(records, stats.getWeekRange(new Date())))
      : stats.sumDistance(stats.filterRange(records, stats.getMonthRange(new Date())))
    this.setData({
      trendMode,
      chartBars: this.buildChart(records, trendMode),
      trendTitle: trendMode === 'week' ? '本周趋势' : '本月趋势',
      trendTotal: formatDistance(amount),
      trendEmpty: amount === 0
    })
  },

  startRun() { wx.navigateTo({ url: '/pages/run/run' }) },
  openRank() { wx.switchTab({ url: '/pages/rank/rank' }) },
  openChallenges() { wx.switchTab({ url: '/pages/challenges/challenges' }) },
  openRecords() { wx.navigateTo({ url: '/pages/records/records' }) },
  closeOnboarding() {
    app.markOnboardingSeen()
    this.setData({ showOnboarding: false })
  },
  onShareAppMessage() {
    return { title: '和我一起加入校园燃动', path: '/pages/index/index' }
  }
})
