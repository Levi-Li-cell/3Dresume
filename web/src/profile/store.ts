import { create } from 'zustand'

export type ProfileFact = { id: string; label: string; value: string }

export type ProfileData = {
  name: string
  role: string
  portfolio: string
  footer: string
  location: string
  about: Record<'zh' | 'en', { title: string; paragraph: string }>
  facts: ProfileFact[]
}

export type ProfileConfig = {
  version: 1
  mode: 'preset' | 'custom'
  custom: ProfileData
}

export const PRESET_1: ProfileData = {
  name: 'Sen Zheng 郑越升',
  role: 'Creative Technologist',
  portfolio: 'Portfolio - 2026',
  footer: 'Code · Art · Play',
  location: 'Based in Shenzhen',
  about: {
    zh: {
      title: 'About Sen',
      paragraph: '我是 Sen——一个游走在代码与艺术之间的创意技术人。我常年和 Coding、创意、有趣的交互 & 设计、CG 创作等打交道，喜欢研究并组合不同领域的技能，来创造并探索更多可能性。',
    },
    en: {
      title: 'About Sen',
      paragraph: "I'm Sen - a creative technologist living where code meets art. I spend my days around coding, creativity, playful interaction & design, and CG work. I love studying and combining skills across different fields - to create, and to explore more possibilities.",
    },
  },
  facts: [],
}

const clonePreset = (): ProfileData => JSON.parse(JSON.stringify(PRESET_1)) as ProfileData

function normalize(raw: unknown): ProfileConfig {
  const config = raw as Partial<ProfileConfig> | null
  const custom = config?.custom as Partial<ProfileData> | undefined
  if (!custom) return { version: 1, mode: 'preset', custom: clonePreset() }
  return {
    version: 1,
    mode: config?.mode === 'custom' ? 'custom' : 'preset',
    custom: {
      ...clonePreset(),
      ...custom,
      about: {
        zh: { ...PRESET_1.about.zh, ...custom.about?.zh },
        en: { ...PRESET_1.about.en, ...custom.about?.en },
      },
      facts: Array.isArray(custom.facts)
        ? custom.facts.filter((fact): fact is ProfileFact => !!fact && typeof fact.label === 'string' && typeof fact.value === 'string')
        : [],
    },
  }
}

type ProfileState = {
  open: boolean
  config: ProfileConfig
  status: string
  busy: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
  load: () => Promise<void>
  save: () => Promise<void>
  usePreset: () => void
  update: (patch: Partial<ProfileData>) => void
  updateAbout: (lang: 'zh' | 'en', patch: Partial<ProfileData['about']['zh']>) => void
  addFact: () => void
  updateFact: (id: string, patch: Partial<ProfileFact>) => void
  removeFact: (id: string) => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  open: false,
  config: { version: 1, mode: 'preset', custom: clonePreset() },
  status: '',
  busy: false,
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
  load: async () => {
    set({ busy: true })
    try {
      const response = await fetch('/api/profile', { credentials: 'include' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      set({ config: normalize(result.config), status: '' })
    } catch (error) {
      set({ status: `加载资料失败: ${String(error)}` })
    } finally {
      set({ busy: false })
    }
  },
  save: async () => {
    set({ busy: true, status: '保存中...' })
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().config),
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || '保存失败')
      set({ status: '已写入 public/profile/profile.json' })
    } catch (error) {
      set({ status: `保存失败: ${String(error)}` })
    } finally {
      set({ busy: false })
    }
  },
  usePreset: () => set({ config: { version: 1, mode: 'preset', custom: get().config.custom }, status: '已应用预设 1。' }),
  update: (patch) => set((state) => ({
    config: { version: 1, mode: 'custom', custom: { ...state.config.custom, ...patch } },
    status: '未保存的修改已实时应用。',
  })),
  updateAbout: (lang, patch) => set((state) => ({
    config: {
      version: 1,
      mode: 'custom',
      custom: { ...state.config.custom, about: { ...state.config.custom.about, [lang]: { ...state.config.custom.about[lang], ...patch } } },
    },
    status: '未保存的修改已实时应用。',
  })),
  addFact: () => set((state) => ({
    config: {
      version: 1,
      mode: 'custom',
      custom: { ...state.config.custom, facts: [...state.config.custom.facts, { id: `fact-${Date.now()}`, label: '标签', value: '内容' }] },
    },
    status: '已新增一项自定义信息。',
  })),
  updateFact: (id, patch) => set((state) => ({
    config: {
      version: 1,
      mode: 'custom',
      custom: { ...state.config.custom, facts: state.config.custom.facts.map((fact) => fact.id === id ? { ...fact, ...patch } : fact) },
    },
    status: '未保存的修改已实时应用。',
  })),
  removeFact: (id) => set((state) => ({
    config: {
      version: 1,
      mode: 'custom',
      custom: { ...state.config.custom, facts: state.config.custom.facts.filter((fact) => fact.id !== id) },
    },
    status: '已删除该信息项。',
  })),
}))

export function selectProfile(config: ProfileConfig): ProfileData {
  return config.mode === 'preset' ? PRESET_1 : config.custom
}
