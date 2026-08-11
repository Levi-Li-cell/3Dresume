import { create } from 'zustand'
import * as THREE from 'three'
import { apiJson } from '../product/api'

export type StickerCfg = {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
  assetUrl?: string
  originalName?: string
}

const DEFAULT_POS: [number, number, number] = [0, 0.6, 0.27]
const DEFAULT_ROT: [number, number, number] = [0, 0, 0]
const DEFAULT_SCALE = 0.12

export function defaultCfg(): StickerCfg { return { position: [...DEFAULT_POS], rotation: [...DEFAULT_ROT], scale: DEFAULT_SCALE } }

function normalize(raw: unknown): StickerCfg {
  const value = raw as Partial<StickerCfg> | null
  const pos = Array.isArray(value?.position) ? value.position.map(Number) : DEFAULT_POS
  const rot = Array.isArray(value?.rotation) ? value.rotation.map(Number) : DEFAULT_ROT
  return {
    position: [pos[0] || 0, pos[1] || 0, pos[2] || 0],
    rotation: [rot[0] || 0, rot[1] || 0, rot[2] || 0],
    scale: Number.isFinite(Number(value?.scale)) ? Number(value?.scale) : DEFAULT_SCALE,
    assetUrl: typeof value?.assetUrl === 'string' ? value.assetUrl : undefined,
    originalName: typeof value?.originalName === 'string' ? value.originalName : undefined,
  }
}

type EditorState = {
  open: boolean; placeMode: boolean; files: string[]; configs: Record<string, StickerCfg>; selected: string | null; status: string; busy: boolean; baked: boolean
  toggle: () => void; setOpen: (open: boolean) => void; setPlaceMode: (open: boolean) => void; select: (file: string | null) => void
  load: () => Promise<void>; upload: (file?: File) => Promise<void>; update: (file: string, patch: Partial<StickerCfg>) => void; removeFile: (file: string) => void; save: () => Promise<boolean>
}

export const useStickerEditor = create<EditorState>((set, get) => ({
  open: false, placeMode: false, files: [], configs: {}, selected: null, status: '', busy: false, baked: false,
  toggle: () => set((state) => ({ open: !state.open })), setOpen: (open) => set({ open }), setPlaceMode: (placeMode) => set({ placeMode }), select: (selected) => set({ selected }),
  load: async () => {
    set({ busy: true, status: '正在读取云端贴纸...' })
    try {
      const data = await apiJson<{ stickers: Record<string, unknown> }>('/api/stickers')
      const configs = Object.fromEntries(Object.entries(data.stickers || {}).map(([id, value]) => [id, normalize(value)]))
      set({ configs, files: Object.keys(configs), status: '' })
    } catch (error) { set({ status: `加载失败: ${error instanceof Error ? error.message : String(error)}` }) }
    finally { set({ busy: false }) }
  },
  upload: async (file) => {
    if (!file) return
    set({ busy: true, status: `正在上传 ${file.name}...` })
    try {
      const data = await apiJson<{ sticker: StickerCfg & { id: string } }>('/api/stickers/upload', { method: 'POST', headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) }, body: file })
      const { id, ...config } = data.sticker
      set((state) => ({ files: [...state.files, id], configs: { ...state.configs, [id]: normalize(config) }, selected: id, status: '贴纸已上传，点击模型即可放置。' }))
    } catch (error) { set({ status: `上传失败: ${error instanceof Error ? error.message : String(error)}` }) }
    finally { set({ busy: false }) }
  },
  update: (file, patch) => set((state) => ({ configs: { ...state.configs, [file]: { ...(state.configs[file] || defaultCfg()), ...patch } }, baked: false })),
  removeFile: (file) => set((state) => { const configs = { ...state.configs }; delete configs[file]; return { files: state.files.filter((id) => id !== file), configs, selected: state.selected === file ? null : state.selected, status: '贴纸已从项目中移除，点击保存同步。' } }),
  save: async () => {
    set({ busy: true, status: '正在保存到云端...' })
    try { await apiJson('/api/stickers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stickers: get().configs }) }); set({ status: '贴纸位置已保存到你的云端项目。' }); return true }
    catch (error) { set({ status: `保存失败: ${error instanceof Error ? error.message : String(error)}` }); return false }
    finally { set({ busy: false }) }
  },
}))

type ModelUrlState = { url: string; file: string; selectFile: (file: string) => void; selectRemote: (file: string, url: string) => void; bump: () => void }
export const useModelUrl = create<ModelUrlState>((set) => ({
  url: `${import.meta.env.BASE_URL}models/liwei.rigged.glb`, file: 'liwei.rigged.glb',
  selectFile: (file) => set({ file, url: `${import.meta.env.BASE_URL}models/${encodeURIComponent(file)}?t=${Date.now()}` }),
  selectRemote: (file, url) => set({ file, url: `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` }),
  bump: () => set((state) => ({ url: `${import.meta.env.BASE_URL}models/${encodeURIComponent(state.file)}?t=${Date.now()}` })),
}))

type ManState = { man: THREE.Object3D | null; setMan: (man: THREE.Object3D | null) => void }
export const useMan = create<ManState>((set) => ({ man: null, setMan: (man) => set({ man }) }))
