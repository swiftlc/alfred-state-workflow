import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import mysql from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { WebSocketServer } from 'ws'
import { getCookieFromCache, getSSOCookies } from './get-sso-cookies.js'

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 配置 ─────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 8080
const CACHE_TTL = 60 * 1000 // 1 分钟

const OCTO_BASE = 'https://octo.mws-test.sankuai.com/api/octo/v2/thriftcheck'

/** MySQL (ShardingSphere-Proxy) 连接配置（来自 proxy-server） */
const MYSQL_DSN = `mysql://${process.env.MYSQL_USER || 'root'}:${process.env.MYSQL_PASSWORD || 'root'}@${process.env.MYSQL_HOST || '127.0.0.1'}:${Number(process.env.MYSQL_PORT) || 3307}/${process.env.MYSQL_DATABASE || 'sharding_db'}?connectionLimit=10&waitForConnections=true&queueLimit=0&timezone=${process.env.MYSQL_TIMEZONE || 'Z'}`

/** MySQL (业务库) 连接配置（来自 index.js） */
const BIZ_DB_CONFIG = {
  host: process.env.BIZ_DB_HOST || '10.233.168.8',
  port: process.env.BIZ_DB_PORT || 5002,
  user: process.env.BIZ_DB_USER || 'rds_gl_ep',
  password: process.env.BIZ_DB_PASSWORD || '@0c)$8d#f$WE@Z',
  database: process.env.BIZ_DB_NAME || 'test_emproductdb',
  timezone: '+00:00',
  ssl: false,
}

/** 鉴权失败时响应体中可能包含的特征字符串 */
const AUTH_FAIL_PATTERNS = [
  'auth fail',
  'SSO鉴权错误',
  '"status":401',
  '"redirect":"https://ssosv.sankuai.com/sson/login"',
]

/** 鉴权失败的状态码 */
const AUTH_FAIL_STATUS_CODES = new Set([401, 403, 302])

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 数据库连接池 ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/** ShardingSphere-Proxy 连接池（懒初始化） */
let mysqlPool = null

function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool(MYSQL_DSN)
    console.log(`[MySQL] 连接池已创建 ${MYSQL_DSN}`)
  }
  return mysqlPool
}

/** 业务库连接池（rules / dictionaries） */
const bizPool = mysql.createPool({ ...BIZ_DB_CONFIG, waitForConnections: true, connectionLimit: 10 })

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HTTP 客户端（SSO 代理用） ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const globalJar = new CookieJar()

const client = wrapper(
  axios.create({
    jar: globalJar,
    withCredentials: true,
    maxRedirects: 0,
    timeout: 30000,
    validateStatus: (status) =>
      (status >= 200 && status < 300) || status === 301 || status === 302 || status === 401,
    responseType: 'arraybuffer',
  })
)

// ─── Octo-Invoke 缓存 ─────────────────────────────────────────────────────────

/** @type {Map<string, {targetNode: object, finalServiceName: string, finalMethod: string, timestamp: number}>} */
const octoInvokeCache = new Map()

