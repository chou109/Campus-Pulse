const app = getApp()
const stats = require('../../utils/statistics')

const PEERS = [
  { name: '周予安', school: '建筑学院', avatar: '周' },
  { name: '陈星野', school: '计算机学院', avatar: '陈' },
  { name: '赵可心', school: '商学院', avatar: '赵' },
  { name: '许沐阳', school: '外国语学院', avatar: '许' }
]

function createRanking(tab, publicRank) {
  const records = app.globalData.records || []
  const range = tab === 0 ? stats.getWeekRange(new Date()) : stats.getMonthRange(new Date())
  const myDistance = stats.sumDistance(stats.filterRange(records, range))
  const mine = {
    name: app.globalData.user.name,
    school: '设计学院',
    avatar: app.globalData.user.avatarText,
    distance: myDistance,
    me: true
  }
  const peers = PEERS.map((peer, index) => Object.assign({}, peer, {
    distance: tab === 0 ? [18.6, 14.8, 12.4, 9.7][index] : [62.8, 48.6, 44.1, 37.5][index],
    me: false
  }))
  const ordered = peers.concat([mine]).sort((a, b) => b.distance - a.distance)
  const list = ordered.map((item, index) => {
    const hidden = item.me && !publicRank
    return {
      rank: index + 1,
      name: hidden ? '我的排名（已隐藏）' : item.name,
      school: hidden ? '已关闭公开' : item.school,
      avatar: hidden ? '?' : item.avatar,
      km: hidden ? '—' : item.distance.toFixed(1),
      me: item.me
    }
  })
  const podium = ordered.slice(0, 3).map((item, index) => {
    const hidden = item.me && !publicRank
    return {
      name: hidden ? '已隐藏' : item.name,
      avatar: hidden ? '?' : item.avatar,
      km: hidden ? '—' : item.distance.toFixed(1),
      first: index === 0,
      me: item.me
    }
  })
  return { list, podium, isWeek: tab === 0, publicRank, mineDistance: myDistance.toFixed(1) }
}

Page({
  data: Object.assign({ tab: 0, isDemoRanking: true, mineDistance: '0.0' }, createRanking(0, true)),

  onShow() {
    this.setData(createRanking(this.data.tab, app.globalData.settings.publicRank))
  },

  switchTab(event) {
    const tab = Number(event.currentTarget.dataset.tab)
    this.setData(Object.assign({ tab }, createRanking(tab, app.globalData.settings.publicRank)))
  }
})
