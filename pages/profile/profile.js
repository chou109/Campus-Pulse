const app = getApp()

Page({
  data: { user: app.globalData.user, medals: [], settings: {}, total: '0.0', count: 0, streak: 0, unlockedCount: 0, goalOptions: [5, 10, 20, 30], weeklyGoalKm: 10 },

  onShow() {
    const total = app.globalData.records.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const medals = app.globalData.medals || []
    this.setData({
      total: total.toFixed(1),
      count: app.globalData.records.length,
      streak: app.globalData.streak || 0,
      medals,
      unlockedCount: medals.filter(item => item.unlocked).length,
      settings: app.globalData.settings,
      weeklyGoalKm: app.globalData.settings.weeklyGoalKm || 10
    })
  },

  changeSetting(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    app.updateSettings({ [key]: value })
    this.setData({ settings: app.globalData.settings })
    wx.showToast({ title: '设置已保存', icon: 'none' })
  },

  openFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }) },

  showGuide() {
    app.resetOnboarding()
    wx.switchTab({ url: '/pages/index/index' })
  },

  setGoal(event) {
    const weeklyGoalKm = Number(event.currentTarget.dataset.goal)
    app.updateSettings({ weeklyGoalKm })
    this.setData({ weeklyGoalKm, settings: app.globalData.settings })
    wx.showToast({ title: `本周目标 ${weeklyGoalKm} km`, icon: 'none' })
  },

  openRecords() { wx.navigateTo({ url: '/pages/records/records' }) },

  clearRecords() {
    if (!app.globalData.records.length) {
      wx.showToast({ title: '暂无可删除记录', icon: 'none' })
      return
    }
    wx.showModal({
      title: '删除本地记录？',
      content: '这只会清除本机演示数据，不影响任何线上账号。',
      confirmText: '删除',
      success: result => {
        if (!result.confirm) return
        app.clearRecords()
        this.onShow()
        wx.showToast({ title: '已清除本地记录', icon: 'success' })
      }
    })
  }
})
