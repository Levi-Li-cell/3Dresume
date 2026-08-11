import { create } from 'zustand'

export type Account = { email: string; unlocked: boolean }

const apiBase = (import.meta.env.VITE_COMMERCE_API_URL || '').replace(/\/$/, '')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const result = await response.json().catch(() => ({ ok: false, error: '服务返回了无效响应' }))
  if (!response.ok || !result.ok) throw new Error(result.error || '请求失败')
  return result as T
}

type AuthState = {
  account: Account | null
  ready: boolean
  error: string
  busy: boolean
  hydrate: () => Promise<void>
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  checkout: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  account: null,
  ready: false,
  error: '',
  busy: false,
  hydrate: async () => {
    try {
      const result = await api<{ account: Account | null }>('/api/auth/session')
      set({ account: result.account, error: '', ready: true })
    } catch {
      set({ account: null, error: '账户服务暂不可用，请先启动 Commerce API。', ready: true })
    }
  },
  register: async (email, password) => {
    set({ busy: true, error: '' })
    try {
      const result = await api<{ account: Account }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })
      set({ account: result.account })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '注册失败' })
      throw error
    } finally { set({ busy: false }) }
  },
  login: async (email, password) => {
    set({ busy: true, error: '' })
    try {
      const result = await api<{ account: Account }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      set({ account: result.account })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '登录失败' })
      throw error
    } finally { set({ busy: false }) }
  },
  checkout: async () => {
    set({ busy: true, error: '' })
    try {
      const result = await api<{ checkoutUrl?: string; alreadyLicensed?: boolean }>('/api/payments/checkout', { method: 'POST', body: '{}' })
      if (result.alreadyLicensed) return set((state) => ({ account: state.account ? { ...state.account, unlocked: true } : null }))
      if (!result.checkoutUrl) throw new Error('支付链接未生成')
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '创建订单失败' })
      throw error
    } finally { set({ busy: false }) }
  },
  signOut: async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }) } finally { set({ account: null, error: '' }) }
  },
}))
