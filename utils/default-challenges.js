const DEFAULT_CHALLENGES = [
  { id: '1', title: '七日晨跑计划', subtitle: '连续 7 天完成 2 km', progress: 0, joined: true, tone: 'orange', reward: '早起鸟勋章', ruleType: 'streak', target: 7, dailyTargetKm: 2, participants: 86, durationText: '连续 7 天', enabled: true, published: true },
  { id: '2', title: '校园环线挑战', subtitle: '本月累计跑满 30 km', progress: 0, joined: true, tone: 'blue', reward: '校园探索家', ruleType: 'monthlyDistance', target: 30, participants: 128, durationText: '本月有效', enabled: true, published: true },
  { id: '3', title: '社团接力赛', subtitle: '和队友一起冲进周榜前十', progress: 0.36, joined: false, tone: 'purple', reward: '团队能量值', ruleType: 'static', target: 1, participants: 42, durationText: '演示活动', enabled: true, published: true }
]

function getDefaultChallenges() {
  return DEFAULT_CHALLENGES.map(item => Object.assign({}, item))
}

module.exports = { DEFAULT_CHALLENGES, getDefaultChallenges }
