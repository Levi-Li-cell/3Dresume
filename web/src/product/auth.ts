import { create } from 'zustand'

export type Account = { email: string; unlocked: boolean }

const KEY = 'sen-template-account-v1'

function readAccount(): Account | null {
  try {
    const value = localStorage.getItem(KEY)
    return value ? JSON.parse(value) as Account : null
  } catch {
    return null
  }
}

function persist(account: Account | null) {
  if (account) localStorage.setItem(KEY, JSON.stringify(account))
  else localStorage.removeItem(KEY)
}

type AuthState = {
  account: Account | null
  ready: boolean
  hydrate: () => void
  signIn: (email: string) => void
  unlockDemo: () => void
  signOut: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  account: null,
  ready: false,
  hydrate: () => set({ account: readAccount(), ready: true }),
  signIn: (email) => {
    const account: Account = { email, unlocked: get().account?.email === email && !!get().account?.unlocked }
    persist(account)
    set({ account })
  },
  unlockDemo: () => {
    const current = get().account
    if (!current) return
    const account = { ...current, unlocked: true }
    persist(account)
    set({ account })
  },
  signOut: () => {
    persist(null)
    set({ account: null })
  },
}))