function evictExpiredCache() {
  const now = Date.now()
  for (const [key, item] of octoInvokeCache) {
    if (now - item.timestamp >= CACHE_TTL) {
      octoInvokeCache.delete(key)
      console.log(`[Cache] 清理过期缓存: ${key}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 内存日志存储（来自 index.js，最大 100 条）────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_LOGS = 100
const logs = []
let logIdCounter = 1

function addLog(entry) {
  entry.id = logIdCounter++
  logs.push(entry)
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS)
  }
  return entry
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 统一响应格式（来自 index.js）─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const ok = (data) => ({ code: 0, msg: 'success', data })
const err = (code, msg) => ({ code, msg, data: null })

// ─── Rules 内存缓存（10分钟）────────────────────────────────────────────────

const RULES_CACHE_TTL = 10 * 60 * 1000
let rulesCache = null
let rulesCacheAt = 0

function getRulesCache() {
  if (rulesCache && Date.now() - rulesCacheAt < RULES_CACHE_TTL) return rulesCache
  return null
}
function setRulesCache(data) {
  rulesCache = data
  rulesCacheAt = Date.now()
}
function invalidateRulesCache() {
  rulesCache = null
}

// ─── 工具函数（来自 index.js）────────────────────────────────────────────────

function rowToRule(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: !!row.active,
    match: { method: row.match_method, url: row.match_url },
    request: { active: !!row.request_active, script: row.request_script },
    response: { active: !!row.response_active, script: row.response_script },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToDict(row) {
  return {
    id: row.id,
    categoryKey: row.category_key,
    title: row.title,
    description: row.description,
    value: row.value,
    metadata: row.metadata,
    sortOrder: row.sortOrder,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 代理工具函数（来自 proxy-server）────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 删除 hop-by-hop 头，避免转发时出现冲突。
 */
function stripHopByHopHeaders(headers) {
  const result = { ...headers }
  delete result['transfer-encoding']
  delete result['content-length']
  return result
}

/**
 * 判断响应是否鉴权失败。
 */
function isAuthFailed(rsp) {
  if (AUTH_FAIL_STATUS_CODES.has(rsp.status)) return true
  const text = Buffer.isBuffer(rsp.data) ? rsp.data.toString('utf8') : String(rsp.data ?? '')
  return AUTH_FAIL_PATTERNS.some((pattern) => text.includes(pattern))
}

/**
 * 发起带 SSO Cookie 的请求，自动在 Cookie 失效时刷新。
 */
export async function doRequest(targetUrl, cfg) {
  const host = targetUrl.host
  console.log(`[doRequest] → ${cfg.method} ${targetUrl.href}`)

  const cachedCookie = getCookieFromCache(host)
  if (cachedCookie) {
    cfg.headers['cookie'] = cachedCookie
    const rsp = await client(cfg)
    console.log(`[doRequest] 响应状态: ${rsp.status}`)
    if (!isAuthFailed(rsp)) {
      return rsp
    }
    console.log('[doRequest] 缓存 Cookie 已失效，重新获取...')
  }

  cfg.headers['cookie'] = await fetchFreshCookie(host)
  return client(cfg)
}

/**
 * 通过 Puppeteer 获取最新 SSO Cookie（优先无头模式）。
 */
async function fetchFreshCookie(host) {
  console.log(`[SSO] 正在获取 ${host} 的新 Cookie...`)
  try {
    const cookie = await getSSOCookies(host, true, 3000)
    console.log('[SSO] 无头模式获取成功')
    return cookie
  } catch {
    console.log('[SSO] 无头模式失败，切换到有头模式...')
    const cookie = await getSSOCookies(host, false, 30000)
    console.log('[SSO] 有头模式获取成功')
    return cookie
  }
}

/**
 * 从请求头 `x-proxy-dest` 解析目标 URL。
 */
function extractTargetUrl(req) {
  let targetHost = req.headers['x-proxy-dest']
  if (!targetHost) return null

  if (!targetHost.startsWith('http://') && !targetHost.startsWith('https://')) {
    targetHost = 'http://' + targetHost
  }

  try {
    return new URL(targetHost)
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── WebSocket 客户端管理（来自 index.js）────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const wsClients = new Set()

function wsBroadcast(message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message)
  for (const ws of wsClients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(data)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Hono 应用 ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const app = new Hono()

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Origin', 'Content-Type', 'Accept', 'Authorization', 'X-Requested-With', 'x-proxy-dest'],
  })
)

app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`)
})

// ─── Rules 路由 ───────────────────────────────────────────────────────────────

const rules = new Hono()

rules.get('/', async (c) => {
  const forRun = c.req.query('for_run') !== undefined

  const cached = getRulesCache()
  if (cached) {
    const result = forRun ? cached.filter((r) => r.active) : cached
    return c.json(ok(result))
  }

  const [rows] = await bizPool.execute('SELECT * FROM rules ORDER BY id ASC')
  const all = rows.map(rowToRule)
  setRulesCache(all)

  return c.json(ok(forRun ? all.filter((r) => r.active) : all))
})

rules.post('/', async (c) => {
  const body = await c.req.json()
  const { name, description = '', active = false, match = {}, request = {}, response = {} } = body

  if (!name) return c.json(err(400, 'name is required'))

  const [exist] = await bizPool.execute('SELECT id FROM rules WHERE name = ?', [name])
  if (exist.length > 0) return c.json(err(400, 'Rule name already exists'))

  const matchMethod = match.method || 'ALL'
  const matchUrl = match.url || ''
  const reqActive = request.active ? 1 : 0
  const reqScript = request.script || ''
  const resActive = response.active ? 1 : 0
  const resScript = response.script || ''

  const [result] = await bizPool.execute(
    `INSERT INTO rules (name, description, active, match_method, match_url, request_active, request_script, response_active, response_script)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, description, active ? 1 : 0, matchMethod, matchUrl, reqActive, reqScript, resActive, resScript]
  )

  const [rows] = await bizPool.execute('SELECT * FROM rules WHERE id = ?', [result.insertId])
  invalidateRulesCache()
  return c.json(ok(rowToRule(rows[0])))
})

rules.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, description, active, match = {}, request = {}, response = {} } = body

  const [existing] = await bizPool.execute('SELECT * FROM rules WHERE id = ?', [id])
  if (existing.length === 0) return c.json(err(404, 'Rule not found'))

  const rule = existing[0]

  if (name && name !== rule.name) {
    const [dup] = await bizPool.execute('SELECT id FROM rules WHERE name = ? AND id != ?', [name, id])
    if (dup.length > 0) return c.json(err(400, 'Rule name already exists'))
  }

  await bizPool.execute(
    `UPDATE rules SET
      name = ?, description = ?, active = ?,
      match_method = ?, match_url = ?,
      request_active = ?, request_script = ?,
      response_active = ?, response_script = ?
     WHERE id = ?`,
    [
      name ?? rule.name,
      description ?? rule.description,
      active !== undefined ? (active ? 1 : 0) : rule.active,
      match.method ?? rule.match_method,
      match.url ?? rule.match_url,
      request.active !== undefined ? (request.active ? 1 : 0) : rule.request_active,
      request.script ?? rule.request_script,
      response.active !== undefined ? (response.active ? 1 : 0) : rule.response_active,
      response.script ?? rule.response_script,
      id,
    ]
  )

  const [rows] = await bizPool.execute('SELECT * FROM rules WHERE id = ?', [id])
  invalidateRulesCache()
  return c.json(ok(rowToRule(rows[0])))
})

rules.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await bizPool.execute('DELETE FROM rules WHERE id = ?', [id])
  invalidateRulesCache()
  return c.json(ok(''))
})

app.route('/rules', rules)

// ─── Dictionaries 路由 ────────────────────────────────────────────────────────

const dicts = new Hono()

dicts.get('/', async (c) => {
  const categoryKey = c.req.query('categoryKey')
  const page = parseInt(c.req.query('page') || '0')
  const pageSize = parseInt(c.req.query('pageSize') || '0')

  if (!categoryKey) return c.json(err(400, 'categoryKey is required'))

  if (page > 0 && pageSize > 0) {
    const offset = (page - 1) * pageSize
    const [countRows] = await bizPool.execute(
      'SELECT COUNT(*) as total FROM dictionaries WHERE category_key = ?',
      [categoryKey]
    )
    const total = countRows[0].total
    const [rows] = await bizPool.execute(
      'SELECT * FROM dictionaries WHERE category_key = ? ORDER BY sortOrder ASC, created_at ASC LIMIT ? OFFSET ?',
      [categoryKey, pageSize, offset]
    )
    return c.json(ok({ list: rows.map(rowToDict), total, page, pageSize }))
  }

  const [rows] = await bizPool.execute(
    'SELECT * FROM dictionaries WHERE category_key = ? ORDER BY sortOrder ASC, created_at ASC',
    [categoryKey]
  )
  return c.json(ok(rows.map(rowToDict)))
})

dicts.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [rows] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [id])
  if (rows.length === 0) return c.json(err(404, 'Dictionary not found'))
  return c.json(ok(rowToDict(rows[0])))
})

dicts.post('/', async (c) => {
  const body = await c.req.json()
  const { categoryKey, title, description = '', value = '', metadata = null, sortOrder = 0 } = body

  if (!categoryKey || !title) return c.json(err(400, 'categoryKey and title are required'))

  const id = uuidv4()
  await bizPool.execute(
    'INSERT INTO dictionaries (id, category_key, title, description, value, metadata, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, categoryKey, title, description, value, metadata ? JSON.stringify(metadata) : null, sortOrder]
  )

  const [rows] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [id])
  return c.json(ok(rowToDict(rows[0])))
})

dicts.put('/', async (c) => {
  const body = await c.req.json()
  const { categoryKey, title, description, value, metadata, sortOrder } = body

  if (!categoryKey || !title) return c.json(err(400, 'categoryKey and title are required'))

  const [existing] = await bizPool.execute(
    'SELECT * FROM dictionaries WHERE category_key = ? AND title = ?',
    [categoryKey, title]
  )

  if (existing.length === 0) {
    const id = uuidv4()
    await bizPool.execute(
      'INSERT INTO dictionaries (id, category_key, title, description, value, metadata, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, categoryKey, title, description || '', value || '', metadata ? JSON.stringify(metadata) : null, sortOrder || 0]
    )
    const [rows] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [id])
    return c.json(ok(rowToDict(rows[0])))
  }

  const dict = existing[0]
  await bizPool.execute(
    `UPDATE dictionaries SET
      description = ?, value = ?, metadata = ?, sortOrder = ?
     WHERE id = ?`,
    [
      description || dict.description,
      value || dict.value,
      metadata ? JSON.stringify(metadata) : dict.metadata,
      sortOrder || dict.sortOrder,
      dict.id,
    ]
  )
  const [rows] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [dict.id])
  return c.json(ok(rowToDict(rows[0])))
})

dicts.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { categoryKey, title, description, value, metadata, sortOrder } = body

  const [existing] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [id])
  if (existing.length === 0) return c.json(err(404, 'Dictionary not found'))

  const dict = existing[0]
  await bizPool.execute(
    `UPDATE dictionaries SET
      category_key = ?, title = ?, description = ?, value = ?, metadata = ?, sortOrder = ?
     WHERE id = ?`,
    [
      categoryKey || dict.category_key,
      title || dict.title,
      description !== undefined ? description : dict.description,
      value !== undefined ? value : dict.value,
      metadata ? JSON.stringify(metadata) : dict.metadata,
      sortOrder !== undefined ? sortOrder : dict.sortOrder,
      id,
    ]
  )
  const [rows] = await bizPool.execute('SELECT * FROM dictionaries WHERE id = ?', [id])
  return c.json(ok(rowToDict(rows[0])))
})

dicts.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await bizPool.execute('DELETE FROM dictionaries WHERE id = ?', [id])
  return c.json(ok(''))
})

dicts.get('/category/:categoryKey', async (c) => {
  const categoryKey = c.req.param('categoryKey')
  const [rows] = await bizPool.execute(
    'SELECT * FROM dictionaries WHERE category_key = ? ORDER BY sortOrder ASC, created_at ASC',
    [categoryKey]
  )
  return c.json(ok(rows.map(rowToDict)))
})

dicts.delete('/category/:categoryKey', async (c) => {
  const categoryKey = c.req.param('categoryKey')
  await bizPool.execute('DELETE FROM dictionaries WHERE category_key = ?', [categoryKey])
  return c.json(ok(''))
})

dicts.put('/category/:categoryKey', async (c) => {
  const categoryKey = c.req.param('categoryKey')
  const body = await c.req.json()

  if (!Array.isArray(body)) return c.json(err(400, 'Request body must be an array'))

  const conn = await bizPool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('DELETE FROM dictionaries WHERE category_key = ?', [categoryKey])
    for (const item of body) {
      const id = item.id || uuidv4()
      await conn.execute(
        'INSERT INTO dictionaries (id, category_key, title, description, value, metadata, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, categoryKey, item.title || '', item.description || '', item.value || '', item.metadata ? JSON.stringify(item.metadata) : null, item.sortOrder || 0]
      )
    }
    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }

  const [rows] = await bizPool.execute(
    'SELECT * FROM dictionaries WHERE category_key = ? ORDER BY sortOrder ASC',
    [categoryKey]
  )
  return c.json(ok(rows.map(rowToDict)))
})

app.route('/dictionaries', dicts)

// ─── Logs 路由（内存存储）────────────────────────────────────────────────────

const logsRoute = new Hono()

logsRoute.get('/', (c) => {
  const limit = parseInt(c.req.query('limit') || '100')
  const result = logs.slice(-Math.min(limit, MAX_LOGS))
  return c.json(ok(result))
})

logsRoute.post('/', async (c) => {
  const body = await c.req.json()
  const entry = {
    timestamp: body.timestamp || Date.now(),
    method: body.method || '',
    url: body.url || '',
    ruleName: body.ruleName || '',
    type: body.type || '',
    originalReq: body.originalReq ?? null,
    modifiedReq: body.modifiedReq ?? null,
    originalRes: body.originalRes ?? null,
    modifiedRes: body.modifiedRes ?? null,
  }
  const saved = addLog(entry)
  wsBroadcast({ type: 'log', data: saved })
  return c.json(ok(saved))
})

logsRoute.delete('/', (c) => {
  logs.splice(0, logs.length)
  logIdCounter = 1
  return c.json(ok(''))
})

app.route('/logs', logsRoute)

// ─── /api/octo-invoke ────────────────────────────────────────────────────────

app.post('/api/octo-invoke', async (c) => {
  evictExpiredCache()

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, msg: 'Invalid JSON body' }, 400)
  }

  const {
    appkey,
    env = 'test',
    swimlane = '',
    methodKeyword,
    serviceName,
    method,
    params = [],
  } = body

  if (!appkey) {
    return c.json({ success: false, msg: 'appkey is required' }, 400)
  }

  try {
    const cacheKey = `${appkey}_${env}_${swimlane}_${methodKeyword}`
    const cached = methodKeyword ? octoInvokeCache.get(cacheKey) : null
    const isCacheValid = cached && Date.now() - cached.timestamp < CACHE_TTL

    let targetNode, finalServiceName, finalMethod

    if (isCacheValid) {
      console.log(`[Octo-Invoke] 命中缓存: ${cacheKey}`)
      ;({ targetNode, finalServiceName, finalMethod } = cached)
    } else {
      console.log(`[Octo-Invoke] 1. 查询节点 appkey=${appkey} env=${env}`)
      targetNode = await resolveTargetNode(appkey, env, swimlane)

      if (serviceName && method) {
        finalServiceName = serviceName
        finalMethod = method
        console.log(`[Octo-Invoke] 2. 使用指定方法: ${finalServiceName}.${finalMethod}`)
      } else {
        if (!methodKeyword) {
          return c.json(
            { success: false, msg: 'Either serviceName+method or methodKeyword is required' },
            400
          )
        }
        console.log(`[Octo-Invoke] 2. 按关键词查找方法: ${methodKeyword}`)
        ;({ finalServiceName, finalMethod } = await resolveMethodByKeyword(appkey, targetNode, methodKeyword))
      }

      if (methodKeyword) {
        octoInvokeCache.set(cacheKey, {
          targetNode,
          finalServiceName,
          finalMethod,
          timestamp: Date.now(),
        })
      }
    }

    console.log(`[Octo-Invoke] 3. 调用 ${finalServiceName}.${finalMethod}`)

    const invokePayload = {
      params: serializeParams(params),
      oneStepContext: {},
      foreverContext: {},
      env,
      appkey,
      host: targetNode.ip,
      node: targetNode.swimlane
        ? `${targetNode.name}|${targetNode.swimlane}(${targetNode.port})`
        : `${targetNode.name}(${targetNode.port})`,
      isTest: false,
      version: targetNode.version || 'mtthrift-v2.11.2',
      grouptags: '',
      swimlane: targetNode.swimlane || '',
      cell: targetNode.cell || '',
      port: targetNode.port,
      serviceName: finalServiceName,
      method: finalMethod,
      invokeType: 'OLD',
    }

    const invokeUrl = new URL(`${OCTO_BASE}/httpInvoke`)
    const invokeRsp = await doRequest(invokeUrl, {
      method: 'POST',
      url: invokeUrl.href,
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      data: JSON.stringify(invokePayload),
    })

    console.log(`[Octo-Invoke] 调用完成，状态: ${invokeRsp.status}`)

    // 直接透传响应体
    return new Response(invokeRsp.data, {
      status: invokeRsp.status,
      headers: stripHopByHopHeaders(invokeRsp.headers),
    })
  } catch (error) {
    console.error('[Octo-Invoke] 错误:', error)
    const status = error.status || 500
    const errBody = { success: false, msg: error.message }
    if (error.matchedMethods) errBody.matchedMethods = error.matchedMethods
    return c.json(errBody, status)
  }
})

// ─── /api/sql ────────────────────────────────────────────────────────────────

app.post('/api/sql', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { sql } = body
  if (!sql || typeof sql !== 'string') {
    return c.json({ error: 'sql field is required' }, 400)
  }

  const sqlStr = sql.trim()
  const pool = getMysqlPool()

  try {
    let result
    const upperSql = sqlStr.toUpperCase()

    if (upperSql.includes('SELECT')) {
      console.log('[SQL] 使用 query 执行查询')
      ;[result] = await pool.query(sqlStr)
    } else {
      console.log('[SQL] 使用 execute 执行更新')
      ;[result] = await pool.execute(sqlStr)
    }

    console.log(`[SQL] 结果: ${JSON.stringify(result)}`)
    return c.json({ code: 0, message: 'success', data: result })
  } catch (error) {
    console.error('[SQL] 执行出错:', error.message)
    return c.json({ error: error.message }, 500)
  }
})

// ─── 通配代理路由（兜底，必须放最后）────────────────────────────────────────

app.all('*', async (c) => {
  const targetUrl = extractTargetUrl({ headers: Object.fromEntries(c.req.raw.headers) })
  if (!targetUrl) {
    return c.text('Bad Request: Missing x-proxy-dest header', 400)
  }

  const reqUrl = new URL(c.req.url)
  for (const [key, value] of reqUrl.searchParams) {
    targetUrl.searchParams.append(key, value)
  }
  if (reqUrl.pathname !== '/') {
    targetUrl.pathname += reqUrl.pathname
  }

  console.log(`[Proxy] 转发 → ${targetUrl.href}`)

  const bodyBuffer = await c.req.raw.arrayBuffer()
  const headers = Object.fromEntries(c.req.raw.headers)
  delete headers['host']
  delete headers['connection']
  delete headers['x-proxy-dest']
  delete headers['origin']

  const config = {
    method: c.req.method,
    url: targetUrl.href,
    headers,
    data: bodyBuffer.byteLength > 0 ? Buffer.from(bodyBuffer) : undefined,
  }

  const response = await doRequest(targetUrl, config)
  return new Response(response.data, {
    status: response.status,
    headers: stripHopByHopHeaders(response.headers),
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Octo 辅助函数（来自 proxy-server）───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

async function resolveTargetNode(appkey, env, swimlane) {
  const nodesUrl = new URL(`${OCTO_BASE}/serverNodes?appkey=${appkey}&env=${env}`)
  const nodesRsp = await doRequest(nodesUrl, {
    method: 'GET',
    url: nodesUrl.href,
    headers: { 'Content-Type': 'application/json' },
  })

  const nodesData = JSON.parse(nodesRsp.data.toString())
  if (!nodesData.success || !nodesData.data?.length) {
    throw Object.assign(new Error('No nodes found for appkey'), { status: 400 })
  }

  const matchedNodes = nodesData.data.filter((n) =>
    swimlane ? n.swimlane === swimlane : !n.swimlane
  )

  if (!matchedNodes.length) {
    throw Object.assign(
      new Error(`No nodes found matching swimlane: ${swimlane || '(none)'}`),
      { status: 400 }
    )
  }

  const node = matchedNodes[0]
  console.log(`[Octo-Invoke] 选中节点: ${node.ip}:${node.port} (${node.name})`)
  return node
}

async function resolveMethodByKeyword(appkey, targetNode, methodKeyword) {
  const methodsUrl = new URL(
    `${OCTO_BASE}/serviceMethods?appkey=${appkey}&host=${targetNode.ip}&port=${targetNode.port}&isRequestPort=false`
  )
  const methodsRsp = await doRequest(methodsUrl, {
    method: 'GET',
    url: methodsUrl.href,
    headers: { 'Content-Type': 'application/json' },
  })

  const methodsData = JSON.parse(methodsRsp.data.toString())
  if (!methodsData.success || !methodsData.data) {
    throw Object.assign(new Error('Failed to query service methods'), { status: 400 })
  }

  const matchedMethods = []
  for (const [srvName, methodsObj] of Object.entries(methodsData.data)) {
    for (const mName of Object.keys(methodsObj)) {
      if (`${srvName}#${mName}`.includes(methodKeyword)) {
        matchedMethods.push({ srvName, mName, fullMethodName: `${srvName}#${mName}` })
      }
    }
  }

  if (matchedMethods.length === 0) {
    throw Object.assign(
      new Error(`Method matching keyword '${methodKeyword}' not found`),
      { status: 400 }
    )
  }

  if (matchedMethods.length > 1) {
    throw Object.assign(
      new Error(`Multiple methods matched for keyword '${methodKeyword}'. Please be more specific.`),
      { status: 400, matchedMethods: matchedMethods.map((m) => m.fullMethodName) }
    )
  }

  const { srvName, mName } = matchedMethods[0]
  console.log(`[Octo-Invoke] 匹配方法: ${srvName}#${mName}`)
  return { finalServiceName: srvName, finalMethod: mName }
}

