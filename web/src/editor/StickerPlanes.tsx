import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { defaultCfg, useMan, useStickerEditor } from './store'

const STICKER_NAME = /^sticker\d*$/i
const PLACE_OFFSET = 0.012 // 贴纸离皮肤表面的间距，避免 z-fighting

/**
 * Canvas 内的贴纸编辑器平面：
 * - 隐藏 GLB 里已嵌入的 sticker* 节点（避免重复显示）
 * - 按 stickers.json 配置渲染每个贴纸平面（挂在 man 节点下，坐标与 add-stickers.cjs 完全一致）
 * - 放置模式：在模型脸上点击/拖拽，把贴纸贴到表面（沿法线对齐）
 */
export default function StickerPlanes() {
  const { camera, gl } = useThree()
  const planes = useRef<Map<string, THREE.Mesh>>(new Map())
  // 贴图原始高/宽比（scale 语义 = 最长边），用于按比例显示
  const aspects = useRef<Map<string, number>>(new Map())
  const dragging = useRef(false)
  const ndc = useRef(new THREE.Vector2())
  const raycaster = useRef(new THREE.Raycaster())

  const files = useStickerEditor((s) => s.files)
  const assetSignature = useStickerEditor((s) => s.files.map((file) => `${file}:${s.configs[file]?.assetUrl || ''}`).join('|'))
  const placeMode = useStickerEditor((s) => s.placeMode)
  const selected = useStickerEditor((s) => s.selected)
  const baked = useStickerEditor((s) => s.baked)
  const man = useMan((s) => s.man)

  // 创建/清理贴纸平面 + 隐藏 GLB 嵌入的贴纸
  useEffect(() => {
    if (!man) return
    man.traverse((o: any) => {
      if (o.isMesh && STICKER_NAME.test(o.name)) o.visible = false
    })
    const loader = new THREE.TextureLoader()
    const map = planes.current
    for (const f of files) {
      if (map.has(f)) continue
      const source = useStickerEditor.getState().configs[f]?.assetUrl || `${import.meta.env.BASE_URL}stickers/${f}`
      const tex = loader.load(source, (t) => {
        const img = t.image as HTMLImageElement | undefined
        const w = img?.naturalWidth || img?.width || 1
        const h = img?.naturalHeight || img?.height || 1
        aspects.current.set(f, h / w)
      })
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      mesh.name = 'editor-sticker'
      mesh.renderOrder = 10
      mesh.visible = !baked // 已烘焙时隐藏编辑器平面，避免重复显示
      man.add(mesh)
      map.set(f, mesh)
    }
    for (const [f, mesh] of [...map]) {
      if (!files.includes(f)) {
        man.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        map.delete(f)
        aspects.current.delete(f)
      }
    }
    return () => {
      for (const [f, mesh] of [...map]) {
        man.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        map.delete(f)
        aspects.current.delete(f)
      }
    }
  }, [assetSignature, files, man])

  // 每帧把配置同步到平面（拖动滑条时无需重建纹理/几何）
  // 烘焙后把所有编辑器平面隐藏
  useEffect(() => {
    for (const mesh of planes.current.values()) mesh.visible = !baked
  }, [baked])

  useFrame(() => {
    const state = useStickerEditor.getState()
    for (const [f, mesh] of planes.current) {
      const cfg = state.configs[f] || defaultCfg()
      mesh.position.set(cfg.position[0], cfg.position[1], cfg.position[2])
      mesh.rotation.set(
        (cfg.rotation[0] * Math.PI) / 180,
        (cfg.rotation[1] * Math.PI) / 180,
        (cfg.rotation[2] * Math.PI) / 180
      )
      // scale = 最长边长度；另一条边按贴图原始宽高比缩放
      const aspect = aspects.current.get(f) || 1
      const m = Math.max(aspect, 1)
      mesh.scale.set(cfg.scale / m, (cfg.scale * aspect) / m, 1)
    }
  })

  // 点击/拖拽放置
  useEffect(() => {
    const isPanel = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.('.sticker-editor')

    const getNdc = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      return ndc.current
    }

    const pick = (ndc2: THREE.Vector2): THREE.Intersection | null => {
      const m = useMan.getState().man
      if (!m) return null
      raycaster.current.setFromCamera(ndc2, camera)
      const hits = raycaster.current.intersectObject(m, true)
      return (
        hits.find(
          (h) =>
            (h.object as THREE.Mesh).isMesh &&
            !STICKER_NAME.test(h.object.name) &&
            h.object.name !== 'editor-sticker'
        ) || null
      )
    }

    const applyHit = (hit: THREE.Intersection) => {
      const m = useMan.getState().man
      const sel = useStickerEditor.getState().selected
      if (!m || !sel || !hit.face) return
      // 世界法线 -> man 局部法线
      const nWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      const pLocal = m.worldToLocal(hit.point.clone())
      const qLocal = m.worldToLocal(nWorld.add(hit.point.clone()))
      const nLocal = qLocal.sub(pLocal).normalize()
      const position: [number, number, number] = [
        pLocal.x + nLocal.x * PLACE_OFFSET,
        pLocal.y + nLocal.y * PLACE_OFFSET,
        pLocal.z + nLocal.z * PLACE_OFFSET,
      ]
      // 平面 +Z 朝向皮肤法线
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        nLocal
      )
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
      const rotation: [number, number, number] = [
        THREE.MathUtils.radToDeg(e.x),
        THREE.MathUtils.radToDeg(e.y),
        THREE.MathUtils.radToDeg(e.z),
      ]
      useStickerEditor.getState().update(sel, { position, rotation })
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || isPanel(e)) return
      const st = useStickerEditor.getState()
      if (!st.open || !st.placeMode || !st.selected) return
      const hit = pick(getNdc(e))
      if (hit) {
        applyHit(hit)
        dragging.current = true
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const hit = pick(getNdc(e))
      if (hit) applyHit(hit)
    }
    const onUp = () => {
      dragging.current = false
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [camera, gl, placeMode, selected])

  return null
}


