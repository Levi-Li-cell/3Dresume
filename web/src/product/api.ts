import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function supabaseClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  client = createClient(url, key)
  return client
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabaseClient().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('请先登录')
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return fetch(path, { ...init, headers })
}

export async function apiJson<T>(path: string, init: RequestInit = {}) {
  const response = await authenticatedFetch(path, init)
  const data = await response.json().catch(() => ({ ok: false, error: '服务返回了无效响应' }))
  if (!response.ok || !data.ok) throw new Error(data.error || '请求失败')
  return data as T
}
