const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { createProxyServer } = require('../dev/ai-proxy')

const validWorkout = {
  distance_km: 3.1,
  duration_minutes: 27,
  pace: "8'42\"",
  recent_sessions: 2,
  weekly_goal_km: 10,
  weekly_completed_km: 6.5
}
const upstreamBody = {
  choices: [{ message: { content: JSON.stringify({
    summary: '完成一段运动。',
    positive_feedback: '保持适合自己的节奏。',
    next_action: '充分休息。',
    safety_note: '不适时停止运动。'
  }) } }]
}

async function createTestProxy(t, options = {}) {
  const proxy = createProxyServer({
    apiKey: 'synthetic-test-key',
    baseUrl: 'https://example.invalid/v1',
    fetchImpl: async () => ({ ok: true, json: async () => upstreamBody }),
    ...options
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    proxy.closeAllConnections()
    return new Promise(resolve => proxy.close(resolve))
  })
  return `http://127.0.0.1:${proxy.address().port}`
}

function postWithHost(url, host) {
  const target = new URL(`${url}/api/ai/workout-review`)
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: { host, 'content-type': 'application/json' }
    }, response => {
      response.resume()
      response.on('end', () => resolve({ status: response.statusCode }))
    })
    request.on('error', reject)
    request.end(JSON.stringify(validWorkout))
  })
}
function post(url, { body = validWorkout, origin, host } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (origin !== undefined) headers.origin = origin
  if (host !== undefined) headers.host = host
  return fetch(`${url}/api/ai/workout-review`, { method: 'POST', headers, body: JSON.stringify(body) })
}

test('AI proxy allows a local Origin and returns exact CORS headers', async t => {
  const url = await createTestProxy(t)
  const origin = 'http://localhost:3000'
  const response = await post(url, { origin })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  assert.equal(response.headers.get('vary'), 'Origin')
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
})

test('AI proxy remains compatible with local requests without an Origin header', async t => {
  const url = await createTestProxy(t)
  const response = await post(url)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('AI proxy accepts the localhost Host alias at its actual local port', async t => {
  const url = await createTestProxy(t)
  const port = new URL(url).port
  const response = await postWithHost(url, `localhost:${port}`)
  assert.equal(response.status, 200)
})
test('AI proxy rejects external and malformed Origins without calling upstream', async t => {
  let upstreamCalls = 0
  const url = await createTestProxy(t, { fetchImpl: async () => { upstreamCalls++; return { ok: true, json: async () => upstreamBody } } })
  for (const origin of ['https://attacker.example', 'null', 'http://localhost.evil', 'file://localhost/path', 'http://127.0.0.1:3000/path']) {
    const response = await post(url, { origin })
    assert.equal(response.status, 403, origin)
    assert.equal(response.headers.get('access-control-allow-origin'), null, origin)
  }
  assert.equal(upstreamCalls, 0)
})

test('AI proxy rejects forged Host headers before handling requests', async t => {
  let upstreamCalls = 0
  const url = await createTestProxy(t, { fetchImpl: async () => { upstreamCalls++; return { ok: true, json: async () => upstreamBody } } })
  for (const host of ['attacker.example', 'localhost.evil', '127.0.0.1:1']) {
    const response = await postWithHost(url, host)
    assert.equal(response.status, 403, host)
  }
  assert.equal(upstreamCalls, 0)
})

test('AI proxy preflight does not call upstream and rejects external Origins', async t => {
  let upstreamCalls = 0
  const url = await createTestProxy(t, { fetchImpl: async () => { upstreamCalls++; return { ok: true, json: async () => upstreamBody } } })
  const allowed = await fetch(`${url}/api/ai/workout-review`, { method: 'OPTIONS', headers: { origin: 'https://127.0.0.1:4444', 'access-control-request-method': 'POST' } })
  assert.equal(allowed.status, 204)
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://127.0.0.1:4444')
  const denied = await fetch(`${url}/api/ai/workout-review`, { method: 'OPTIONS', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST' } })
  assert.equal(denied.status, 403)
  assert.equal(upstreamCalls, 0)
})

test('AI proxy health and rejected requests do not consume model quota', async t => {
  let upstreamCalls = 0
  const url = await createTestProxy(t, { fetchImpl: async () => { upstreamCalls++; return { ok: true, json: async () => upstreamBody } } })
  assert.equal((await fetch(`${url}/health`)).status, 200)
  assert.equal((await fetch(`${url}/api/ai/workout-review`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } })).status, 204)
  assert.equal((await post(url, { origin: 'https://attacker.example' })).status, 403)
  assert.equal((await post(url, { body: {} })).status, 400)
  for (let index = 0; index < 5; index++) assert.equal((await post(url)).status, 200)
  assert.equal(upstreamCalls, 5)
  assert.equal((await post(url)).status, 429)
})
test('AI proxy permits five model requests per rolling minute and then returns 429', async t => {
  let now = 100000
  t.mock.method(Date, 'now', () => now)
  let upstreamCalls = 0
  const url = await createTestProxy(t, { fetchImpl: async () => { upstreamCalls++; return { ok: true, json: async () => upstreamBody } } })
  for (let index = 0; index < 5; index++) assert.equal((await post(url)).status, 200)
  const limited = await post(url)
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
  assert.equal(upstreamCalls, 5)
  now += 60000
  assert.equal((await post(url)).status, 200)
  assert.equal(upstreamCalls, 6)
})

test('AI proxy allows only one in-flight model call and releases the slot', async t => {
  let upstreamCalls = 0
  let notifyUpstream
  let releaseUpstream
  const upstreamStarted = new Promise(resolve => { notifyUpstream = resolve })
  const waitForRelease = new Promise(resolve => { releaseUpstream = resolve })
  const url = await createTestProxy(t, {
    fetchImpl: async () => {
      upstreamCalls++
      notifyUpstream()
      await waitForRelease
      return { ok: true, json: async () => upstreamBody }
    }
  })
  const first = post(url)
  await upstreamStarted
  const second = await post(url)
  assert.equal(second.status, 429)
  assert.equal(second.headers.get('retry-after'), '1')
  assert.equal(upstreamCalls, 1)
  releaseUpstream()
  assert.equal((await first).status, 200)
  assert.equal((await post(url)).status, 200)
  assert.equal(upstreamCalls, 2)
})

test('AI proxy releases concurrency slot when the upstream fails', async t => {
  let upstreamCalls = 0
  const url = await createTestProxy(t, {
    fetchImpl: async () => {
      upstreamCalls++
      if (upstreamCalls === 1) throw new Error('synthetic upstream failure')
      return { ok: true, json: async () => upstreamBody }
    }
  })
  assert.equal((await post(url)).status, 502)
  assert.equal((await post(url)).status, 200)
  assert.equal(upstreamCalls, 2)
})




