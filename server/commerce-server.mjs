import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 8787)
const origin = (process.env.APP_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, '')
const dataDir = process.env.DATA_DIR || path.join(root, 'data')
const assetsDir = path.join(dataDir, 'assets')
const dbFile = path.join(dataDir, 'commerce.json')
const distDir = path.join(root, 'web', 'dist')
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me')
const priceCents = Number(process.env.RESUME_PRICE_CENTS || 300)
if (!sessionSecret) throw new Error('SESSION_SECRET is required in production')
fs.mkdirSync(assetsDir, { recursive: true })

const emptyDb = () => ({ users: [], projects: [], orders: [], licenses: [] })
function db() { try { return { ...emptyDb(), ...JSON.parse(fs.readFileSync(dbFile, 'utf8')) } } catch { return emptyDb() } }
function save(value) { fs.writeFileSync(`${dbFile}.tmp`, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(`${dbFile}.tmp`, dbFile) }
function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}` }
function json(res, status, data, headers = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)) }
function text(res, status, value, type = 'text/plain; charset=utf-8') { res.writeHead(status, { 'content-type': type }); res.end(value) }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter((item) => item.length === 2)) }
function sign(value) { return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url') }
function tokenFor(user) { const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url'); return `${payload}.${sign(payload)}` }
function session(req, store) { const token = parseCookies(req).sen_session; if (!token) return null; const [payload, signature] = token.split('.'); if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null; try { const body = JSON.parse(Buffer.from(payload, 'base64url').toString()); return body.exp > Date.now() ? store.users.find((user) => user.id === body.sub) || null : null } catch { return null } }
function cookie(value = '', maxAge = 0) { return `sen_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`))) }
async function validPassword(password, saved) { const [salt, expected] = String(saved || '').split(':'); if (!salt || !expected) return false; const current = await passwordHash(password, salt); return crypto.timingSafeEqual(Buffer.from(current), Buffer.from(saved)) }
async function body(req, limit = 52 * 1024 * 1024) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request body exceeds 50 MB'); chunks.push(chunk) } return Buffer.concat(chunks) }
async function requestJson(req) { const raw = await body(req, 512 * 1024); try { return JSON.parse(raw.toString('utf8') || '{}') } catch { throw new Error('Invalid JSON body') } }
function cleanEmail(value) { const email = String(value || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 160) throw new Error('请输入有效邮箱'); return email }
function requireUser(req, res, store) { const user = session(req, store); if (!user) { json(res, 401, { ok: false, error: '请先登录' }); return null } return user }
function licenseFor(store, userId) { return store.licenses.find((item) => item.userId === userId && item.status === 'active') || null }
function publicUser(store, user) { return { email: user.email, unlocked: !!licenseFor(store, user.id) } }
function projectFor(store, userId) { let project = store.projects.find((item) => item.userId === userId); if (!project) { project = { id: id('project'), userId, updatedAt: new Date().toISOString(), profile: null, director: null, stickers: {}, model: null }; store.projects.push(project) } return project }
function setProject(store, userId, key, value) { const project = projectFor(store, userId); project[key] = value; project.updatedAt = new Date().toISOString(); save(store); return project }
function safeFile(file) { return /^[a-zA-Z0-9._ -]+\.glb$/.test(file) ? file : null }
function mime(file) { return file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream' }

async function stripeCheckout(user, order) {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim(); if (!secret) throw new Error('支付服务尚未配置，请设置 STRIPE_SECRET_KEY')
  const params = new URLSearchParams({ mode: 'payment', success_url: `${origin}/account?payment=success`, cancel_url: `${origin}/account?payment=cancelled`, customer_email: user.email, 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'cny', 'line_items[0][price_data][unit_amount]': String(priceCents), 'line_items[0][price_data][product_data][name]': 'SEN 3D Resume 编辑授权', 'line_items[0][price_data][product_data][description]': '一次性解锁贴纸、运镜、内容编辑与模型提示词', 'metadata[orderId]': order.id, 'metadata[userId]': user.id })
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/x-www-form-urlencoded' }, body: params }); const result = await response.json()
  if (!response.ok || !result.url) throw new Error(result?.error?.message || '无法创建支付会话'); order.providerSessionId = result.id; return result.url
}
function validStripeSignature(raw, header) { const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(); if (!secret || !header) return false; const values = Object.fromEntries(header.split(',').map((item) => item.split('='))); if (!values.t || !values.v1 || Math.abs(Date.now() / 1000 - Number(values.t)) > 300) return false; const expected = crypto.createHmac('sha256', secret).update(`${values.t}.${raw}`).digest('hex'); return crypto.timingSafeEqual(Buffer.from(values.v1), Buffer.from(expected)) }
function grant(store, userId, orderId) { if (!licenseFor(store, userId)) store.licenses.push({ id: id('license'), userId, orderId, product: 'sen-3d-resume-editor', status: 'active', grantedAt: new Date().toISOString() }) }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', origin); const store = db(); const method = req.method || 'GET'
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, paymentProvider: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'unconfigured' })
    if (url.pathname === '/api/auth/session' && method === 'GET') { const user = session(req, store); return json(res, 200, { ok: true, account: user ? publicUser(store, user) : null }) }
    if (url.pathname === '/api/auth/register' && method === 'POST') { const input = await requestJson(req); const email = cleanEmail(input.email); const password = String(input.password || ''); if (password.length < 8) throw new Error('密码至少需要 8 位'); if (store.users.some((user) => user.email === email)) return json(res, 409, { ok: false, error: '该邮箱已注册，请直接登录' }); const user = { id: id('user'), email, passwordHash: await passwordHash(password), createdAt: new Date().toISOString() }; store.users.push(user); projectFor(store, user.id); save(store); return json(res, 201, { ok: true, account: publicUser(store, user) }, { 'set-cookie': cookie(tokenFor(user), 2592000) }) }
    if (url.pathname === '/api/auth/login' && method === 'POST') { const input = await requestJson(req); const user = store.users.find((item) => item.email === cleanEmail(input.email)); if (!user || !(await validPassword(String(input.password || ''), user.passwordHash))) return json(res, 401, { ok: false, error: '邮箱或密码错误' }); return json(res, 200, { ok: true, account: publicUser(store, user) }, { 'set-cookie': cookie(tokenFor(user), 2592000) }) }
    if (url.pathname === '/api/auth/logout' && method === 'POST') return json(res, 200, { ok: true }, { 'set-cookie': cookie() })
    if (url.pathname === '/api/license' && method === 'GET') { const user = requireUser(req, res, store); if (!user) return; return json(res, 200, { ok: true, license: licenseFor(store, user.id) }) }
    if (url.pathname === '/api/projects/me' && method === 'GET') { const user = requireUser(req, res, store); if (!user) return; return json(res, 200, { ok: true, project: projectFor(store, user.id) }) }
    if (['/api/profile', '/api/director', '/api/stickers'].includes(url.pathname)) { const user = requireUser(req, res, store); if (!user) return; const key = url.pathname.slice(5); if (method === 'GET') { const project = projectFor(store, user.id); return json(res, 200, { ok: true, ...(key === 'stickers' ? { files: [], stickers: project.stickers || {} } : { config: project[key] }) }) } if (method === 'POST') { const input = await requestJson(req); setProject(store, user.id, key, key === 'stickers' ? input.stickers || {} : input); return json(res, 200, { ok: true }) } return json(res, 405, { ok: false, error: 'Method not allowed' }) }
    if (url.pathname === '/api/models' && method === 'GET') { const user = requireUser(req, res, store); if (!user) return; const project = projectFor(store, user.id); return json(res, 200, { ok: true, files: project.model ? [project.model.file] : [], selected: project.model?.file || null, model: project.model }) }
    if (url.pathname === '/api/models' && method === 'POST') { const user = requireUser(req, res, store); if (!user) return; const project = projectFor(store, user.id); const input = await requestJson(req); if (!project.model || input.selected !== project.model.file) throw new Error('请选择当前项目中已上传的模型'); return json(res, 200, { ok: true, model: project.model }) }
    if (url.pathname === '/api/models/upload' && method === 'POST') { const user = requireUser(req, res, store); if (!user) return; const file = safeFile(decodeURIComponent(String(req.headers['x-file-name'] || ''))); if (!file) throw new Error('仅支持 .glb 文件'); const binary = await body(req); if (!binary.length) throw new Error('上传文件为空'); if (binary.subarray(0, 4).toString('ascii') !== 'glTF') throw new Error('文件不是有效的 GLB 二进制格式'); const name = `${user.id}-${Date.now()}-${file.replace(/\s+/g, '-')}`; fs.writeFileSync(path.join(assetsDir, name), binary); setProject(store, user.id, 'model', { file: name, originalName: file, url: `/assets/${encodeURIComponent(name)}`, size: binary.length }); return json(res, 201, { ok: true, model: projectFor(store, user.id).model }) }
    if (url.pathname === '/api/payments/checkout' && method === 'POST') { const user = requireUser(req, res, store); if (!user) return; if (licenseFor(store, user.id)) return json(res, 200, { ok: true, alreadyLicensed: true }); const order = { id: id('order'), userId: user.id, provider: 'stripe', amount: priceCents, currency: 'cny', status: 'pending', createdAt: new Date().toISOString() }; store.orders.push(order); const checkoutUrl = await stripeCheckout(user, order); save(store); return json(res, 201, { ok: true, checkoutUrl }) }
    if (url.pathname === '/api/payments/webhook/stripe' && method === 'POST') { const raw = await body(req); if (!validStripeSignature(raw.toString('utf8'), String(req.headers['stripe-signature'] || ''))) return json(res, 400, { ok: false, error: 'Webhook signature invalid' }); const event = JSON.parse(raw.toString('utf8')); if (event.type === 'checkout.session.completed' && event.data?.object?.payment_status === 'paid') { const checkout = event.data.object; const order = store.orders.find((item) => item.id === checkout.metadata?.orderId); if (order && order.status !== 'paid') { order.status = 'paid'; order.providerSessionId = checkout.id; order.paidAt = new Date().toISOString(); grant(store, order.userId, order.id); save(store) } } return json(res, 200, { received: true }) }
    if (url.pathname.startsWith('/assets/') && method === 'GET') { const builtAsset = path.resolve(distDir, url.pathname.replace(/^\/+/, '')); if (builtAsset.startsWith(distDir) && fs.existsSync(builtAsset) && fs.statSync(builtAsset).isFile()) { res.writeHead(200, { 'content-type': mime(builtAsset), 'cache-control': 'public, max-age=31536000, immutable' }); return fs.createReadStream(builtAsset).pipe(res) } const name = path.basename(decodeURIComponent(url.pathname.slice(8))); const file = path.join(assetsDir, name); if (!fs.existsSync(file)) return text(res, 404, 'Not found'); res.writeHead(200, { 'content-type': 'model/gltf-binary', 'cache-control': 'private, max-age=3600' }); return fs.createReadStream(file).pipe(res) }
    if (method === 'GET' && !url.pathname.startsWith('/api/')) { const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''); const file = path.resolve(distDir, requested); const fallback = path.join(distDir, 'index.html'); const target = file.startsWith(distDir) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : fallback; if (fs.existsSync(target)) { res.writeHead(200, { 'content-type': mime(target) }); return fs.createReadStream(target).pipe(res) } }
    return text(res, 404, 'Not found')
  } catch (error) { console.error(error); return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Request failed' }) }
})
server.listen(port, '127.0.0.1', () => console.log(`Commerce API listening at http://127.0.0.1:${port}`))
