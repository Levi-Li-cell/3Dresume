import { useEffect } from 'react'
import { defaultCfg, useStickerEditor } from './store'
import type { StickerCfg } from './store'
import './editor.css'

const AXIS = [0, 1, 2] as const
const AXIS_LABEL = ['X', 'Y', 'Z']

function fmtTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const v = Number.isFinite(value) ? value : 0
  return (
    <label className="se-field">
      <span className="se-axis">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="se-val">{v.toFixed(3)}</span>
    </label>
  )
}

function StickerRow({ file }: { file: string }) {
  const cfg = useStickerEditor((s) => s.configs[file])
  const selected = useStickerEditor((s) => s.selected === file)
  const placeMode = useStickerEditor((s) => s.placeMode)
  const busy = useStickerEditor((s) => s.busy)
  const select = useStickerEditor((s) => s.select)
  const setPlaceMode = useStickerEditor((s) => s.setPlaceMode)
  const update = useStickerEditor((s) => s.update)
  const removeFile = useStickerEditor((s) => s.removeFile)
  const c: StickerCfg = cfg || defaultCfg()

  const setPos = (i: number, v: number) => {
    const p = [...c.position] as StickerCfg['position']
    p[i] = v
    update(file, { position: p })
  }
  const setRot = (i: number, v: number) => {
    const r = [...c.rotation] as StickerCfg['rotation']
    r[i] = v
    update(file, { rotation: r })
  }

  return (
    <div className={`se-row${selected ? ' se-selected' : ''}`} onClick={() => select(file)}>
      <div className="se-row-head">
        <img className="se-thumb" src={`/stickers/${file}`} alt={file} />
        <span className="se-name" title={file}>
          {file}
        </span>
        <button
          className={`se-btn${placeMode && selected ? ' se-active' : ''}`}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            select(file)
            setPlaceMode(!(placeMode && selected))
          }}
        >
          放置
        </button>
        <button
          className="se-btn se-danger"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`删除 ${file}？（同时删除 web/stickers 下的文件）`)) {
              removeFile(file)
            }
          }}
        >
          删除
        </button>
      </div>
      <div className="se-controls" onClick={(e) => e.stopPropagation()}>
        {AXIS.map((i) => (
          <Field
            key={'p' + i}
            label={'位置' + AXIS_LABEL[i]}
            value={c.position[i]}
            min={-0.8}
            max={0.8}
            step={0.005}
            onChange={(v) => setPos(i, v)}
          />
        ))}
        {AXIS.map((i) => (
          <Field
            key={'r' + i}
            label={'旋转' + AXIS_LABEL[i]}
            value={c.rotation[i]}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setRot(i, v)}
          />
        ))}
        <Field
          label="缩放"
          value={c.scale}
          min={0.02}
          max={0.5}
          step={0.005}
          onChange={(v) => update(file, { scale: v })}
        />
      </div>
    </div>
  )
}

export default function StickerEditor() {
  const open = useStickerEditor((s) => s.open)
  const setOpen = useStickerEditor((s) => s.setOpen)
  const load = useStickerEditor((s) => s.load)
  const files = useStickerEditor((s) => s.files)
  const status = useStickerEditor((s) => s.status)
  const busy = useStickerEditor((s) => s.busy)
  const placeMode = useStickerEditor((s) => s.placeMode)
  const setPlaceMode = useStickerEditor((s) => s.setPlaceMode)
  const save = useStickerEditor((s) => s.save)
  const rebuild = useStickerEditor((s) => s.rebuild)
  const selected = useStickerEditor((s) => s.selected)
  const snapshots = useStickerEditor((s) => s.snapshots)
  const selectedSnap = useStickerEditor((s) => s.selectedSnap)
  const setSelectedSnap = useStickerEditor((s) => s.setSelectedSnap)
  const loadSnapshots = useStickerEditor((s) => s.loadSnapshots)
  const saveSnapshot = useStickerEditor((s) => s.saveSnapshot)
  const rollbackTo = useStickerEditor((s) => s.rollbackTo)
  const restoreClean = useStickerEditor((s) => s.restoreClean)

  useEffect(() => {
    if (open) {
      load()
      loadSnapshots()
    }
  }, [open, load, loadSnapshots])

  const handleClean = () => {
    if (
      window.confirm(
        '将恢复干净模型并清空当前贴纸配置（会自动先保存一份“清理前快照”，可随时回滚），确定继续？'
      )
    ) {
      restoreClean()
    }
  }

  return (
    <div className="sticker-editor">
      {open && (
        <div className="se-panel">
          <div className="se-head">
            <span>贴纸编辑器</span>
            <button className="se-btn" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
          <div className="se-hint">
            1. 把贴图 (PNG / WebP) 放进 <code>web/stickers/</code> 目录<br />
            2. 选中贴纸 → 点击“放置” → 在模型脸上点击/拖拽摆放<br />
            3. 调整位置/旋转/缩放后点“保存配置” → “生成 GLB”烘焙进皮肤<br />
            提示：生成 GLB 会把贴纸烘焙进皮肤纹理，贴纸会跟随光照与材质
          </div>
          <div className="se-toolbar">
            <button
              className={`se-btn${placeMode ? ' se-active' : ''}`}
              disabled={!selected}
              onClick={() => setPlaceMode(!placeMode)}
            >
              {placeMode ? '放置模式：开' : '放置模式：关'}
            </button>
            <button className="se-btn" disabled={busy} onClick={load}>
              刷新
            </button>
            <button className="se-btn" disabled={busy} onClick={save}>
              保存配置
            </button>
            <button className="se-btn se-primary" disabled={busy} onClick={rebuild}>
              生成 GLB
            </button>
          </div>
          <div className="se-rollback">
            <div className="se-rollback-head">
              <span>回滚 / 快照</span>
              <button className="se-btn" disabled={busy} onClick={loadSnapshots}>
                刷新
              </button>
              <button className="se-btn" disabled={busy} onClick={saveSnapshot}>
                保存快照
              </button>
            </div>
            <div className="se-rollback-row">
              <select
                className="se-select"
                value={selectedSnap}
                disabled={busy}
                onChange={(e) => setSelectedSnap(e.target.value)}
              >
                <option value="">
                  {snapshots.length ? '选择快照…' : '暂无快照（生成 GLB 前会自动保存）'}
                </option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {fmtTime(s.time)} · {s.stickerCount} 张贴纸
                    {s.baked ? ' · 已烘焙' : ''}
                  </option>
                ))}
              </select>
              <button
                className="se-btn se-primary"
                disabled={busy || !selectedSnap}
                onClick={() => rollbackTo(selectedSnap)}
              >
                回滚到
              </button>
            </div>
            <div className="se-rollback-row">
              <button className="se-btn se-danger" disabled={busy} onClick={handleClean}>
                清理贴纸（恢复干净模型）
              </button>
            </div>
          </div>
          {status && <div className="se-status">{status}</div>}
          <div className="se-list">
            {files.length === 0 && (
              <div className="se-empty">还没有贴图，把 PNG/WebP 放进 web/stickers/</div>
            )}
            {files.map((f) => (
              <StickerRow key={f} file={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
