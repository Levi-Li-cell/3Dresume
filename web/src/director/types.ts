export type Vec3 = [number, number, number]

export type DirectorKeyframe = {
  id: string
  label: string
  frame: number
  positionOffset: Vec3
  focusOffset: Vec3
  fovOffset: number
  bokehScale: number
  focusRange: number
}

export type DirectorMode = 'preset' | 'custom'

export type DirectorConfig = {
  version: 2
  mode: DirectorMode
  keyframes: DirectorKeyframe[]
}

export type DirectorRuntime = {
  frame: number
  totalFrames: number
  bokehScale: number
  focusRange: number
}

export const EMPTY_DIRECTOR_CONFIG: DirectorConfig = {
  version: 2,
  mode: 'preset',
  keyframes: [],
}

export const EMPTY_RUNTIME: DirectorRuntime = {
  frame: 0,
  totalFrames: 350,
  bokehScale: 0,
  focusRange: 0.15,
}
