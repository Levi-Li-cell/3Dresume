import crypto from 'node:crypto'

const privateKey = () => String(process.env.WECHATPAY_MCH_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const platformKey = () => String(process.env.WECHATPAY_PLATFORM_PUBLIC_KEY || '').replace(/\\n/g, '\n')
const requireEnv = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }

function signature(method: string, path: string, body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomBytes(16).toString('hex')
  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`
  const value = crypto.createSign('RSA-SHA256').update(payload).sign(privateKey(), 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${requireEnv('WECHATPAY_MCH_ID')}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${requireEnv('WECHATPAY_MCH_SERIAL_NO')}",signature="${value}"`
}

export async function createNativeOrder(orderId: string, description: string, amount: number) {
  const body = JSON.stringify({ appid: requireEnv('WECHATPAY_APP_ID'), mchid: requireEnv('WECHATPAY_MCH_ID'), description, out_trade_no: orderId, notify_url: requireEnv('WECHATPAY_NOTIFY_URL'), amount: { total: amount, currency: 'CNY' } })
  const endpoint = '/v3/pay/transactions/native'
  const response = await fetch(`https://api.mch.weixin.qq.com${endpoint}`, { method: 'POST', headers: { authorization: signature('POST', endpoint, body), 'content-type': 'application/json', accept: 'application/json' }, body })
  const data = await response.json()
  if (!response.ok || !data.code_url) throw new Error(data.message || '微信支付下单失败')
  return data.code_url as string
}

export function verifyNotification(headers: Record<string, string | string[] | undefined>, body: string) {
  const timestamp = String(headers['wechatpay-timestamp'] || ''); const nonce = String(headers['wechatpay-nonce'] || ''); const signed = String(headers['wechatpay-signature'] || '')
  if (!timestamp || !nonce || !signed || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  return crypto.createVerify('RSA-SHA256').update(`${timestamp}\n${nonce}\n${body}\n`).verify(platformKey(), signed, 'base64')
}

export function decryptNotification(resource: { ciphertext: string; nonce: string; associated_data?: string }) {
  const encrypted = Buffer.from(resource.ciphertext, 'base64'); const tag = encrypted.subarray(encrypted.length - 16); const content = encrypted.subarray(0, encrypted.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(requireEnv('WECHATPAY_API_V3_KEY'), 'utf8'), Buffer.from(resource.nonce, 'utf8'))
  decipher.setAuthTag(tag); decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'))
  return JSON.parse(Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8'))
}
