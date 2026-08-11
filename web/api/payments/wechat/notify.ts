import { decryptNotification, verifyNotification } from '../../_lib/wechat.js'
import { send, supabase } from '../../_lib/http.js'
import { settleWechatPayment } from '../../_lib/payment-core.mjs'

export const config = { api: { bodyParser: false } }

async function rawBody(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  try {
    const raw = await rawBody(req)
    if (!verifyNotification(req.headers, raw)) return send(res, 401, { error: 'Invalid WeChat Pay signature' })
    const event = JSON.parse(raw)
    const payment = decryptNotification(event.resource)
    if (payment.trade_state !== 'SUCCESS') return send(res, 200, { received: true })
    const db = supabase()
    const paidAt = new Date().toISOString()
    const result = await settleWechatPayment({
      findOrder: async (orderId: string) => {
        const { data, error } = await db.from('sen_orders').select('id,user_id,amount_fen,status').eq('id', orderId).maybeSingle()
        if (error) throw error
        return data
      },
      markPaid: async (orderId: string, transactionId: string, time: string) => {
        const { error } = await db.from('sen_orders').update({ status: 'paid', transaction_id: transactionId, paid_at: time }).eq('id', orderId).neq('status', 'paid')
        if (error) throw error
      },
      grantLicense: async (userId: string, orderId: string, time: string) => {
        const { error } = await db.from('sen_licenses').upsert({ user_id: userId, product_code: 'sen-3d-editor', status: 'active', order_id: orderId, granted_at: time }, { onConflict: 'user_id,product_code' })
        if (error) throw error
      },
    }, payment, paidAt)
    if (!result.accepted) return send(res, 400, { error: 'Order validation failed' })
    return send(res, 200, { received: true })
  } catch {
    return send(res, 500, { error: 'Notification processing failed' })
  }
}
