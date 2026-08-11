import { message, send, supabase, viewer } from '../../_lib/http.js'

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })
    const user = await viewer(req)
    const id = String(req.query.orderId || '')
    if (!id) return send(res, 400, { error: 'orderId is required' })
    const { data: order, error } = await supabase().from('sen_orders').select('id,status,code_url,paid_at').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (error) throw error
    if (!order) return send(res, 404, { error: '订单不存在' })
    const { data: license, error: licenseError } = await supabase().from('sen_licenses').select('id,status').eq('user_id', user.id).eq('product_code', 'sen-3d-editor').eq('status', 'active').maybeSingle()
    if (licenseError) throw licenseError
    return send(res, 200, { order, licensed: !!license })
  } catch (error) { return send(res, 400, { error: message(error) }) }
}
