const http = require('node:http')
const { URL } = require('node:url')

const MAX_BODY_BYTES = 8192
const MAX_OUTPUT_TOKENS = 320
const ALLOWED_REVIEW_FIELDS = ['summary', 'positive_feedback', 'next_action', 'safety_note']

function jsonResponse(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS, GET',
    'access-control-allow-headers': 'content-type'
  })
  response.end(payload)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    let raw = ''
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large'), { statusCode: 413 }))
        request.destroy()
        return
      }
      raw += chunk.toString('utf8')
    })
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch (_) { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })) }
    })
    request.on('error', reject)
  })
}

function boundedNumber(value, name, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw Object.assign(new Error(`Invalid ${name}`), { statusCode: 400 })
  return Math.round(parsed * 100) / 100
}

function sanitizeWorkoutInput(input) {
  const pace = String(input.pace || '—').slice(0, 12)
  if (!/^(?:\d{1,2}'\d{2}"|—)$/.test(pace)) throw Object.assign(new Error('Invalid pace'), { statusCode: 400 })
  return {
    distance_km: boundedNumber(input.distance_km, 'distance_km', 0, 200),
    duration_minutes: boundedNumber(input.duration_minutes, 'duration_minutes', 0, 1440),
    pace,
    recent_sessions: boundedNumber(input.recent_sessions, 'recent_sessions', 0, 100),
    weekly_goal_km: boundedNumber(input.weekly_goal_km, 'weekly_goal_km', 1, 500),
    weekly_completed_km: boundedNumber(input.weekly_completed_km, 'weekly_completed_km', 0, 500)
  }
}

function parseReviewContent(content) {
  let text = String(content || '').trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last < first) throw new Error('Model response was not a JSON object')
  const parsed = JSON.parse(text.slice(first, last + 1))
  const result = {}
  ALLOWED_REVIEW_FIELDS.forEach(field => {
    const value = parsed[field]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing field: ${field}`)
    result[field] = value.trim().slice(0, 500)
  })
  return result
}

function createProxyServer(options = {}) {
  const apiKey = options.apiKey || process.env.CAMPUS_PULSE_AI_API_KEY || ''
  const model = options.model || process.env.CAMPUS_PULSE_AI_MODEL || 'gpt-5.5'
  const baseUrl = options.baseUrl || process.env.CAMPUS_PULSE_AI_BASE_URL || 'https://aigw.wenxiaobai.com/v1'
  const fetchImpl = options.fetchImpl || fetch
  const base = new URL(baseUrl)
  const isLoopback = base.hostname === '127.0.0.1' || base.hostname === 'localhost'
  if (base.protocol !== 'https:' && !(isLoopback && base.protocol === 'http:')) throw new Error('AI base URL must use HTTPS (HTTP is allowed only for localhost tests)')

  return http.createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS, GET')
    response.setHeader('access-control-allow-headers', 'content-type')
    if (request.method === 'OPTIONS') return jsonResponse(response, 204, {})
    if (request.method === 'GET' && request.url === '/health') {
      return jsonResponse(response, 200, { ok: true, providerConfigured: Boolean(apiKey), model })
    }
    if (request.method !== 'POST' || request.url !== '/api/ai/workout-review') {
      return jsonResponse(response, 404, { error: 'Not found' })
    }
    if (!apiKey) return jsonResponse(response, 503, { error: 'AI proxy is missing server configuration' })

    let workout
    try { workout = sanitizeWorkoutInput(await readJson(request)) } catch (error) {
      return jsonResponse(response, error.statusCode || 400, { error: error.statusCode === 413 ? 'Request too large' : 'Invalid workout input' })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)
    try {
      const upstream = await fetchImpl(`${base.toString().replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: '你是校园运动记录复盘助手。只给出温和、安全、非医疗的运动回顾，不诊断、不鼓励过度训练。只输出合法 JSON 对象，字段必须为 summary、positive_feedback、next_action、safety_note，且字段值为简短中文字符串。'
            },
            { role: 'user', content: `请依据以下已聚合的运动统计生成复盘：${JSON.stringify(workout)}。不要推断身份、位置或轨迹。` }
          ]
        }),
        signal: controller.signal
      })
      const body = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        console.warn(`AI provider returned HTTP ${upstream.status}`)
        return jsonResponse(response, 502, { error: 'AI provider request failed' })
      }
      const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content
      const review = parseReviewContent(content)
      return jsonResponse(response, 200, { review, model: body.model || model })
    } catch (error) {
      console.warn(error && error.name === 'AbortError' ? 'AI provider request timed out' : 'AI provider response could not be processed')
      return jsonResponse(response, 502, { error: error && error.name === 'AbortError' ? 'AI provider timed out' : 'AI provider response could not be processed' })
    } finally {
      clearTimeout(timeout)
    }
  })
}

if (require.main === module) {
  const port = Number(process.env.CAMPUS_PULSE_AI_PROXY_PORT || 8788)
  const server = createProxyServer()
  server.listen(port, '127.0.0.1', () => {
    console.log(`Campus Pulse AI dev proxy listening on http://127.0.0.1:${port}`)
    console.log(`Configured model: ${process.env.CAMPUS_PULSE_AI_MODEL || 'gpt-5.5'}`)
    console.log('The API key is kept in this process environment and is never sent to the mini program.')
  })
}

module.exports = { createProxyServer, sanitizeWorkoutInput, parseReviewContent }
