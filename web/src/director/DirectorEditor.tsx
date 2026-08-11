import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDirectorStore } from './store'
import type { DirectorKeyframe, Vec3 } from './types'
import { useModelUrl } from '../editor/store'
import { apiJson, supabaseClient } from '../product/api'
import { upload as uploadBlob } from '@vercel/blob/client'
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

function ModelPicker() {
  const [files, setFiles] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  const currentFile = useModelUrl((state) => state.file)
  const selectFile = useModelUrl((state) => state.selectFile)
  const selectRemote = useModelUrl((state) => state.selectRemote)

  const refresh = async () => {
    setStatus('正在读取 models 文件夹...')
    try {
      const data = await apiJson<any>('/api/models')
      if (!data.ok) throw new Error(data.error || '读取失败')
      setFiles(data.files || [])
      setStatus(data.files?.length ? '' : '未找到 GLB。请先将文件放入 web/public/models/。')
    } catch (error) {
      setStatus(`读取失败: ${String(error)}`)
    }
  }

  const apply = async (file: string) => {
    setStatus(`正在应用 ${file}...`)
    try {
      const data = await apiJson<any>('/api/models')
      if (data.model?.file !== file) throw new Error('模型已被新的上传覆盖，请刷新列表')
      if (data.model?.url) selectRemote(file, data.model.url)
      else selectFile(file)
      setStatus('已应用。缺少相机或 focus 节点的模型会使用自动居中与静态镜头。')
    } catch (error) {
      setStatus(`应用失败: ${String(error)}`)
    }
  }

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) return setStatus('仅支持 .glb 文件。')
    if (file.size > 50 * 1024 * 1024) return setStatus('模型文件不能超过 50 MB。')
    setStatus(`正在上传 ${file.name}...`)
    try {
      const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      if (String.fromCharCode(...magic) !== 'glTF') throw new Error('文件不是有效的 GLB 二进制格式')
      const { data: session } = await supabaseClient().auth.getSession()
      const token = session.session?.access_token
      const userId = session.session?.user.id
      if (!token || !userId) throw new Error('请先登录')
      const name = file.name.replace(/[^\w. -]/g, '').replace(/\s+/g, '-').slice(0, 120)
      const blob = await uploadBlob(`sen-3d/${userId}/models/${name}`, file, { access: 'public', contentType: 'model/gltf-binary', multipart: file.size > 4 * 1024 * 1024, handleUploadUrl: '/api/models/upload', headers: { authorization: `Bearer ${token}` } })
      await apiJson('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: blob.pathname.split('/').pop(), originalName: file.name, url: blob.url, size: file.size }) })
      const data: any = { ok: true, model: { file: blob.pathname.split('/').pop() || file.name, url: blob.url } }
      if (!data.ok) throw new Error(data.error || '上传失败')
      selectRemote(data.model.file, data.model.url)
      await refresh()
      setStatus('模型已上传。缺少相机或 focus 节点时将使用兼容模式。')
    } catch (error) { setStatus(`上传失败: ${String(error)}`) }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="de-models">
      <div className="de-models-head">
        <div>
          <span className="de-kicker">MODEL LIBRARY</span>
          <h3>选择模型</h3>
        </div>
        <div><input ref={uploadRef} type="file" accept=".glb,model/gltf-binary" hidden onChange={(event) => void upload(event.target.files?.[0])} /><button className="de-btn" onClick={() => uploadRef.current?.click()}>上传 GLB</button><button className="de-btn" onClick={refresh}>刷新</button></div>
      </div>
      <p className="de-models-hint">上传 GLB 后会保存至你的项目，文件上限为 50 MB。</p>
      <div className="de-model-list">
        {files.map((file) => (
          <button
            className={`de-model${file === currentFile ? ' is-selected' : ''}`}
            key={file}
            onClick={() => apply(file)}
          >
            <span>{file}</span>
            <b>{file === currentFile ? '当前' : '应用'}</b>
          </button>
        ))}
      </div>
      {status && <p className="de-model-status">{status}</p>}
    </div>
  )
}

export default function DirectorEditor() {
  const open = useDirectorStore((state) => state.open)
  const setOpen = useDirectorStore((state) => state.setOpen)
  const load = useDirectorStore((state) => state.load)
  const save = useDirectorStore((state) => state.save)
  const config = useDirectorStore((state) => state.config)
  const selectedId = useDirectorStore((state) => state.selectedId)
  const select = useDirectorStore((state) => state.select)
  const previewFrame = useDirectorStore((state) => state.previewFrame)
  const setPreviewFrame = useDirectorStore((state) => state.setPreviewFrame)
  const runtime = useDirectorStore((state) => state.runtime)
  const addKeyframe = useDirectorStore((state) => state.addKeyframe)
  const setMode = useDirectorStore((state) => state.setMode)
  const removeSelected = useDirectorStore((state) => state.removeSelected)
  const updateSelected = useDirectorStore((state) => state.updateSelected)
  const status = useDirectorStore((state) => state.status)
  const busy = useDirectorStore((state) => state.busy)
  const selected = config.keyframes.find((key) => key.id === selectedId) ?? null
  const frame = previewFrame ?? runtime.frame
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    if (open) load()
  }, [load, open])

  const patch = (value: Partial<DirectorKeyframe>) => updateSelected(value)

  return (
    <div className="director-editor">
      {open && (
        <Panel>
          <header className="de-head">
            <div>
              <span className="de-kicker">CAMERA DIRECTOR</span>
              <h2>滚动运镜</h2>
            </div>
            <button className="de-icon" onClick={() => setOpen(false)} aria-label="关闭运镜编辑器">×</button>
          </header>

          <div className="de-modebar">
            <button
              className={`de-mode${config.mode === 'preset' && !modelOpen ? ' is-active' : ''}`}
              onClick={() => { setMode('preset'); setModelOpen(false) }}
            >
              预设 1
            </button>
            <button
              className={`de-mode${config.mode === 'custom' && !modelOpen ? ' is-active' : ''}`}
              onClick={() => { setMode('custom'); setModelOpen(false) }}
            >
              自定义
            </button>
            <button className={`de-mode${modelOpen ? ' is-active' : ''}`} onClick={() => setModelOpen((value) => !value)}>
              模型
            </button>
          </div>

          {modelOpen ? <ModelPicker /> : (
            <>
              {config.mode === 'custom' && <p className="de-custom-note">自定义模式已冻结 GLB 相机路径。使用关键帧的镜头偏移和聚焦偏移来编排新运镜。</p>}

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
              <p>{config.mode === 'custom' ? '时间轴已经交给你。拖动到任意帧后添加关键帧，镜头会始终朝向你设定的聚焦点。' : '当前播放预设 1：GLB 原始相机动画。切换到“自定义”可从空关键帧开始。'}</p>
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
            </>
          )}
        </Panel>
      )}
    </div>
  )
}
