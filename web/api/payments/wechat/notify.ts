import { decryptNotification, verifyNotification } from '../../_lib/wechat.js'
import { send, supabase } from '../../_lib/http.js'

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
    const orderId = String(payment.out_trade_no || '')
    const transactionId = String(payment.transaction_id || '')
    if (!orderId || !transactionId) return send(res, 400, { error: 'Invalid payment payload' })
    const db = supabase()
    const { data: order, error: orderError } = await db.from('sen_orders').select('id,user_id,amount_fen,status').eq('id', orderId).maybeSingle()
    if (orderError) throw orderError
    if (!order || Number(payment.amount?.total) !== order.amount_fen) return send(res, 400, { error: 'Order validation failed' })
    const paidAt = new Date().toISOString()
    const { error: updateError } = await db.from('sen_orders').update({ status: 'paid', transaction_id: transactionId, paid_at: paidAt }).eq('id', orderId).neq('status', 'paid')
    if (updateError) throw updateError
    const { error: licenseError } = await db.from('sen_licenses').upsert({ user_id: order.user_id, product_code: 'sen-3d-editor', status: 'active', order_id: orderId, granted_at: paidAt }, { onConflict: 'user_id,product_code' })
    if (licenseError) throw licenseError
    return send(res, 200, { received: true })
  } catch {
    return send(res, 500, { error: 'Notification processing failed' })
  }
}
