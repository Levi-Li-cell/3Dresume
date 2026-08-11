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

export type DirectorConfig = {
  version: 1
  keyframes: DirectorKeyframe[]
}

export type DirectorRuntime = {
  frame: number
  totalFrames: number
  bokehScale: number
  focusRange: number
}

export const EMPTY_DIRECTOR_CONFIG: DirectorConfig = {
  version: 1,
  keyframes: [],
}

export const EMPTY_RUNTIME: DirectorRuntime = {
  frame: 0,
  totalFrames: 350,
  bokehScale: 0,
  focusRange: 0.15,
}
