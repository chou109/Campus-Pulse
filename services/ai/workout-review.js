const stats = require('../../utils/statistics')
const PROXY_URL = 'http://127.0.0.1:8788/api/ai/workout-review'

function buildWorkoutInput(record, records, weeklyGoalKm) {
  const weekRecords = stats.filterRange(records || [], stats.getWeekRange(new Date()))
  return {
    distance_km: Number(record.distance || 0),
    duration_minutes: Number(record.duration || 0),
    pace: String(record.pace || '—'),
    recent_sessions: weekRecords.length,
    weekly_goal_km: Number(weeklyGoalKm || 10),
    weekly_completed_km: stats.sumDistance(weekRecords)
  }
}

function createLocalFallback(input) {
  const remaining = Math.max(0, Number(input.weekly_goal_km) - Number(input.weekly_completed_km))
  return {
    summary: `本次完成 ${Number(input.distance_km).toFixed(2)} 公里，用时 ${Math.round(input.duration_minutes)} 分钟，平均配速 ${input.pace}。`,
    positive_feedback: '你正在稳步积累运动记录，保持适合自己的节奏就很好。',
    next_action: remaining > 0 ? `本周目标还差 ${remaining.toFixed(1)} 公里，可根据身体状态安排下一次轻松运动。` : '本周目标已经完成，可以按身体状态安排休息或轻松活动。',
    safety_note: '复盘仅用于运动记录参考，不是医疗建议；如感到明显不适，请停止运动并寻求专业帮助。'
  }
}

function generateWorkoutReview(record, records, weeklyGoalKm) {
  const input = buildWorkoutInput(record, records, weeklyGoalKm)
  const fallback = createLocalFallback(input)
  return new Promise(resolve => {
    wx.request({
      url: PROXY_URL,
      method: 'POST',
      data: input,
      timeout: 30000,
      success: response => {
        const review = response && response.statusCode === 200 && response.data && response.data.review
        const valid = review && ['summary', 'positive_feedback', 'next_action', 'safety_note'].every(key => typeof review[key] === 'string' && review[key].length > 0)
        resolve(valid ? { review, source: 'ai' } : { review: fallback, source: 'local-fallback' })
      },
      fail: () => resolve({ review: fallback, source: 'local-fallback' })
    })
  })
}

module.exports = { PROXY_URL, buildWorkoutInput, createLocalFallback, generateWorkoutReview }
