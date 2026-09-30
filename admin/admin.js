const state = { overview: null, challenges: [], announcements: [], audit: [], activeView: 'overview' }
const $ = selector => document.querySelector(selector)
const $$ = selector => Array.from(document.querySelectorAll(selector))
const api = '/api/admin'
let toastTimer

function closeDialog(id) {
  const dialog = $(`#${id}`)
  dialog.classList.remove('open')
  dialog.setAttribute('aria-hidden', 'true')
}

function showDialog(id) {
  const dialog = $(`#${id}`)
  dialog.classList.add('open')
  dialog.setAttribute('aria-hidden', 'false')
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, Object.assign({ headers: { 'content-type': 'application/json' } }, options))
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`)
  return payload
}

function toast(message) {
  const element = $('#toast')
  element.textContent = message
  element.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element.classList.remove('show'), 2200)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function ruleText(item) {
  const rules = { streak: `连续 ${item.target} 天 · 每天 ${item.dailyTargetKm || 2} km`, monthlyDistance: `本月累计 ${item.target} km`, weeklyDistance: `本周累计 ${item.target} km`, static: '演示活动规则' }
  return rules[item.ruleType] || '自定义规则'
}

function setView(name) {
  state.activeView = name
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`))
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === name))
}

function renderOverview() {
  const overview = state.overview || {}
  $('#stat-challenges').textContent = overview.challengeCount || 0
  $('#stat-published-challenges').textContent = overview.publishedChallengeCount || 0
  $('#stat-announcements').textContent = overview.announcementCount || 0
  $('#stat-audit').textContent = overview.auditCount || 0
  $('#storage-label').textContent = overview.sourceLabel || '本地 JSON'
  renderAudit($('#overview-audit'), state.audit.slice(0, 5))
}

function renderChallenges() {
  const body = $('#challenge-rows')
  $('#challenge-count-label').textContent = `${state.challenges.length} 项`
  $('#challenge-empty').classList.toggle('hidden', state.challenges.length > 0)
  body.innerHTML = state.challenges.map(item => `<tr>
    <td><strong>${escapeHtml(item.title)}</strong><span class="cell-sub">${escapeHtml(item.subtitle)}</span></td>
    <td>${escapeHtml(ruleText(item))}</td>
    <td>${Number(item.participants || 0)}</td>
    <td><span class="badge ${item.published ? 'live' : 'draft'}">${item.published ? '已发布' : '草稿/下架'}</span></td>
    <td>${formatDate(item.updatedAt)}</td>
    <td><div class="row-actions"><button class="row-action" data-action="edit-challenge" data-id="${escapeHtml(item.id)}">编辑</button><button class="row-action danger" data-action="delete-challenge" data-id="${escapeHtml(item.id)}">删除</button></div></td>
  </tr>`).join('')
}

function renderAnnouncements() {
  const body = $('#announcement-rows')
  $('#announcement-count-label').textContent = `${state.announcements.length} 项`
  $('#announcement-empty').classList.toggle('hidden', state.announcements.length > 0)
  body.innerHTML = state.announcements.map(item => `<tr>
    <td><strong>${escapeHtml(item.title)}</strong></td>
    <td><span class="cell-sub">${escapeHtml(item.body)}</span></td>
    <td><span class="badge ${item.published ? 'live' : 'draft'}">${item.published ? '已发布' : '草稿/下架'}</span></td>
    <td>${formatDate(item.updatedAt)}</td>
    <td><div class="row-actions"><button class="row-action" data-action="edit-announcement" data-id="${escapeHtml(item.id)}">编辑</button><button class="row-action danger" data-action="delete-announcement" data-id="${escapeHtml(item.id)}">删除</button></div></td>
  </tr>`).join('')
}

function renderAudit(container, events) {
  if (!events.length) {
    container.innerHTML = '<div class="empty-state"><span>◷</span><strong>暂时没有配置操作</strong><p>新增或修改挑战/公告后会显示在这里。</p></div>'
    return
  }
  container.innerHTML = events.map(item => `<div class="audit-item"><i class="audit-dot"></i><div class="audit-copy"><strong>${escapeHtml(actionText(item.action, item.entityType))}：${escapeHtml(item.label)}</strong><span>${escapeHtml(item.entityType === 'challenge' ? '挑战配置' : '公告配置')}</span></div><time class="audit-time">${formatDate(item.at)}</time></div>`).join('')
}

function actionText(action, type) {
  const verbs = { create: '新建', update: '更新', delete: '删除' }
  return `${verbs[action] || '操作'}${type === 'challenge' ? '挑战' : '公告'}`
}

