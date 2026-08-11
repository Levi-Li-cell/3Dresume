import { useEffect, useRef } from 'react'
import { defaultCfg, useStickerEditor, type StickerCfg } from './store'
import './editor.css'

const AXIS = [0, 1, 2] as const
const AXIS_LABEL = ['X', 'Y', 'Z']

function Field({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="se-field"><span className="se-axis">{label}</span><input type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /><span className="se-val">{value.toFixed(3)}</span></label>
}

function StickerRow({ id }: { id: string }) {
  const config = useStickerEditor((state) => state.configs[id]) || defaultCfg()
  const selected = useStickerEditor((state) => state.selected === id)
  const placeMode = useStickerEditor((state) => state.placeMode)
  const busy = useStickerEditor((state) => state.busy)
  const select = useStickerEditor((state) => state.select)
  const setPlaceMode = useStickerEditor((state) => state.setPlaceMode)
  const update = useStickerEditor((state) => state.update)
  const removeFile = useStickerEditor((state) => state.removeFile)
  const setAxis = (field: 'position' | 'rotation', index: number, value: number) => { const next = [...config[field]] as StickerCfg[typeof field]; next[index] = value; update(id, { [field]: next }) }
  return <div className={`se-row${selected ? ' se-selected' : ''}`} onClick={() => select(id)}>
    <div className="se-row-head"><img className="se-thumb" src={config.assetUrl} alt={config.originalName || id} /><span className="se-name" title={config.originalName || id}>{config.originalName || id}</span><button className={`se-btn${placeMode && selected ? ' se-active' : ''}`} disabled={busy} onClick={(event) => { event.stopPropagation(); select(id); setPlaceMode(!(placeMode && selected)) }}>放置</button><button className="se-btn se-danger" disabled={busy} onClick={(event) => { event.stopPropagation(); removeFile(id) }}>移除</button></div>
    <div className="se-controls" onClick={(event) => event.stopPropagation()}>
      {AXIS.map((index) => <Field key={`p${index}`} label={`位置 ${AXIS_LABEL[index]}`} value={config.position[index]} min={-0.8} max={0.8} step={0.005} onChange={(value) => setAxis('position', index, value)} />)}
      {AXIS.map((index) => <Field key={`r${index}`} label={`旋转 ${AXIS_LABEL[index]}`} value={config.rotation[index]} min={-180} max={180} step={1} onChange={(value) => setAxis('rotation', index, value)} />)}
      <Field label="缩放" value={config.scale} min={0.02} max={0.5} step={0.005} onChange={(value) => update(id, { scale: value })} />
    </div>
  </div>
}

export default function StickerEditor() {
  const open = useStickerEditor((state) => state.open)
  const setOpen = useStickerEditor((state) => state.setOpen)
  const load = useStickerEditor((state) => state.load)
  const upload = useStickerEditor((state) => state.upload)
  const files = useStickerEditor((state) => state.files)
  const status = useStickerEditor((state) => state.status)
  const busy = useStickerEditor((state) => state.busy)
  const save = useStickerEditor((state) => state.save)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) void load() }, [load, open])
  return <div className="sticker-editor">{open && <div className="se-panel"><div className="se-head"><span>贴纸编辑器</span><button className="se-btn" onClick={() => setOpen(false)}>关闭</button></div><div className="se-hint">上传 PNG、JPG 或 WebP 贴纸，然后在模型上点击放置。位置、旋转、缩放会保存到你的 Supabase 项目配置，贴纸文件存放在 Vercel Blob。</div><div className="se-toolbar"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} /><button className="se-btn" disabled={busy} onClick={() => input.current?.click()}>上传贴纸</button><button className="se-btn" disabled={busy} onClick={() => void load()}>刷新</button><button className="se-btn se-primary" disabled={busy} onClick={() => void save()}>保存配置</button></div>{status && <div className="se-status">{status}</div>}<div className="se-list">{files.length === 0 && <div className="se-empty">还没有贴纸。上传一张 PNG、JPG 或 WebP 开始编辑。</div>}{files.map((id) => <StickerRow key={id} id={id} />)}</div></div>}</div>
}
