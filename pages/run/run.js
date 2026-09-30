const app = getApp()
const EARTH_RADIUS_KM = 6371
const MAX_POINT_ACCURACY_METERS = 80
const MAX_POINT_JUMP_KM = 0.3
const MIN_FINISH_DISTANCE_KM = 0.05

function toRad(value) { return value * Math.PI / 180 }
function formatDate(date) { return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}` }

function distanceBetween(a, b) {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

Page({
  data: {
    running: false,
    finishing: false,
    paused: false,
    demoMode: app.globalData.demoMode,
    seconds: 0,
    distance: '0.00',
    pace: '—',
    calories: 0,
    points: [],
    latitude: 31.2304,
    longitude: 121.4737,
    markers: [],
    polyline: [],
    locationStatus: '等待开始',
    canFinish: false
  },
  timer: null,
  locationTimer: null,
  demoIndex: 0,
  sessionId: 0,
  locationRequestPending: false,
  locationFailureShown: false,

  onUnload() { this.sessionId += 1; this.stopTimers() },

  toggleMode(event) {
    if (this.data.running) {
      wx.showToast({ title: '请先结束本次运动', icon: 'none' })
      this.setData({ demoMode: this.data.demoMode })
      return
    }
    const demoMode = event.detail.value
    app.globalData.demoMode = demoMode
    this.setData({ demoMode, locationStatus: demoMode ? '演示模式待开始' : '真实定位待授权' })
  },

  start() {
    if (this.data.running && !this.data.paused) return
    if (this.data.running && this.data.paused) {
      this.setData({ paused: false, locationStatus: '记录中' })
      return
    }

    this.resetSession()
    this.sessionId += 1
    this.locationFailureShown = false
    this.locationRequestPending = false
    this.setData({ running: true, paused: false, locationStatus: app.globalData.demoMode ? '演示记录中' : '请求定位中' })
    this.timer = setInterval(() => {
      if (!this.data.paused) this.setData({ seconds: this.data.seconds + 1 })
    }, 1000)
    const sessionId = this.sessionId
    this.locationTimer = setInterval(() => this.collectPoint(sessionId), 5000)
    this.collectPoint(sessionId)
  },

  pause() {
    if (!this.data.running) return
    const paused = !this.data.paused
    this.setData({ paused, locationStatus: paused ? '已暂停' : '记录中' })
  },

  collectPoint(sessionId) {
    if (!this.data.running || this.data.paused || (sessionId !== undefined && sessionId !== this.sessionId)) return
    if (this.data.demoMode) {
      const point = { latitude: 31.2304 + this.demoIndex * 0.00015, longitude: 121.4737 + this.demoIndex * 0.00018, accuracy: 5 }
      this.demoIndex += 1
      this.updatePoint(point)
      return
    }

    if (this.locationRequestPending) return
    if (typeof wx.getLocation !== 'function') {
      this.setData({ locationStatus: '当前环境不支持定位，请使用演示模式' })
      return
    }
    this.locationRequestPending = true
    const requestSession = this.sessionId
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      success: point => {
        this.locationRequestPending = false
        if (requestSession !== this.sessionId || !this.data.running || this.data.paused) return
        this.updatePoint(point)
      },
      fail: error => {
        this.locationRequestPending = false
        if (requestSession !== this.sessionId || !this.data.running) return
        this.setData({ locationStatus: '定位失败，请检查授权' })
        if (this.locationFailureShown) return
        this.locationFailureShown = true
        wx.showModal({
          title: '需要定位权限',
          content: '真实定位模式需要使用前台定位。你可以改用演示模式，或前往设置授权。',
          confirmText: '去设置',
          cancelText: '演示模式',
          success: result => {
            if (result.confirm && wx.openSetting) wx.openSetting({})
            if (result.cancel) {
              app.globalData.demoMode = true
              this.setData({ demoMode: true, locationStatus: '已切换为演示模式' })
              this.locationFailureShown = false
            }
          }
        })
        console.warn('location failed', error)
      }
    })
  },

  updatePoint(point) {
    const latitude = Number(point && point.latitude)
    const longitude = Number(point && point.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      this.setData({ locationStatus: '定位坐标无效，暂不计入' })
      return
    }
    if (point.accuracy && point.accuracy > MAX_POINT_ACCURACY_METERS) {
      this.setData({ locationStatus: '定位精度较低，暂不计入' })
      return
    }

    const normalizedPoint = { latitude, longitude }
    const points = this.data.points
    const last = points[points.length - 1]
    const added = last ? distanceBetween(last, normalizedPoint) : 0
    if (added > MAX_POINT_JUMP_KM) {
      this.setData({ locationStatus: '检测到定位跳点，暂不计入' })
      return
    }

    const nextPoints = points.concat(normalizedPoint)
    const km = Number(this.data.distance) + added
    const minutes = Math.max(this.data.seconds / 60, 1 / 60)
    const paceMinutes = km > 0 ? minutes / km : 0
    const pace = km > 0 ? `${Math.floor(paceMinutes)}'${String(Math.floor((paceMinutes % 1) * 60)).padStart(2, '0')}"` : '—'
    const canFinish = nextPoints.length >= 2 && km >= MIN_FINISH_DISTANCE_KM
    this.setData({
      points: nextPoints,
      latitude: normalizedPoint.latitude,
      longitude: normalizedPoint.longitude,
      distance: km.toFixed(2),
      pace,
      calories: Math.round(km * 72),
      canFinish,
      locationStatus: canFinish ? '记录中' : '继续运动，累计更多有效轨迹',
      // 地图折线至少需要两个有效点；首个定位点只更新地图中心，避免渲染层生成非法路径。
      markers: [],
      polyline: nextPoints.length >= 2 ? [{ points: nextPoints, color: '#e36b3d', width: 5, dottedLine: false }] : []
    })
  },

  finish() {
    if (!this.data.running || this.data.finishing) return
    if (!this.data.canFinish) {
      wx.showToast({ title: '还没有有效运动数据', icon: 'none' })
      return
    }
    this.setData({ finishing: true })
    wx.showModal({
      title: '结束本次运动？',
      content: `将保存 ${this.data.distance} km 的本地记录。`,
      confirmText: '结束并打卡',
      success: result => {
        if (result.confirm) this.saveRecord()
        else this.setData({ finishing: false })
      },
      fail: () => this.setData({ finishing: false })
    })
  },

  saveRecord() {
    const record = {
      date: formatDate(new Date()),
      createdAt: new Date().toISOString(),
      distance: Number(this.data.distance) || 0,
      duration: Math.max(1, Math.round(this.data.seconds / 60)),
      pace: this.data.pace === '—' ? '7\'30"' : this.data.pace,
      calories: this.data.calories || 0,
      source: this.data.demoMode ? 'demo' : 'location',
      points: this.data.points
    }
    app.addRecord(record)
    this.stopTimers()
    this.setData({ running: false, paused: false, finishing: false, locationStatus: '已完成' })
    wx.showModal({ title: '运动完成', content: `本次完成 ${record.distance.toFixed(2)} km，已加入本地运动记录。`, showCancel: false, success: () => wx.navigateBack() })
  },

  resetSession() {
    this.sessionId += 1
    this.locationRequestPending = false
    this.stopTimers()
    this.demoIndex = 0
    this.setData({ seconds: 0, distance: '0.00', pace: '—', calories: 0, points: [], markers: [], polyline: [], canFinish: false, finishing: false })
  },

  stopTimers() {
    if (this.timer) clearInterval(this.timer)
    if (this.locationTimer) clearInterval(this.locationTimer)
    this.timer = null
    this.locationTimer = null
    this.locationRequestPending = false
  },

  formatTime(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
    const rest = String(seconds % 60).padStart(2, '0')
    return `${minutes}:${rest}`
  }
})
