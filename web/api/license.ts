import { message, send, supabase, viewer } from './_lib/http.js'

export default async function handler(req: any, res: any) {
  try { const user = await viewer(req); const { data, error } = await supabase().from('sen_licenses').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(); if (error) throw error; send(res, 200, { license: data || null }) } catch (error) { send(res, 401, { error: message(error) }) }
}
