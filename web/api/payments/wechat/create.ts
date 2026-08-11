import crypto from 'node:crypto'
import { hasLicense } from '../../_lib/access.js'
import { message, send, supabase, viewer } from '../../_lib/http.js'
import { createNativeOrder } from '../../_lib/wechat.js'

const amount = () => Number(process.env.WECHATPAY_AMOUNT_FEN || 300)

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
    const user = await viewer(req)
    if (await hasLicense(user.id)) return send(res, 200, { alreadyLicensed: true })
    const id = `sen_${crypto.randomUUID().replace(/-/g, '')}`
    const db = supabase()
    const { error: insertError } = await db.from('sen_orders').insert({ id, user_id: user.id, provider: 'wechat_native', product_code: 'sen-3d-editor', amount_fen: amount(), currency: 'CNY', status: 'pending' })
    if (insertError) throw insertError
    try {
      const codeUrl = await createNativeOrder(id, 'SEN 3D Resume 编辑授权', amount())
      const { error: updateError } = await db.from('sen_orders').update({ code_url: codeUrl }).eq('id', id)
      if (updateError) throw updateError
      return send(res, 201, { orderId: id, codeUrl })
    } catch (error) {
      await db.from('sen_orders').update({ status: 'failed' }).eq('id', id)
      throw error
    }
  } catch (error) { return send(res, 400, { error: message(error) }) }
}
