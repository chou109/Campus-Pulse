const app = getApp()

const WEEK_RANK = [
  { rank: 1, name: '周予安', school: '建筑学院', km: '18.6', avatar: '周', me: false },
  { rank: 2, name: '林同学', school: '设计学院', km: '16.1', avatar: '林', me: true },
  { rank: 3, name: '陈星野', school: '计算机学院', km: '14.8', avatar: '陈', me: false },
  { rank: 4, name: '赵可心', school: '商学院', km: '12.4', avatar: '赵', me: false }
]

const MONTH_RANK = [
  { rank: 1, name: '陈星野', school: '计算机学院', km: '62.8', avatar: '陈', me: false },
  { rank: 2, name: '周予安', school: '建筑学院', km: '58.3', avatar: '周', me: false },
  { rank: 3, name: '林同学', school: '设计学院', km: '48.6', avatar: '林', me: true },
  { rank: 4, name: '赵可心', school: '商学院', km: '44.1', avatar: '赵', me: false }
]

function anonymize(item) {
  return item.me ? Object.assign({}, item, { name: '我的排名（已隐藏）', avatar: '?', km: '—', school: '已关闭公开' }) : item
}

function buildViewModel(tab, publicRank) {
  const isWeek = tab === 0
  const source = isWeek ? WEEK_RANK : MONTH_RANK
  const list = publicRank ? source : source.map(anonymize)
  const podium = isWeek
    ? [
        { avatar: '周', name: '周予安', km: '18.6' },
        { avatar: publicRank ? '周' : '?', name: publicRank ? '周予安' : '已隐藏', km: publicRank ? '18.6' : '—', first: true },
        { avatar: '陈', name: '陈星野', km: '14.8' }
      ]
    : [
        { avatar: '周', name: '周予安', km: '58.3' },
        { avatar: '陈', name: '陈星野', km: '62.8', first: true },
        { avatar: publicRank ? '林' : '?', name: publicRank ? '林同学' : '已隐藏', km: publicRank ? '48.6' : '—' }
      ]
  return { list, podium, isWeek, publicRank }
}

Page({
  data: Object.assign({ tab: 0 }, buildViewModel(0, true)),

  onShow() {
    this.setData(buildViewModel(this.data.tab, app.globalData.settings.publicRank))
  },

  switchTab(event) {
    const tab = Number(event.currentTarget.dataset.tab)
    this.setData(Object.assign({ tab }, buildViewModel(tab, app.globalData.settings.publicRank)))
  }
})
