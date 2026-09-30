const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { AdminStore } = require('../dev/admin-store')
const { createAdminServer } = require('../dev/admin-server')

function tempStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-pulse-admin-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return path.join(directory, 'ops-store.json')
}

function challengeInput(overrides = {}) {
  return Object.assign({
    title: '周末轻松跑',
    subtitle: '本周累计完成 8 公里',
    ruleType: 'weeklyDistance',
    target: 8,
    tone: 'blue',
    reward: '活力徽章',
    durationText: '本周有效',
    participants: 0,
    published: true
  }, overrides)
}

function announcementInput(overrides = {}) {
  return Object.assign({ title: '活动提醒', body: '演示公告内容', published: true }, overrides)
}

test('AdminStore persists challenge and announcement CRUD with audit log', t => {
  const file = tempStore(t)
  const store = new AdminStore(file)
  const createdChallenge = store.saveChallenge(challengeInput())
  assert.ok(createdChallenge.id)
  assert.equal(store.publicConfig().challenges.length, 4)
  const updatedChallenge = store.saveChallenge(challengeInput({ title: '周末环线挑战', published: false }), createdChallenge.id)
  assert.equal(updatedChallenge.title, '周末环线挑战')
  assert.equal(store.publicConfig().challenges.length, 3)

  const announcement = store.saveAnnouncement(announcementInput())
  assert.equal(store.publicConfig().announcements[0].title, '活动提醒')
  store.deleteAnnouncement(announcement.id)
  store.deleteChallenge(createdChallenge.id)

  const restarted = new AdminStore(file)
  assert.equal(restarted.snapshot().challenges.length, 3)
  assert.equal(restarted.snapshot().announcements.length, 1)
  assert.equal(restarted.snapshot().audit.length, 5)
})

test('AdminStore rejects invalid challenge settings without corrupting data', t => {
  const file = tempStore(t)
  const store = new AdminStore(file)
  const before = store.snapshot().challenges.length
  assert.throws(() => store.saveChallenge(challengeInput({ target: -4 })), /Invalid target/)
  assert.equal(store.snapshot().challenges.length, before)
})

test('local Admin API serves console and exposes only published public config', async t => {
  const file = tempStore(t)
  const store = new AdminStore(file)
  const server = createAdminServer({ store })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`

  const health = await fetch(`${base}/health`).then(response => response.json())
  assert.equal(health.mode, 'local-admin-demo')
  const page = await fetch(`${base}/`).then(response => response.text())
  assert.match(page, /校园燃动运营台/)

  const created = await fetch(`${base}/api/admin/challenges`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(challengeInput())
  })
  assert.equal(created.status, 201)
  const config = await fetch(`${base}/api/public/config`).then(response => response.json())
  assert.equal(config.challenges.length, 4)
  assert.equal(config.challenges.some(item => item.title === '周末轻松跑'), true)
  assert.equal(Object.hasOwn(config, 'audit'), false)
})

test('local Admin API validates requests and serves challenge edits', async t => {
  const file = tempStore(t)
  const store = new AdminStore(file)
  const server = createAdminServer({ store })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`

  const invalid = await fetch(`${base}/api/admin/challenges`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '' })
  })
  assert.equal(invalid.status, 400)
  const initial = await fetch(`${base}/api/admin/challenges`).then(response => response.json())
  const id = initial.challenges[0].id
  const edited = await fetch(`${base}/api/admin/challenges/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(challengeInput({ title: '管理员编辑挑战' }))
  })
  assert.equal(edited.status, 200)
  assert.equal((await edited.json()).challenge.title, '管理员编辑挑战')
})

test('local Admin API rejects non-loopback web origins', async t => {
  const server = createAdminServer({ store: new AdminStore(tempStore(t)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/bootstrap`, {
    headers: { origin: 'https://example.invalid' }
  })
  assert.equal(response.status, 403)
})

test('Admin browser assets include expected management views without remote dependencies', () => {
  const root = path.resolve(__dirname, '..', 'admin')
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  assert.match(html, /挑战管理/)
  assert.match(html, /公告管理/)
  assert.match(html, /仅本机/)
  assert.doesNotMatch(html, /<script[^>]+https?:\/\//i)
})


test('AdminStore refuses unsupported/corrupt schemas instead of erasing local data', t => {
  const file = tempStore(t)
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, challenges: [], announcements: [], audit: [] }))
  assert.throws(() => new AdminStore(file), /Unsupported Admin store schema/)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion, 99)
})

test('local Admin API creates, edits, publishes, and removes announcements', async t => {
  const server = createAdminServer({ store: new AdminStore(tempStore(t)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const created = await fetch(`${base}/api/admin/announcements`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(announcementInput({ published: false }))
  })
  assert.equal(created.status, 201)
  const announcement = (await created.json()).announcement
  assert.equal((await fetch(`${base}/api/public/config`).then(r => r.json())).announcements.length, 1)
  await fetch(`${base}/api/admin/announcements/${announcement.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(announcementInput({ title: '已发布公告', published: true }))
  })
  const publicItems = await fetch(`${base}/api/public/config`).then(r => r.json())
  assert.equal(publicItems.announcements.some(item => item.title === '已发布公告'), true)
  await fetch(`${base}/api/admin/announcements/${announcement.id}`, { method: 'DELETE' })
  assert.equal((await fetch(`${base}/api/public/config`).then(r => r.json())).announcements.some(item => item.title === '已发布公告'), false)
})
