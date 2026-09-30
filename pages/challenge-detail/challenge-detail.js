const app = getApp()
const challengeRules = require('../../utils/challenge-rules')

const FEATURED = {
  id: 'featured',
  title: '秋日校园环线',
  subtitle: '在活动期间完成校园环线打卡即可累计进度。',
  tone: 'orange',
  reward: '校园探索家',
  participants: 128,
  target: 30,
  ruleType: 'monthlyDistance',
  durationText: '本月有效',
  joined: true
}

Page({
  data: { challenge: null, hasChallenge: false, progressText: '0%', progressWidth: '0%', localOnly: true },
  challengeId: '',

  onLoad(options) {
    this.challengeId = options.id || ''
    this.refreshChallenge()
  },

  onShow() { this.refreshChallenge() },

  refreshChallenge() {
    const challenge = this.challengeId === 'featured'
      ? FEATURED
      : (app.globalData.challenges || []).find(item => String(item.id) === String(this.challengeId))
    if (!challenge) {
      this.setData({ challenge: null, hasChallenge: false })
      return
    }
    const decorated = challengeRules.decorate(challenge, app.globalData.records || [])
    this.setData({
      challenge: decorated,
      hasChallenge: true,
      progressText: `${decorated.progressPercent}%`,
      progressWidth: `${decorated.progressPercent}%`
    })
  },

  join() {
    if (this.challengeId === 'featured') {
      wx.showToast({ title: '演示活动仅供预览', icon: 'none' })
      return
    }
    const challenges = app.globalData.challenges.map(item => String(item.id) === String(this.challengeId) ? Object.assign({}, item, { joined: true }) : item)
    app.updateChallenges(challenges)
    this.refreshChallenge()
    wx.showToast({ title: '已加入挑战', icon: 'success' })
  },

  leave() {
    if (this.challengeId === 'featured') return
    wx.showModal({
      title: '退出挑战？',
      content: '运动记录会保留，但退出后不再累计该挑战进度。',
      confirmText: '退出',
      success: result => {
        if (!result.confirm) return
        app.updateChallenges(app.globalData.challenges.map(item => String(item.id) === String(this.challengeId) ? Object.assign({}, item, { joined: false }) : item))
        this.refreshChallenge()
      }
    })
  },

  onShareAppMessage() {
    const title = this.data.challenge ? `和我一起参加「${this.data.challenge.title}」` : '和我一起加入校园燃动挑战'
    return { title, path: `/pages/challenge-detail/challenge-detail?id=${this.challengeId}` }
  }
})
