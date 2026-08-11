import { supabase } from './http.js'

export async function hasLicense(userId: string) {
  const { data, error } = await supabase()
    .from('sen_licenses')
    .select('id')
    .eq('user_id', userId)
    .eq('product_code', 'sen-3d-editor')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function requireLicense(userId: string) {
  if (!(await hasLicense(userId))) throw new Error('请先完成支付以解锁编辑功能')
}
