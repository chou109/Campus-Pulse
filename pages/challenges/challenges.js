const app = getApp()
const challengeRules = require('../../utils/challenge-rules')

function decorateChallenge(item) {
  const progress = Math.max(0, Math.min(1, Number(item.progress || 0)))
  return Object.assign({}, item, {
    progress,
    progressText: `${Math.round(progress * 100)}%`,
    progressWidth: `${Math.round(progress * 100)}%`
  })
}

function decorateChallenges(challenges) {
  return (challenges || []).map(decorateChallenge)
}

Page({
  data: { challenges: [], recommendation: null },

  onShow() {
    const challenges = decorateChallenges(app.globalData.challenges)
    const recommendation = challengeRules.recommend(app.globalData.challenges, app.globalData.records, app.globalData.streak)
    this.setData({ challenges, recommendation })
  },

  onShareAppMessage() {
    return { title: '来参加校园燃动挑战', path: '/pages/challenges/challenges' }
  },

  viewFeatured() {
    wx.navigateTo({ url: '/pages/challenge-detail/challenge-detail?id=featured' })
  },

  openChallenge(event) {
    wx.navigateTo({ url: `/pages/challenge-detail/challenge-detail?id=${event.currentTarget.dataset.id}` })
  },

  openRecommended(event) {
    wx.navigateTo({ url: `/pages/challenge-detail/challenge-detail?id=${event.currentTarget.dataset.id}` })
  },

  join(event) {
    const id = event.currentTarget.dataset.id
    const challenges = this.data.challenges.map(item => item.id === id
      ? decorateChallenge(Object.assign({}, item, { joined: true, progress: Math.max(item.progress || 0, 0.08) }))
      : item)
    app.updateChallenges(challenges)
    this.setData({ challenges: decorateChallenges(challenges) })
    wx.showToast({ title: '已加入挑战', icon: 'success' })
  },

  leave(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '退出挑战？',
      content: '退出后会保留运动记录，但不再累计本挑战进度。',
      confirmText: '退出',
      success: result => {
        if (!result.confirm) return
        const challenges = this.data.challenges.map(item => item.id === id
          ? decorateChallenge(Object.assign({}, item, { joined: false }))
          : item)
        app.updateChallenges(challenges)
        this.setData({ challenges: decorateChallenges(challenges) })
      }
    })
  }
})
