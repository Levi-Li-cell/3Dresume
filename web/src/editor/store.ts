import { create } from 'zustand'
import * as THREE from 'three'

export type StickerCfg = {
  position: [number, number, number]
  rotation: [number, number, number] // 欧拉角（度，XYZ 顺序）
  scale: number
}

export type RollbackSnap = {
  id: string
  time: string
  label: string
  stickerCount: number
  baked: boolean
  hasGlb: boolean
}

const DEFAULT_POS: [number, number, number] = [0, 0.6, 0.27]
const DEFAULT_ROT: [number, number, number] = [0, 0, 0]
const DEFAULT_SCALE = 0.12

export function defaultCfg(): StickerCfg {
  return {
    position: [...DEFAULT_POS] as [number, number, number],
    rotation: [...DEFAULT_ROT] as [number, number, number],
    scale: DEFAULT_SCALE,
  }
}

function quatToEulerDeg(q: number[]): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1),
    'XYZ'
  )
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ]
}

/** 把 stickers.json 里的原始配置规整为编辑器使用的配置 */
export function normCfg(raw: any): StickerCfg {
  const p = Array.isArray(raw?.position) ? raw.position.map(Number) : DEFAULT_POS
  const r = Array.isArray(raw?.rotation) ? raw.rotation.map(Number) : DEFAULT_ROT
  const rot: [number, number, number] =
    r.length >= 4 ? quatToEulerDeg(r) : [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0]
  const s = Array.isArray(raw?.scale) ? Number(raw.scale[0]) : Number(raw?.scale)
  return {
    position: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0],
    rotation: rot,
    scale: Number.isFinite(s) ? s : DEFAULT_SCALE,
  }
}

type EditorState = {
  open: boolean
  placeMode: boolean
  files: string[]
  configs: Record<string, StickerCfg>
  selected: string | null
  status: string
  busy: boolean
  baked: boolean
  snapshots: RollbackSnap[]
  selectedSnap: string
  toggle: () => void
  setOpen: (b: boolean) => void
  setPlaceMode: (b: boolean) => void
  select: (f: string | null) => void
  setSelectedSnap: (id: string) => void
  load: () => Promise<void>
  update: (f: string, patch: Partial<StickerCfg>) => void
  removeFile: (f: string) => Promise<void>
  save: () => Promise<boolean>
  rebuild: () => Promise<void>
  loadSnapshots: () => Promise<void>
  saveSnapshot: () => Promise<void>
  rollbackTo: (id: string) => Promise<void>
  restoreClean: () => Promise<void>
}

export const useStickerEditor = create<EditorState>((set, get) => ({
  open: false,
  placeMode: false,
  files: [],
  configs: {},
  selected: null,
  status: '',
  busy: false,
  baked: false,
  snapshots: [],
  selectedSnap: '',
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (b) => set({ open: b }),
  setPlaceMode: (b) => set({ placeMode: b }),
  select: (f) => set({ selected: f }),
  setSelectedSnap: (id) => set({ selectedSnap: id }),
  load: async () => {
    set({ busy: true, status: '加载中…' })
    try {
      const res = await fetch('/api/stickers')
      const data = await res.json()
      const configs: Record<string, StickerCfg> = {}
      for (const [k, v] of Object.entries(data.stickers || {})) configs[k] = normCfg(v)
      set({ files: data.files || [], configs, status: '' })
    } catch (e: any) {
      set({ status: '加载失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  update: (f, patch) =>
    set((s) => ({
      configs: { ...s.configs, [f]: { ...(s.configs[f] || defaultCfg()), ...patch } },
      baked: false, // 配置变更 => 需要重新生成 GLB 才会烘焙
    })),
  removeFile: async (f) => {
    set({ busy: true, status: '删除 ' + f + ' …' })
    try {
      const res = await fetch('/api/stickers?file=' + encodeURIComponent(f), {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '删除失败')
      set((s) => {
        const files = s.files.filter((x) => x !== f)
        const configs = { ...s.configs }
        delete configs[f]
        return {
          files,
          configs,
          selected: s.selected === f ? null : s.selected,
          status: '已删除 ' + f,
        }
      })
    } catch (e: any) {
      set({ status: '删除失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  save: async () => {
    set({ busy: true, status: '保存中…' })
    try {
      const res = await fetch('/api/stickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stickers: get().configs }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '保存失败')
      set({ status: '已保存 ✓' })
      return true
    } catch (e: any) {
      set({ status: '保存失败: ' + String(e?.message || e) })
      return false
    } finally {
      set({ busy: false })
    }
  },
  rebuild: async () => {
    set({ busy: true, status: '生成 GLB 中…（约几秒）' })
    try {
      const res = await fetch('/api/rebuild', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'generate failed')
      set({ status: 'GLB generated ok, model refreshed', baked: true })
      useModelUrl.getState().bump()
    } catch (e: any) {
      set({ status: '生成失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  loadSnapshots: async () => {
    set({ busy: true, status: '加载快照中…' })
    try {
      const res = await fetch('/api/rollback')
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '加载快照失败')
      set({ snapshots: data.snapshots || [], status: '' })
    } catch (e: any) {
      set({ status: '加载快照失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  saveSnapshot: async () => {
    set({ busy: true, status: '保存快照中…' })
    try {
      const res = await fetch('/api/snapshot', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '保存快照失败')
      const res2 = await fetch('/api/rollback')
      const d2 = await res2.json()
      set({ snapshots: d2.snapshots || [], status: '已保存快照 ✓' })
    } catch (e: any) {
      set({ status: '保存快照失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  rollbackTo: async (id: string) => {
    set({ busy: true, status: '回滚中…' })
    try {
      const res = await fetch('/api/rollback?to=' + encodeURIComponent(id), {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '回滚失败')
      await get().load() // 重新读取恢复后的 stickers.json
      set({
        snapshots: data.snapshots || get().snapshots,
        selectedSnap: '',
        baked: !!data.baked,
        status: '已回滚 ✓',
      })
      useModelUrl.getState().bump()
    } catch (e: any) {
      set({ status: '回滚失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
  restoreClean: async () => {
    set({ busy: true, status: '清理贴纸中…' })
    try {
      const res = await fetch('/api/rollback?to=clean', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '清理失败')
      await get().load()
      set({
        snapshots: data.snapshots || get().snapshots,
        selectedSnap: '',
        baked: false,
        status: '模型已清理干净 ✓（已自动保存清理前快照）',
      })
      useModelUrl.getState().bump()
    } catch (e: any) {
      set({ status: '清理失败: ' + String(e?.message || e) })
    } finally {
      set({ busy: false })
    }
  },
}))

type ModelUrlState = { url: string; bump: () => void }
export const useModelUrl = create<ModelUrlState>((set) => ({
  url: `${import.meta.env.BASE_URL}models/liwei.rigged.glb`,
  bump: () =>
    set({ url: `${import.meta.env.BASE_URL}models/liwei.rigged.glb?t=${Date.now()}` }),
}))

type ManState = { man: THREE.Object3D | null; setMan: (m: THREE.Object3D | null) => void }
/** 当前渲染中 liwei.rigged.glb 的 man 节点（贴纸父级），由 Scene 注册 */
export const useMan = create<ManState>((set) => ({
  man: null,
  setMan: (m) => set({ man: m }),
}))
