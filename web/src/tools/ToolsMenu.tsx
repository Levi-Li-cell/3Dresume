import { useEffect, useRef, useState } from 'react'
import { useDirectorStore } from '../director/store'
import { useStickerEditor } from '../editor/store'
import { useProfileStore } from '../profile/store'
import { useAuth } from '../product/auth'
import './tools-menu.css'

type Tool = 'stickers' | 'director' | 'profile'

const ITEMS: Array<{ id: Tool; label: string; detail: string }> = [
  { id: 'stickers', label: '贴纸', detail: '模型贴图' },
  { id: 'director', label: '运镜', detail: '关键帧镜头' },
  { id: 'profile', label: '资料', detail: '个人信息' },
]

export default function ToolsMenu() {
  const [expanded, setExpanded] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const stickersOpen = useStickerEditor((state) => state.open)
  const setStickersOpen = useStickerEditor((state) => state.setOpen)
  const directorOpen = useDirectorStore((state) => state.open)
  const setDirectorOpen = useDirectorStore((state) => state.setOpen)
  const profileOpen = useProfileStore((state) => state.open)
  const setProfileOpen = useProfileStore((state) => state.setOpen)
  const editorOpen = stickersOpen || directorOpen || profileOpen
  const account = useAuth((state) => state.account)
  const ready = useAuth((state) => state.ready)

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [])

  const openTool = (tool: Tool) => {
    setStickersOpen(tool === 'stickers')
    setDirectorOpen(tool === 'director')
    setProfileOpen(tool === 'profile')
    setExpanded(false)
  }

  if (editorOpen) return null

  if (!ready || !account?.unlocked) return (
    <a className="tm-unlock" href="/account" aria-label="解锁编辑器" title="解锁编辑器">
      <span>¥</span><b>3</b>
    </a>
  )

  return (
    <div className="tools-menu" ref={root}>
      <button
        className={`tm-trigger${expanded ? ' is-open' : ''}`}
        onClick={() => setExpanded((value) => !value)}
        aria-label="打开编辑工具"
        aria-expanded={expanded}
        aria-controls="editor-tools-menu"
        title="编辑工具"
      >
        <span />
        <span />
        <span />
      </button>
      {expanded && (
        <div className="tm-popover" id="editor-tools-menu" role="menu" aria-label="编辑工具">
          {ITEMS.map((item, index) => (
            <button key={item.id} role="menuitem" className="tm-item" onClick={() => openTool(item.id)}>
              <b>0{index + 1}</b>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <i aria-hidden="true">+</i>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
