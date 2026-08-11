import { useEffect, type ReactNode } from 'react'
import { useDirectorStore } from './store'
import type { DirectorKeyframe, Vec3 } from './types'
import './director.css'

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="de-field">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value.toFixed(step < 0.1 ? 2 : 0)}{suffix}</output>
    </label>
  )
}

function VectorFields({
  title,
  value,
  min,
  max,
  step,
  onChange,
}: {
  title: string
  value: Vec3
  min: number
  max: number
  step: number
  onChange: (value: Vec3) => void
}) {
  const setAxis = (axis: number, number: number) => {
    const next = [...value] as Vec3
    next[axis] = number
    onChange(next)
  }
  return (
    <section className="de-group">
      <h3>{title}</h3>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => (
        <RangeField
          key={axis}
          label={axis}
          value={value[index]}
          min={min}
          max={max}
          step={step}
          onChange={(number) => setAxis(index, number)}
        />
      ))}
    </section>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="de-panel">{children}</div>
}

export default function DirectorEditor() {
  const open = useDirectorStore((state) => state.open)
  const toggle = useDirectorStore((state) => state.toggle)
  const load = useDirectorStore((state) => state.load)
  const save = useDirectorStore((state) => state.save)
  const config = useDirectorStore((state) => state.config)
  const selectedId = useDirectorStore((state) => state.selectedId)
  const select = useDirectorStore((state) => state.select)
  const previewFrame = useDirectorStore((state) => state.previewFrame)
  const setPreviewFrame = useDirectorStore((state) => state.setPreviewFrame)
  const runtime = useDirectorStore((state) => state.runtime)
  const addKeyframe = useDirectorStore((state) => state.addKeyframe)
  const removeSelected = useDirectorStore((state) => state.removeSelected)
  const updateSelected = useDirectorStore((state) => state.updateSelected)
  const status = useDirectorStore((state) => state.status)
  const busy = useDirectorStore((state) => state.busy)
  const selected = config.keyframes.find((key) => key.id === selectedId) ?? null
  const frame = previewFrame ?? runtime.frame

  useEffect(() => {
    if (open) load()
  }, [load, open])

  const patch = (value: Partial<DirectorKeyframe>) => updateSelected(value)

  return (
    <div className="director-editor">
      <button className="de-fab" onClick={toggle} title="打开运镜编辑器">
        运镜
      </button>
      {open && (
        <Panel>
          <header className="de-head">
            <div>
              <span className="de-kicker">CAMERA DIRECTOR</span>
              <h2>滚动运镜</h2>
            </div>
            <button className="de-icon" onClick={toggle} aria-label="关闭运镜编辑器">×</button>
          </header>

          <div className="de-transport">
            <div className="de-readout"><b>{Math.round(frame)}</b> / {runtime.totalFrames} 帧</div>
            <input
              className="de-timeline"
              type="range"
              min="0"
              max={runtime.totalFrames}
              step="1"
              value={Math.min(frame, runtime.totalFrames)}
              onChange={(e) => setPreviewFrame(Number(e.target.value))}
            />
            <div className="de-actions">
              <button className="de-btn" onClick={() => setPreviewFrame(null)}>返回滚动</button>
              <button className="de-btn de-accent" onClick={addKeyframe}>在此加帧</button>
            </div>
          </div>

          <div className="de-keyframes" aria-label="关键帧列表">
            {config.keyframes.length === 0 ? (
              <p>当前直接播放 GLB 原始相机动画。拖动时间轴后，在任意位置添加修正关键帧。</p>
            ) : (
              config.keyframes.map((key) => (
                <button
                  className={`de-key${key.id === selectedId ? ' is-selected' : ''}`}
                  key={key.id}
                  onClick={() => { select(key.id); setPreviewFrame(key.frame) }}
                >
                  <span>{key.label}</span><b>{key.frame}</b>
                </button>
              ))
            )}
          </div>

          {selected ? (
            <div className="de-controls">
              <div className="de-selected-head">
                <input value={selected.label} onChange={(e) => patch({ label: e.target.value })} aria-label="关键帧名称" />
                <button className="de-danger" onClick={removeSelected}>删除</button>
              </div>
              <RangeField label="帧位置" value={selected.frame} min={0} max={runtime.totalFrames} step={1} onChange={(value) => { patch({ frame: value }); setPreviewFrame(value) }} />
              <VectorFields title="镜头偏移（世界坐标）" value={selected.positionOffset} min={-4} max={4} step={0.01} onChange={(value) => patch({ positionOffset: value })} />
              <VectorFields title="聚焦偏移（世界坐标）" value={selected.focusOffset} min={-2} max={2} step={0.01} onChange={(value) => patch({ focusOffset: value })} />
              <section className="de-group">
                <h3>镜头与景深</h3>
                <RangeField label="视角 FOV" value={selected.fovOffset} min={-18} max={18} step={0.1} suffix="°" onChange={(value) => patch({ fovOffset: value })} />
                <RangeField label="虚化强度" value={selected.bokehScale} min={0} max={20} step={0.1} onChange={(value) => patch({ bokehScale: value })} />
                <RangeField label="清晰范围" value={selected.focusRange} min={0.01} max={4} step={0.01} onChange={(value) => patch({ focusRange: value })} />
              </section>
            </div>
          ) : null}

          <footer className="de-foot">
            <span>{status || '修改会立刻反映在画面中'}</span>
            <button className="de-btn de-save" disabled={busy} onClick={save}>保存配置</button>
          </footer>
        </Panel>
      )}
    </div>
  )
}
