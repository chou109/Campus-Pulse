const app = getApp()

Page({
  data: { user: app.globalData.user, medals: [], settings: {}, total: '0.0', count: 0, unlockedCount: 0 },

  onShow() {
    const total = app.globalData.records.reduce((sum, item) => sum + Number(item.distance || 0), 0)
    const medals = app.globalData.medals || []
    this.setData({
      total: total.toFixed(1),
      count: app.globalData.records.length,
      medals,
      unlockedCount: medals.filter(item => item.unlocked).length,
      settings: app.globalData.settings
    })
  },

  changeSetting(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    app.updateSettings({ [key]: value })
    this.setData({ settings: app.globalData.settings })
    wx.showToast({ title: '设置已保存', icon: 'none' })
  },

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
