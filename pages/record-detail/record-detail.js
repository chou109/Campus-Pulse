const app = getApp()

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期未知'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validRoutePoints(points) {
  return (points || []).filter(point => {
    const latitude = Number(point && point.latitude)
    const longitude = Number(point && point.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  }).map(point => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }))
}

Page({
  data: {
    record: null,
    hasRecord: false,
    hasRoute: false,
    latitude: 31.2304,
    longitude: 121.4737,
    polyline: [],
    markers: [],
    shareEnabled: true,
    checkInText: ''
  },

  onLoad(options) {
    const record = (app.globalData.records || []).find(item => item.id === options.id)
    if (!record) return
    const points = validRoutePoints(record.points)
    const checkInText = `我在校园燃动完成了 ${Number(record.distance || 0).toFixed(2)} km，运动 ${record.duration || 0} 分钟，平均配速 ${record.pace || '—'} /km。`
    this.setData({
      record: Object.assign({}, record, { dateText: formatDate(record.createdAt), sourceText: record.source === 'location' ? '前台定位' : '演示记录' }),
      hasRecord: true,
      hasRoute: points.length >= 2,
      latitude: points.length ? points[points.length - 1].latitude : 31.2304,
      longitude: points.length ? points[points.length - 1].longitude : 121.4737,
      polyline: points.length >= 2 ? [{ points, color: '#e36b3d', width: 5, dottedLine: false }] : [],
      markers: [],
      checkInText
    })
  },

  onShow() {
    this.setData({ shareEnabled: Boolean(app.globalData.settings.shareCheckIn) })
  },

  onShareAppMessage() {
    const record = this.data.record
    const shareEnabled = app.globalData.settings.shareCheckIn
    return {
      title: record && shareEnabled ? `我在校园燃动完成了 ${record.distance.toFixed(2)} km` : '和我一起体验校园燃动',
      path: '/pages/index/index'
    }
  },

  copyCheckIn() {
    if (!this.data.record) return
    const record = this.data.record
    const text = this.data.checkInText
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '打卡文案已复制', icon: 'success' }) })
  },

  removeRecord() {
    if (!this.data.record) return
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后只会影响当前设备的本地数据。',
      confirmText: '删除',
      success: result => {
        if (!result.confirm) return
        app.removeRecord(this.data.record.id)
        wx.navigateBack()
      }
    })
  }
})
