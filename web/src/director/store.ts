import { create } from 'zustand'
import { apiJson } from '../product/api'
import {
  EMPTY_DIRECTOR_CONFIG,
  EMPTY_RUNTIME,
  type DirectorConfig,
  type DirectorKeyframe,
  type DirectorMode,
  type DirectorRuntime,
} from './types'

function keyframeAt(frame: number, runtime: DirectorRuntime): DirectorKeyframe {
  return {
    id: `key-${Date.now()}`,
    label: `镜头 ${Math.round(frame)}`,
    frame: Math.round(frame),
    positionOffset: [0, 0, 0],
    focusOffset: [0, 0, 0],
    fovOffset: 0,
    bokehScale: runtime.bokehScale,
    focusRange: runtime.focusRange,
  }
}

function normalizeConfig(raw: unknown): DirectorConfig {
  const config = raw as Partial<DirectorConfig> | null
  if (!config || !Array.isArray(config.keyframes)) return EMPTY_DIRECTOR_CONFIG
  return {
    version: 2,
    mode: config.mode === 'custom' ? 'custom' : 'preset',
    keyframes: config.keyframes
      .filter((key): key is DirectorKeyframe => !!key && Number.isFinite(key.frame))
      .map((key) => ({
        ...key,
        id: String(key.id || `key-${key.frame}`),
        label: String(key.label || `镜头 ${key.frame}`),
        frame: Math.max(0, Math.round(key.frame)),
        positionOffset: normalizeVec(key.positionOffset),
        focusOffset: normalizeVec(key.focusOffset),
        fovOffset: finite(key.fovOffset),
        bokehScale: Math.max(0, finite(key.bokehScale)),
        focusRange: Math.max(0.0001, finite(key.focusRange, 0.15)),
      }))
      .sort((a, b) => a.frame - b.frame),
  }
}

function normalizeVec(value: unknown): [number, number, number] {
  const v = Array.isArray(value) ? value : []
  return [finite(v[0]), finite(v[1]), finite(v[2])]
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

type DirectorState = {
  open: boolean
  config: DirectorConfig
  selectedId: string | null
  previewFrame: number | null
  runtime: DirectorRuntime
  status: string
  busy: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
  load: () => Promise<void>
  save: () => Promise<void>
  select: (id: string | null) => void
  setPreviewFrame: (frame: number | null) => void
  setRuntime: (runtime: DirectorRuntime) => void
  addKeyframe: () => void
  setMode: (mode: DirectorMode) => void
  removeSelected: () => void
  updateSelected: (patch: Partial<DirectorKeyframe>) => void
}

export const useDirectorStore = create<DirectorState>((set, get) => ({
  open: false,
  config: EMPTY_DIRECTOR_CONFIG,
  selectedId: null,
  previewFrame: null,
  runtime: EMPTY_RUNTIME,
  status: '',
  busy: false,
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
  load: async () => {
    set({ busy: true, status: '加载运镜配置...' })
    try {
      const result = await apiJson<{ config: unknown }>('/api/director')
      const config = normalizeConfig(result.config)
      set({ config, status: config.keyframes.length ? '' : '当前没有额外运镜关键帧' })
    } catch (error) {
      set({ config: EMPTY_DIRECTOR_CONFIG, status: `加载失败: ${String(error)}` })
    } finally {
      set({ busy: false })
    }
  },
  save: async () => {
    set({ busy: true, status: '保存中...' })
    try {
      const result = await apiJson<any>('/api/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().config),
      })
      if (!result.ok) throw new Error(result.error || '保存失败')
      set({ status: '已保存到你的云端项目' })
    } catch (error) {
      set({ status: `保存失败: ${String(error)}` })
    } finally {
      set({ busy: false })
    }
  },
  select: (id) => set({ selectedId: id }),
  setPreviewFrame: (frame) => set({ previewFrame: frame === null ? null : Math.max(0, Math.round(frame)) }),
  setRuntime: (runtime) =>
    set((state) =>
      state.runtime.frame === runtime.frame && state.runtime.totalFrames === runtime.totalFrames
        ? state
        : { runtime }
    ),
  addKeyframe: () => {
    const state = get()
    const frame = state.previewFrame ?? state.runtime.frame
    const keyframe = keyframeAt(frame, state.runtime)
    set({
      config: {
        version: 2,
        mode: 'custom',
        keyframes: [...state.config.keyframes, keyframe].sort((a, b) => a.frame - b.frame),
      },
      selectedId: keyframe.id,
      previewFrame: keyframe.frame,
      status: '已创建关键帧，拖动参数即可预览。',
    })
  },
  setMode: (mode) =>
    set({
      config: { version: 2, mode, keyframes: [] },
      selectedId: null,
      previewFrame: null,
      status:
        mode === 'custom'
          ? '已切换为自定义运镜。原始相机路径已冻结，请在时间轴上添加关键帧。'
          : '已恢复预设 1：GLB 原始相机动画。',
    }),
  removeSelected: () => {
    const selectedId = get().selectedId
    if (!selectedId) return
    set((state) => ({
      config: { version: 2, mode: state.config.mode, keyframes: state.config.keyframes.filter((key) => key.id !== selectedId) },
      selectedId: null,
      status: '已移除关键帧，尚未保存。',
    }))
  },
  updateSelected: (patch) => {
    const selectedId = get().selectedId
    if (!selectedId) return
    set((state) => ({
      config: {
        version: 2,
        // Editing a keyframe is an explicit customization. Preserve the existing
        // keyframes when leaving Preset 1 so the first adjustment applies instantly.
        mode: 'custom',
        keyframes: state.config.keyframes
          .map((key) => (key.id === selectedId ? { ...key, ...patch } : key))
          .sort((a, b) => a.frame - b.frame),
      },
      status: '未保存的修改正在实时预览。',
    }))
  },
}))
