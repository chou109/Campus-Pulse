const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { URL } = require('node:url')
const { AdminStore } = require('./admin-store')

const ADMIN_ROOT = path.join(__dirname, '..', 'admin')
const MAX_BODY_BYTES = 65536
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

function allowedLocalOrigin(origin) {
  return !origin || origin === 'null' || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)
}

function setCors(response, origin) {
  if (allowedLocalOrigin(origin)) response.setHeader('access-control-allow-origin', origin || '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('cache-control', 'no-store')
}

function sendJson(response, status, body) {
  const data = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) })
  response.end(data)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = ''
    let bytes = 0
    let tooLarge = false
    request.on('data', chunk => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true
        reject(Object.assign(new Error('Request too large'), { statusCode: 413 }))
        return
      }
      data += chunk.toString('utf8')
    })
    request.on('end', () => {
      if (tooLarge) return
      try { resolve(JSON.parse(data || '{}')) } catch (_) { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })) }
    })
    request.on('error', reject)
  })
}

function staticFile(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''))
  const fullPath = path.resolve(ADMIN_ROOT, relative)
  if (!fullPath.startsWith(`${ADMIN_ROOT}${path.sep}`)) return sendJson(response, 403, { error: 'Forbidden' })
  let content
  try { content = fs.readFileSync(fullPath) } catch (_) { return sendJson(response, 404, { error: 'Not found' }) }
  setCors(response)
  response.writeHead(200, { 'content-type': TYPES[path.extname(fullPath)] || 'application/octet-stream', 'content-length': content.length })
  response.end(content)
}

function createAdminServer(options = {}) {
  const store = options.store || new AdminStore(options.storePath)
  return http.createServer(async (request, response) => {
    const origin = request.headers.origin
    if (!allowedLocalOrigin(origin)) return sendJson(response, 403, { error: 'Origin not allowed by local demo server' })
    setCors(response, origin)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type' })
      return response.end()
    }
    const url = new URL(request.url, 'http://127.0.0.1')
    const pathname = url.pathname
    if (request.method === 'GET' && pathname === '/health') {
      return sendJson(response, 200, { ok: true, mode: 'local-admin-demo', storage: 'local-json' })
    }
    if (request.method === 'GET' && pathname === '/api/public/config') {
      return sendJson(response, 200, store.publicConfig())
    }
    if (request.method === 'GET' && pathname === '/api/admin/bootstrap') {
      return sendJson(response, 200, { overview: store.overview(), challenges: store.snapshot().challenges, announcements: store.snapshot().announcements, audit: store.snapshot().audit })
    }
    if (request.method === 'GET' && pathname === '/api/admin/challenges') return sendJson(response, 200, { challenges: store.snapshot().challenges })
    if (request.method === 'POST' && pathname === '/api/admin/challenges') {
      try { return sendJson(response, 201, { challenge: store.saveChallenge(await readJson(request)) }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: error.statusCode ? 'Invalid challenge data' : 'Could not save challenge' }) }
    }
    const challengeMatch = pathname.match(/^\/api\/admin\/challenges\/([^/]+)$/)
    if (challengeMatch && request.method === 'PUT') {
      try { return sendJson(response, 200, { challenge: store.saveChallenge(await readJson(request), decodeURIComponent(challengeMatch[1])) }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: error.statusCode === 404 ? 'Challenge not found' : 'Invalid challenge data' }) }
    }
    if (challengeMatch && request.method === 'DELETE') {
      try { store.deleteChallenge(decodeURIComponent(challengeMatch[1])); return sendJson(response, 200, { ok: true }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: 'Challenge not found' }) }
    }
    if (request.method === 'GET' && pathname === '/api/admin/announcements') return sendJson(response, 200, { announcements: store.snapshot().announcements })
    if (request.method === 'POST' && pathname === '/api/admin/announcements') {
      try { return sendJson(response, 201, { announcement: store.saveAnnouncement(await readJson(request)) }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: 'Invalid announcement data' }) }
    }
    const announcementMatch = pathname.match(/^\/api\/admin\/announcements\/([^/]+)$/)
    if (announcementMatch && request.method === 'PUT') {
      try { return sendJson(response, 200, { announcement: store.saveAnnouncement(await readJson(request), decodeURIComponent(announcementMatch[1])) }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: error.statusCode === 404 ? 'Announcement not found' : 'Invalid announcement data' }) }
    }
    if (announcementMatch && request.method === 'DELETE') {
      try { store.deleteAnnouncement(decodeURIComponent(announcementMatch[1])); return sendJson(response, 200, { ok: true }) }
      catch (error) { return sendJson(response, error.statusCode || 400, { error: 'Announcement not found' }) }
    }
    if (request.method === 'GET' && (pathname === '/' || pathname === '/admin.js' || pathname === '/admin.css')) return staticFile(response, pathname)
    return sendJson(response, 404, { error: 'Not found' })
  })
}

if (require.main === module) {
  const port = Number(process.env.CAMPUS_PULSE_ADMIN_PORT || 8790)
  const server = createAdminServer()
  server.listen(port, '127.0.0.1', () => {
    console.log(`Campus Pulse local Web Admin: http://127.0.0.1:${port}/`)
    console.log('Loopback only. This demo has no remote authentication and must not be exposed to LAN or the internet.')
  })
}

module.exports = { createAdminServer }
