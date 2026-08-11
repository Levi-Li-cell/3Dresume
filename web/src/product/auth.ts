import { create } from 'zustand'
import { apiJson, supabaseClient } from './api'

export type Account = { email: string; unlocked: boolean }
export type PaymentOrder = { orderId: string; codeUrl: string }

type AuthState = {
  account: Account | null
  ready: boolean
  error: string
  busy: boolean
  payment: PaymentOrder | null
  hydrate: () => Promise<void>
  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  checkout: () => Promise<void>
  pollPayment: () => Promise<boolean>
  clearPayment: () => void
  signOut: () => Promise<void>
}

async function accountFromSession() {
  const { data: { session } } = await supabaseClient().auth.getSession()
  if (!session?.user.email) return null
  const license = await apiJson<{ license: { id: string } | null }>('/api/license')
  return { email: session.user.email, unlocked: !!license.license }
}

export const useAuth = create<AuthState>((set, get) => ({
  account: null,
  ready: false,
  error: '',
  busy: false,
  payment: null,
  hydrate: async () => {
    try { set({ account: await accountFromSession(), error: '', ready: true }) }
    catch (error) { set({ account: null, error: error instanceof Error ? error.message : '账户服务暂不可用', ready: true }) }
  },
  register: async (email, password) => {
    set({ busy: true, error: '' })
    try {
      const { data, error } = await supabaseClient().auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account` } })
      if (error) throw error
      if (!data.session) {
        set({ account: null })
        return
      }
      set({ account: await accountFromSession() })
    } catch (error) { set({ error: error instanceof Error ? error.message : '注册失败' }); throw error }
    finally { set({ busy: false }) }
  },
  login: async (email, password) => {
    set({ busy: true, error: '' })
    try {
      const { error } = await supabaseClient().auth.signInWithPassword({ email, password })
      if (error) throw error
      set({ account: await accountFromSession() })
    } catch (error) { set({ error: error instanceof Error ? error.message : '登录失败' }); throw error }
    finally { set({ busy: false }) }
  },
  checkout: async () => {
    set({ busy: true, error: '' })
    try {
      const result = await apiJson<{ alreadyLicensed?: boolean; orderId?: string; codeUrl?: string }>('/api/payments/wechat/create', { method: 'POST' })
      if (result.alreadyLicensed) {
        set((state) => ({ account: state.account ? { ...state.account, unlocked: true } : null }))
        return
      }
      if (!result.orderId || !result.codeUrl) throw new Error('微信支付订单未生成')
      set({ payment: { orderId: result.orderId, codeUrl: result.codeUrl } })
    } catch (error) { set({ error: error instanceof Error ? error.message : '创建订单失败' }); throw error }
    finally { set({ busy: false }) }
  },
  pollPayment: async () => {
    const payment = get().payment
    if (!payment) return false
    try {
      const result = await apiJson<{ licensed: boolean }>(`/api/payments/wechat/status?orderId=${encodeURIComponent(payment.orderId)}`)
      if (result.licensed) {
        set((state) => ({ payment: null, account: state.account ? { ...state.account, unlocked: true } : null, error: '' }))
        return true
      }
    } catch (error) { set({ error: error instanceof Error ? error.message : '支付状态查询失败' }) }
    return false
  },
  clearPayment: () => set({ payment: null }),
  signOut: async () => {
    try { await supabaseClient().auth.signOut() }
    finally { set({ account: null, payment: null, error: '' }) }
  },
}))
