function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function localDayStart(value) {
  const date = validDate(value)
  if (!date) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function dayKey(value) {
  const date = localDayStart(value)
  if (!date) return ''
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function mondayOf(value) {
  const date = localDayStart(value)
  if (!date) return null
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}

function isInRange(record, start, end) {
  const date = validDate(record && record.createdAt)
  return Boolean(date && date >= start && date < end)
}

function getWeekRange(reference) {
  const start = mondayOf(reference || new Date())
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function getMonthRange(reference) {
  const date = validDate(reference || new Date()) || new Date()
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start, end }
}

function filterRange(records, range) {
  return (records || []).filter(record => isInRange(record, range.start, range.end))
}

function sumDistance(records) {
  return (records || []).reduce((sum, record) => {
    const distance = Number(record && record.distance)
    return sum + (Number.isFinite(distance) && distance > 0 ? distance : 0)
  }, 0)
}

function groupDistanceByDay(records) {
  const result = Object.create(null)
  ;(records || []).forEach(record => {
    const key = dayKey(record && record.createdAt)
    const distance = Number(record && record.distance)
    if (key && Number.isFinite(distance) && distance > 0) result[key] = (result[key] || 0) + distance
  })
  return result
}

function calculateStreak(records, minimumDailyKm, reference) {
  const threshold = Number(minimumDailyKm || 0)
  const daily = groupDistanceByDay(records)
  const qualifying = Object.keys(daily).filter(key => daily[key] >= threshold)
    .map(key => {
      const parts = key.split('-').map(Number)
      return new Date(parts[0], parts[1] - 1, parts[2])
    })
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
  if (!qualifying.length) return 0

  const today = localDayStart(reference || new Date())
  const newestGap = Math.round((today.getTime() - qualifying[0].getTime()) / 86400000)
  if (newestGap < 0 || newestGap > 1) return 0

  let streak = 1
  for (let index = 1; index < qualifying.length; index += 1) {
    const gap = Math.round((qualifying[index - 1].getTime() - qualifying[index].getTime()) / 86400000)
    if (gap !== 1) break
    streak += 1
  }
  return streak
}

function buildWeekChart(records, reference) {
  const range = getWeekRange(reference || new Date())
  const totals = groupDistanceByDay(filterRange(records, range))
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  const values = labels.map((label, index) => {
    const date = new Date(range.start)
    date.setDate(date.getDate() + index)
    return { label, distance: totals[dayKey(date)] || 0, isToday: dayKey(date) === dayKey(new Date()) }
  })
  const max = Math.max(1, ...values.map(item => item.distance))
  return values.map(item => Object.assign({}, item, { height: item.distance ? Math.max(12, Math.round(item.distance / max * 100)) : 6 }))
}

function buildMonthChart(records, reference) {
  const range = getMonthRange(reference || new Date())
  const now = validDate(reference || new Date()) || new Date()
  const weekStarts = []
  let cursor = mondayOf(range.start)
  while (cursor < range.end && weekStarts.length < 6) {
    weekStarts.push(new Date(cursor))
    cursor = new Date(cursor)
    cursor.setDate(cursor.getDate() + 7)
  }
  const monthRecords = filterRange(records, range)
  const values = weekStarts.map((start, index) => {
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return {
      label: `第${index + 1}周`,
      distance: sumDistance(monthRecords.filter(record => isInRange(record, start, end))),
      isToday: now >= start && now < end
    }
  })
  const max = Math.max(1, ...values.map(item => item.distance))
  return values.map(item => Object.assign({}, item, { height: item.distance ? Math.max(12, Math.round(item.distance / max * 100)) : 6 }))
}

function previousWeekRange(reference) {
  const current = getWeekRange(reference || new Date())
  const start = new Date(current.start)
  start.setDate(start.getDate() - 7)
  return { start, end: current.start }
}

module.exports = {
  validDate,
  dayKey,
  getWeekRange,
  getMonthRange,
  filterRange,
  sumDistance,
  groupDistanceByDay,
  calculateStreak,
  buildWeekChart,
  buildMonthChart,
  previousWeekRange
}