function serializeParams(params) {
  if (typeof params === 'string') return params
  if (Array.isArray(params)) {
    return JSON.stringify(params.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))))
  }
  return JSON.stringify([JSON.stringify(params)])
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 启动 ─────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const server = serve({ fetch: app.fetch, port: Number(PORT) }, (info) => {
  console.log(`服务已启动，监听端口 ${info.port}`)
  console.log(`  业务库: ${BIZ_DB_CONFIG.host}:${BIZ_DB_CONFIG.port}/${BIZ_DB_CONFIG.database}`)
  console.log(`  分片库: ${MYSQL_DSN.split('@')[1]?.split('?')[0] || MYSQL_DSN}`)
})

// ─── WebSocket 服务（挂载在同一端口 /ws 路径）────────────────────────────────

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  wsClients.add(ws)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  console.log(`[WS] connected  ip=${ip} clients=${wsClients.size}`)
  ws.on('message', (data) => {
    console.log(`[WS] message    ${data.toString().slice(0, 100)}`)
  })
  ws.on('close', (code, reason) => {
    wsClients.delete(ws)
    console.log(`[WS] closed     code=${code} reason=${reason || '-'} clients=${wsClients.size}`)
  })
  ws.on('error', (e) => {
    wsClients.delete(ws)
    console.log(`[WS] error      ${e.message}`)
  })
})

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})
