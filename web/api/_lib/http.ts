import { createClient } from '@supabase/supabase-js'

type RequestLike = { headers: Record<string, string | string[] | undefined>; body?: unknown; method?: string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (data: unknown) => void }

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

export function supabase() {
  if (!url || !serviceRole) throw new Error('Supabase service role is not configured')
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function viewer(req: RequestLike) {
  const raw = req.headers.authorization || ''
  const token = Array.isArray(raw) ? raw[0] : raw
  const value = token.startsWith('Bearer ') ? token.slice(7) : ''
  if (!value) throw new Error('请先登录')
  const { data, error } = await supabase().auth.getUser(value)
  if (error || !data.user) throw new Error('登录已过期，请重新登录')
  return data.user
}

export function send(res: ResponseLike, status: number, data: Record<string, unknown>) { res.status(status).json({ ok: status < 400, ...data }) }
export function message(error: unknown) { return error instanceof Error ? error.message : '请求失败' }
