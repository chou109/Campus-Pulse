const fs = require('node:fs')
const path = require('node:path')
const { getDefaultChallenges } = require('../utils/default-challenges')

const SCHEMA_VERSION = 1
const RULE_TYPES = new Set(['streak', 'monthlyDistance', 'weeklyDistance', 'static'])
const TONES = new Set(['orange', 'blue', 'purple'])
const DEFAULT_ANNOUNCEMENTS = [
  {
    id: 'welcome',
    title: '欢迎来到校园燃动',
    body: '先用演示模式熟悉运动记录、榜单与挑战。',
    published: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

function defaultState() {
  const createdAt = nowIso()
  return {
    schemaVersion: SCHEMA_VERSION,
    challenges: getDefaultChallenges().map(item => Object.assign({}, item, { createdAt, updatedAt: createdAt, published: true })),
    announcements: DEFAULT_ANNOUNCEMENTS.map(item => Object.assign({}, item)),
    audit: []
  }
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function nowIso() { return new Date().toISOString() }
function cleanText(value, maxLength, field, required = true) {
  const text = String(value || '').trim()
  if (required && !text) throw Object.assign(new Error(`Missing ${field}`), { statusCode: 400 })
  if (text.length > maxLength) throw Object.assign(new Error(`${field} is too long`), { statusCode: 400 })
  return text
}
function finiteNumber(value, field, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw Object.assign(new Error(`Invalid ${field}`), { statusCode: 400 })
  return Math.round(number * 100) / 100
}

function normalizeChallenge(input, existing) {
  const id = existing ? existing.id : `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const ruleType = String(input.ruleType || (existing && existing.ruleType) || 'weeklyDistance')
  const tone = String(input.tone || (existing && existing.tone) || 'orange')
  if (!RULE_TYPES.has(ruleType)) throw Object.assign(new Error('Invalid rule type'), { statusCode: 400 })
  if (!TONES.has(tone)) throw Object.assign(new Error('Invalid display tone'), { statusCode: 400 })
  const createdAt = existing ? existing.createdAt : nowIso()
  return {
    id: String(id),
    title: cleanText(input.title, 80, 'title'),
    subtitle: cleanText(input.subtitle, 180, 'subtitle'),
    ruleType,
    target: finiteNumber(input.target, 'target', 1, 10000),
    dailyTargetKm: ruleType === 'streak' ? finiteNumber(input.dailyTargetKm || 2, 'dailyTargetKm', 0.2, 50) : undefined,
    reward: cleanText(input.reward, 60, 'reward', false),
    tone,
    durationText: cleanText(input.durationText, 50, 'durationText', false),
    participants: finiteNumber(input.participants || 0, 'participants', 0, 1000000),
    published: Boolean(input.published),
    enabled: Boolean(input.published),
    joined: false,
    progress: 0,
    createdAt,
    updatedAt: nowIso()
  }
}

function normalizeAnnouncement(input, existing) {
  const createdAt = existing ? existing.createdAt : nowIso()
  return {
    id: existing ? existing.id : `notice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: cleanText(input.title, 80, 'title'),
    body: cleanText(input.body, 500, 'body'),
    published: Boolean(input.published),
    createdAt,
    updatedAt: nowIso()
  }
}

class AdminStore {
  constructor(filePath) {
    this.filePath = filePath || process.env.CAMPUS_PULSE_ADMIN_STORE || path.join(__dirname, '..', 'data', 'local', 'ops-store.json')
    this.state = this.load()
  }

  load() {
    let data
    try {
      data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return defaultState()
      throw new Error(`Local Admin store is unreadable; refusing to reset it: ${error.message}`)
    }
    if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported Admin store schema ${data.schemaVersion}; current schema is ${SCHEMA_VERSION}`)
    if (!Array.isArray(data.challenges) || !Array.isArray(data.announcements) || !Array.isArray(data.audit)) {
      throw new Error('Local Admin store has an invalid shape; refusing to reset it')
    }
    return data
  }

  persist() {
    const directory = path.dirname(this.filePath)
    fs.mkdirSync(directory, { recursive: true })
    const temporary = `${this.filePath}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 })
    fs.renameSync(temporary, this.filePath)
  }

  audit(action, entityType, entityId, label) {
    this.state.audit.unshift({ action, entityType, entityId: String(entityId), label: String(label || '').slice(0, 80), at: nowIso() })
    this.state.audit = this.state.audit.slice(0, 100)
  }

  snapshot() { return clone(this.state) }
  publicConfig() {
    return {
      challenges: clone(this.state.challenges.filter(item => item.published)),
      announcements: clone(this.state.announcements.filter(item => item.published))
    }
  }
  overview() {
    const publishedChallenges = this.state.challenges.filter(item => item.published).length
    const publishedAnnouncements = this.state.announcements.filter(item => item.published).length
    return {
      challengeCount: this.state.challenges.length,
      publishedChallengeCount: publishedChallenges,
      announcementCount: this.state.announcements.length,
      publishedAnnouncementCount: publishedAnnouncements,
      auditCount: this.state.audit.length,
      sourceLabel: '本机 JSON 配置（非云端用户数据）'
    }
  }

  saveChallenge(input, id) {
    const index = id ? this.state.challenges.findIndex(item => String(item.id) === String(id)) : -1
    if (id && index < 0) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 })
    const existing = index >= 0 ? this.state.challenges[index] : null
    const challenge = normalizeChallenge(input, existing)
    if (existing) this.state.challenges[index] = challenge
    else this.state.challenges.unshift(challenge)
    this.audit(existing ? 'update' : 'create', 'challenge', challenge.id, challenge.title)
    this.persist()
    return clone(challenge)
  }

  deleteChallenge(id) {
    const index = this.state.challenges.findIndex(item => String(item.id) === String(id))
    if (index < 0) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 })
    const [challenge] = this.state.challenges.splice(index, 1)
    this.audit('delete', 'challenge', id, challenge.title)
    this.persist()
  }

  saveAnnouncement(input, id) {
    const index = id ? this.state.announcements.findIndex(item => String(item.id) === String(id)) : -1
    if (id && index < 0) throw Object.assign(new Error('Announcement not found'), { statusCode: 404 })
    const existing = index >= 0 ? this.state.announcements[index] : null
    const announcement = normalizeAnnouncement(input, existing)
    if (existing) this.state.announcements[index] = announcement
    else this.state.announcements.unshift(announcement)
    this.audit(existing ? 'update' : 'create', 'announcement', announcement.id, announcement.title)
    this.persist()
    return clone(announcement)
  }

  deleteAnnouncement(id) {
    const index = this.state.announcements.findIndex(item => String(item.id) === String(id))
    if (index < 0) throw Object.assign(new Error('Announcement not found'), { statusCode: 404 })
    const [announcement] = this.state.announcements.splice(index, 1)
    this.audit('delete', 'announcement', id, announcement.title)
    this.persist()
  }
}

module.exports = { AdminStore, defaultState }
