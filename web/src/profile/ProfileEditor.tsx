import { useEffect } from 'react'
import { useProfileStore } from './store'
import './profile.css'

function Field({ label, value, multiline = false, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="pe-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

export default function ProfileEditor() {
  const open = useProfileStore((state) => state.open)
  const setOpen = useProfileStore((state) => state.setOpen)
  const load = useProfileStore((state) => state.load)
  const save = useProfileStore((state) => state.save)
  const usePreset = useProfileStore((state) => state.usePreset)
  const update = useProfileStore((state) => state.update)
  const updateAbout = useProfileStore((state) => state.updateAbout)
  const addFact = useProfileStore((state) => state.addFact)
  const updateFact = useProfileStore((state) => state.updateFact)
  const removeFact = useProfileStore((state) => state.removeFact)
  const config = useProfileStore((state) => state.config)
  const status = useProfileStore((state) => state.status)
  const busy = useProfileStore((state) => state.busy)
  const profile = config.custom

  useEffect(() => {
    if (open) load()
  }, [load, open])

  return (
    <div className="profile-editor">
      {open && (
        <div className="pe-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section className="pe-dialog" role="dialog" aria-modal="true" aria-label="个人资料编辑器" onClick={(event) => event.stopPropagation()}>
            <header className="pe-head">
              <div>
                <span>PROFILE EDITOR</span>
                <h2>个人资料</h2>
              </div>
              <button className="pe-close" onClick={() => setOpen(false)} aria-label="关闭资料编辑器">×</button>
            </header>

            <div className="pe-presetbar">
              <button className={config.mode === 'preset' ? 'is-active' : ''} onClick={usePreset}>预设 1</button>
              <span>{config.mode === 'preset' ? '正在使用原始资料' : '正在编辑自定义资料'}</span>
            </div>

            <div className="pe-body">
              <section className="pe-section">
                <h3>首屏信息</h3>
                <div className="pe-grid">
                  <Field label="姓名" value={profile.name} onChange={(value) => update({ name: value })} />
                  <Field label="职业" value={profile.role} onChange={(value) => update({ role: value })} />
                  <Field label="所在地" value={profile.location} onChange={(value) => update({ location: value })} />
                  <Field label="作品集标识" value={profile.portfolio} onChange={(value) => update({ portfolio: value })} />
                  <Field label="页脚信息" value={profile.footer} onChange={(value) => update({ footer: value })} />
                </div>
              </section>

              <section className="pe-section">
                <h3>自我介绍</h3>
                <Field label="中文标题" value={profile.about.zh.title} onChange={(value) => updateAbout('zh', { title: value })} />
                <Field label="中文介绍" value={profile.about.zh.paragraph} multiline onChange={(value) => updateAbout('zh', { paragraph: value })} />
                <Field label="English title" value={profile.about.en.title} onChange={(value) => updateAbout('en', { title: value })} />
                <Field label="English intro" value={profile.about.en.paragraph} multiline onChange={(value) => updateAbout('en', { paragraph: value })} />
              </section>

              <section className="pe-section">
                <div className="pe-section-head">
                  <h3>自定义信息</h3>
                  <button onClick={addFact}>新增</button>
                </div>
                {profile.facts.length === 0 ? <p className="pe-empty">可添加邮箱、个人网站、技能标签或其他资料。</p> : profile.facts.map((fact) => (
                  <div className="pe-fact" key={fact.id}>
                    <input value={fact.label} aria-label="信息标签" onChange={(event) => updateFact(fact.id, { label: event.target.value })} />
                    <input value={fact.value} aria-label="信息内容" onChange={(event) => updateFact(fact.id, { value: event.target.value })} />
                    <button onClick={() => removeFact(fact.id)} aria-label={`删除 ${fact.label}`}>×</button>
                  </div>
                ))}
              </section>
            </div>

            <footer className="pe-foot">
              <span>{status || '修改会实时呈现在首屏中'}</span>
              <button disabled={busy} onClick={save}>保存资料</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
