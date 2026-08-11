import * as THREE from 'three'
import type { DirectorKeyframe } from './types'

export type DirectorSample = Omit<DirectorKeyframe, 'id' | 'label' | 'frame'>

const ZERO: DirectorSample = {
  positionOffset: [0, 0, 0],
  focusOffset: [0, 0, 0],
  fovOffset: 0,
  bokehScale: -1,
  focusRange: -1,
}

function lerpVec(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [
    THREE.MathUtils.lerp(a[0] ?? 0, b[0] ?? 0, t),
    THREE.MathUtils.lerp(a[1] ?? 0, b[1] ?? 0, t),
    THREE.MathUtils.lerp(a[2] ?? 0, b[2] ?? 0, t),
  ]
}

export function sampleDirector(keyframes: readonly DirectorKeyframe[], frame: number): DirectorSample {
  if (!keyframes.length) return ZERO
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (frame <= first.frame) return first
  if (frame >= last.frame) return last
  const nextIndex = sorted.findIndex((key) => key.frame >= frame)
  const b = sorted[nextIndex]
  const a = sorted[nextIndex - 1]
  const t = (frame - a.frame) / Math.max(1, b.frame - a.frame)
  return {
    positionOffset: lerpVec(a.positionOffset, b.positionOffset, t),
    focusOffset: lerpVec(a.focusOffset, b.focusOffset, t),
    fovOffset: THREE.MathUtils.lerp(a.fovOffset, b.fovOffset, t),
    bokehScale: THREE.MathUtils.lerp(a.bokehScale, b.bokehScale, t),
    focusRange: THREE.MathUtils.lerp(a.focusRange, b.focusRange, t),
  }
}
