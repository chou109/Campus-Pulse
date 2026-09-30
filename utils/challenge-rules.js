const stats = require('./statistics')

function progressFor(challenge, records, now) {
  const target = Math.max(1, Number(challenge.target || 1))
  if (challenge.ruleType === 'streak') return Math.min(1, stats.calculateStreak(records, Number(challenge.dailyTargetKm || 2), now || new Date()) / target)
  if (challenge.ruleType === 'monthlyDistance') return Math.min(1, stats.sumDistance(stats.filterRange(records, stats.getMonthRange(now || new Date()))) / target)
  if (challenge.ruleType === 'weeklyDistance') return Math.min(1, stats.sumDistance(stats.filterRange(records, stats.getWeekRange(now || new Date()))) / target)
  return Math.max(0, Math.min(1, Number(challenge.progress || 0)))
}

function recommend(challenges, records, streak, now) {
  const decorated = (challenges || []).map(item => decorate(item, records, now))
  const activeStreak = decorated.find(item => item.ruleType === 'streak' && item.joined && !item.completed && streak > 0)
  if (activeStreak) return { challengeId: activeStreak.id, reason: `你已连续运动 ${streak} 天，再坚持几天就能解锁连续挑战勋章。` }
  const activeMonthly = decorated.find(item => item.ruleType === 'monthlyDistance' && item.joined && !item.completed && item.progress > 0)
  if (activeMonthly) return { challengeId: activeMonthly.id, reason: `本月已完成目标的 ${activeMonthly.progressPercent}%，继续运动就能接近挑战目标。` }
  const available = decorated.find(item => !item.joined && !item.completed)
  if (available) return { challengeId: available.id, reason: '可以尝试新的校园挑战，和同学一起保持运动节奏。' }
  return null
}

function decorate(challenge, records, now) {
  const progress = progressFor(challenge, records, now)
  return Object.assign({}, challenge, {
    progress,
    progressPercent: Math.round(progress * 100),
    completed: progress >= 1
  })
}

module.exports = { progressFor, decorate, recommend }
