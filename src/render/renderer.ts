import { DirectionalLight, Fog, HemisphereLight, Scene, WebGLRenderer, type PerspectiveCamera } from 'three'
import { COLOR, HEX } from '../data/palette'
import { TUNING } from '../data/tuning'

export interface Gpu {
  renderer: WebGLRenderer
  scene: Scene
  sunLight: DirectionalLight
  resize: (ratio: number) => void
  setFog: (on: boolean) => void
  readStats: () => { calls: number; triangles: number; geometries: number; textures: number }
}

export function createGpu(canvas: HTMLCanvasElement, camera: PerspectiveCamera, antialias: boolean): Gpu {
  const gl = canvas.getContext('webgl2', {
    powerPreference: 'high-performance',
    antialias,
    alpha: false,
    stencil: false,
    depth: true,
  })
  if (!gl) throw new Error('WebGL2 unavailable')
  const renderer = new WebGLRenderer({
    canvas,
    context: gl,
    antialias,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  })
  renderer.outputColorSpace = 'srgb'
  renderer.toneMapping = 0
  renderer.shadowMap.enabled = false
  renderer.info.autoReset = false
  renderer.setClearColor(HEX.sky, 1)
  const scene = new Scene()
  scene.background = COLOR.sky
  const fill = new HemisphereLight(HEX.sky, HEX.shade, 0.85)
  const sunLight = new DirectionalLight(HEX.sunlit, 1.35)
  sunLight.position.set(12, 10, 4)
  scene.add(fill, sunLight, sunLight.target)
  let fogOn = false
  const fog = new Fog(HEX.shadeDeep, TUNING.arena.fogNear, TUNING.arena.fogFar)

  function resize(ratio: number) {
    const w = Math.max(1, window.innerWidth)
    const h = Math.max(1, window.innerHeight)
    camera.aspect = w / h
    camera.fov = camera.aspect < 1 ? TUNING.camera.fovPortrait : TUNING.camera.fov
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(ratio)
    renderer.setSize(w, h, false)
  }

  return {
    renderer,
    scene,
    sunLight,
    resize,
    setFog(on: boolean) {
      fogOn = on
      scene.fog = fogOn ? fog : null
    },
    readStats() {
      const calls = renderer.info.render.calls
      const triangles = renderer.info.render.triangles
      const geometries = renderer.info.memory.geometries
      const textures = renderer.info.memory.textures
      renderer.info.reset()
      return { calls, triangles, geometries, textures }
    },
  }
}