async function refresh() {
  try {
    const data = await request('/bootstrap')
    state.overview = data.overview || {}
    state.challenges = Array.isArray(data.challenges) ? data.challenges : []
    state.announcements = Array.isArray(data.announcements) ? data.announcements : []
    state.audit = Array.isArray(data.audit) ? data.audit : []
    renderOverview()
    renderChallenges()
    renderAnnouncements()
    $('#server-status').textContent = '本机服务在线'
    $('#server-status').classList.remove('bad')
  } catch (error) {
    $('#server-status').textContent = '连接失败'
    $('#server-status').classList.add('bad')
    toast(error.message)
  }
}

function field(form, name) { return form.elements.namedItem(name) }

function formObject(form) {
  const data = new FormData(form)
  const result = Object.fromEntries(data.entries())
  form.querySelectorAll('input[type=checkbox]').forEach(input => { result[input.name] = input.checked })
  ;['target', 'dailyTargetKm', 'participants'].forEach(key => {
    if (result[key] !== undefined && result[key] !== '') result[key] = Number(result[key])
  })
  return result
}

function openChallengeEditor(item) {
  const form = $('#challenge-form')
  form.reset()
  field(form, 'id').value = item ? item.id : ''
  field(form, 'title').value = item ? item.title : ''
  field(form, 'subtitle').value = item ? item.subtitle : ''
  field(form, 'ruleType').value = item ? item.ruleType : 'weeklyDistance'
  field(form, 'target').value = item ? item.target : 10
  field(form, 'dailyTargetKm').value = item ? item.dailyTargetKm || 2 : 2
  field(form, 'reward').value = item ? item.reward || '' : ''
  field(form, 'tone').value = item ? item.tone || 'orange' : 'orange'
  field(form, 'durationText').value = item ? item.durationText || '' : ''
  field(form, 'participants').value = item ? item.participants || 0 : 0
  field(form, 'published').checked = item ? Boolean(item.published) : true
  $('#challenge-error').textContent = ''
  $('#challenge-dialog-title').textContent = item ? '编辑挑战' : '新建挑战'
  showDialog('challenge-dialog')
}

function openAnnouncementEditor(item) {
  const form = $('#announcement-form')
  form.reset()
  field(form, 'id').value = item ? item.id : ''
  field(form, 'title').value = item ? item.title : ''
  field(form, 'body').value = item ? item.body : ''
  field(form, 'published').checked = item ? Boolean(item.published) : true
  $('#announcement-error').textContent = ''
  $('#announcement-dialog-title').textContent = item ? '编辑公告' : '新建公告'
  showDialog('announcement-dialog')
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)))
$$('[data-goto]').forEach(button => button.addEventListener('click', () => setView(button.dataset.goto)))
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)))
$('#add-challenge').addEventListener('click', () => openChallengeEditor(null))
$('#add-announcement').addEventListener('click', () => openAnnouncementEditor(null))
$('#refresh-all').addEventListener('click', refresh)
$('#refresh-challenges').addEventListener('click', refresh)
$('#refresh-announcements').addEventListener('click', refresh)
$('#refresh-audit').addEventListener('click', refresh)

$('#challenge-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget
  const data = formObject(form)
  const id = data.id
  delete data.id
  try {
    await request(id ? `/challenges/${encodeURIComponent(id)}` : '/challenges', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) })
    closeDialog('challenge-dialog')
    toast(id ? '挑战已更新' : '挑战已创建')
    await refresh()
  } catch (error) { $('#challenge-error').textContent = error.message }
})

$('#announcement-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget
  const data = formObject(form)
  const id = data.id
  delete data.id
  try {
    await request(id ? `/announcements/${encodeURIComponent(id)}` : '/announcements', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) })
    closeDialog('announcement-dialog')
    toast(id ? '公告已更新' : '公告已创建')
    await refresh()
  } catch (error) { $('#announcement-error').textContent = error.message }
})

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const item = button.dataset.action.includes('challenge')
    ? state.challenges.find(value => String(value.id) === button.dataset.id)
    : state.announcements.find(value => String(value.id) === button.dataset.id)
  if (!item) return
  if (button.dataset.action === 'edit-challenge') return openChallengeEditor(item)
  if (button.dataset.action === 'edit-announcement') return openAnnouncementEditor(item)
  if (!window.confirm(`确定删除“${item.title}”？`)) return
  try {
    const endpoint = button.dataset.action === 'delete-challenge' ? 'challenges' : 'announcements'
    await request(`/${endpoint}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    toast('已删除本地配置')
    await refresh()
  } catch (error) { toast(error.message) }
})

document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeDialog('challenge-dialog'); closeDialog('announcement-dialog') } })

refresh()
