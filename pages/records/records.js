const app = getApp()

function formatRecord(record) {
  const date = new Date(record.createdAt)
  return Object.assign({}, record, {
    dateText: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    sourceText: record.source === 'location' ? '前台定位' : '演示记录',
    durationText: `${record.duration || 0} 分钟`
  })
}

Page({
  data: { records: [], hasRecords: false },

  onShow() {
    const records = (app.globalData.records || []).map(formatRecord)
    this.setData({ records, hasRecords: records.length > 0 })
  },

  viewDetail(event) {
    const record = this.data.records.find(item => item.id === event.currentTarget.dataset.id)
    if (!record) return
    wx.showModal({
      title: '运动记录详情',
      content: `${record.dateText}\n${record.distance.toFixed(2)} km · ${record.durationText}\n平均配速 ${record.pace} · ${record.calories} kcal\n来源：${record.sourceText}`,
      showCancel: false
    })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后只会影响当前设备的本地数据。',
      confirmText: '删除',
      success: result => {
        if (!result.confirm) return
        app.removeRecord(id)
        this.onShow()
        wx.showToast({ title: '记录已删除', icon: 'success' })
      }
    })
  },

  resetDemo() {
    wx.showModal({
      title: '重置演示数据？',
      content: '会恢复示例运动记录、挑战进度和隐私设置。',
      confirmText: '重置',
      success: result => {
        if (!result.confirm) return
        app.resetDemoData()
        this.onShow()
        wx.showToast({ title: '演示数据已恢复', icon: 'success' })
      }
    })
  }
})
