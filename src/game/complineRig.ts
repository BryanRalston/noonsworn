import {
  AnimationMixer,
  CircleGeometry,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  SkinnedMesh,
  type AnimationAction,
  type AnimationClip,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/** 1.3 clips the halo at the wake spot. 1.25 still clips it once Sela has run to about (9, 10). */
export const COMPLINE_SCALE = 1.2

const FADE = 0.12
const POUR_START = 0.425
const POUR_END = 0.86
const SLAM_HIT = 0.56
const COLLAPSE = 0.75
const HALO_LAND = 1.622
const PUDDLE_R = 2.45

const CLIP_NAMES = ['idle', 'pour', 'slam', 'shudder', 'death'] as const
type ClipName = (typeof CLIP_NAMES)[number]

const BIT_POUR_START = 1
const BIT_POUR_END = 2
const BIT_SLAM = 4
const BIT_COLLAPSE = 8
const BIT_HALO = 16

export interface RigStep {
  pourStart: boolean
  pourEnd: boolean
  slamHit: boolean
  collapse: boolean
  haloLand: boolean
}

interface ClipEvent {
  name?: string
  t?: number
}

function eventAt(clip: AnimationClip, name: string, fallback: number): number {
  const events = (clip.userData as { events?: ClipEvent[] } | undefined)?.events
  if (!events) return fallback
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (ev?.name === name && typeof ev.t === 'number') return ev.t
  }
  return fallback
}

export interface ComplineRig {
  ready: () => boolean
  step: (dt: number) => RigStep
  play: (name: ClipName, force?: boolean) => void
  clip: () => string
  time: () => number
  span: () => number
  tris: () => number
  glow: (phase: number, dead: boolean) => void
  spread: (u: number) => void
  noteWarm: (renderer: WebGLRenderer, camera: Camera) => void
  dispose: () => void
}

export function attachCompline(parent: Object3D, fallback: Mesh): ComplineRig {
  const step: RigStep = { pourStart: false, pourEnd: false, slamHit: false, collapse: false, haloLand: false }
  const puddleGeo = new CircleGeometry(1, 20)
  // CircleGeometry faces +Z. rotateX(-90°) turns that normal to +Y, so the stain lies on the floor.
  puddleGeo.rotateX(-Math.PI / 2)
  const puddleMat = new MeshBasicMaterial({ color: 0x15121a, transparent: true, opacity: 0.92, depthWrite: true })
  const puddle = new Mesh(puddleGeo, puddleMat)
  puddle.name = 'complinePuddle'
  puddle.frustumCulled = false
  puddle.castShadow = false
  puddle.position.y = 0.03
  puddle.visible = false
  puddle.renderOrder = 2
  parent.add(puddle)

  let mixer: AnimationMixer | null = null
  let material: MeshStandardMaterial | null = null
  let skin: SkinnedMesh | null = null
  let current: AnimationAction | null = null
  let clipName = ''
  let seen = 0
  let queued: ClipName | null = null
  let pourStartT = POUR_START
  let pourEndT = POUR_END
  let slamHitT = SLAM_HIT
  let collapseT = COLLAPSE
  let haloLandT = HALO_LAND
  let triCount = 0
  let gpu: WebGLRenderer | null = null
  let cam: Camera | null = null
  const actions: Partial<Record<ClipName, AnimationAction>> = {}

  function cross(bit: number, t: number, at: number): boolean {
    if (seen & bit) return false
    if (t < at) return false
    seen |= bit
    return true
  }

  function play(name: ClipName, force = false) {
    if (!mixer) {
      queued = name
      return
    }
    if (clipName === 'death' && !force) return
    if (name === 'idle' && clipName === 'idle') return
    const next = actions[name]
    if (!next) return
    seen = 0
    if (current && current !== next) current.fadeOut(FADE)
    next.reset()
    if (name === 'idle') next.setLoop(LoopRepeat, Infinity)
    else {
      next.setLoop(LoopOnce, 1)
      next.clampWhenFinished = true
    }
    if (current && current !== next) next.fadeIn(FADE)
    next.play()
    current = next
    clipName = name
  }

  function mount(gltf: { scene: Object3D; animations: AnimationClip[] }) {
    let found: SkinnedMesh | null = null
    gltf.scene.traverse((obj) => {
      const mesh = obj as SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      if (!found) found = mesh
      else mesh.visible = false
    })
    if (!found) return
    const skinned: SkinnedMesh = found
    const source = (Array.isArray(skinned.material) ? skinned.material[0] : skinned.material) as MeshStandardMaterial
    if (!source?.isMeshStandardMaterial) return
    const clips: Partial<Record<ClipName, AnimationClip>> = {}
    for (let i = 0; i < CLIP_NAMES.length; i++) {
      const name = CLIP_NAMES[i]
      if (!name) continue
      const clip = gltf.animations.find((a) => a.name === name)
      if (!clip) return
      clips[name] = clip
    }
    const pour = clips.pour
    const slam = clips.slam
    const death = clips.death
    if (!pour || !slam || !death || !clips.idle || !clips.shudder) return
    pourStartT = eventAt(pour, 'pour_start', POUR_START)
    pourEndT = eventAt(pour, 'pour_end', POUR_END)
    slamHitT = eventAt(slam, 'slam_hit', SLAM_HIT)
    collapseT = eventAt(death, 'collapse', COLLAPSE)
    haloLandT = eventAt(death, 'halo_land', HALO_LAND)

    const mat = source.clone()
    mat.vertexColors = true
    mat.color.setRGB(1, 1, 1)
    mat.emissive.setRGB(1, 1, 1)
    mat.emissiveIntensity = 1.6
    mat.roughness = 0.78
    mat.metalness = 0
    if (mat.emissiveMap) {
      mat.emissiveMap.magFilter = NearestFilter
      mat.emissiveMap.minFilter = NearestFilter
      mat.emissiveMap.needsUpdate = true
    }
    skinned.material = mat
    skinned.frustumCulled = false
    skinned.castShadow = false
    skinned.name = 'complineMesh'
    const geo = skinned.geometry
    triCount = geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3

    // Asset front is +Z (cowl opening and ewer spout). The compline group's yaw is the only heading.
    gltf.scene.scale.setScalar(COMPLINE_SCALE)
    gltf.scene.frustumCulled = false
    gltf.scene.name = 'complineSkin'
    parent.add(gltf.scene)
    fallback.visible = false

    mixer = new AnimationMixer(gltf.scene)
    for (let i = 0; i < CLIP_NAMES.length; i++) {
      const name = CLIP_NAMES[i]
      const clip = name ? clips[name] : undefined
      if (!name || !clip) return
      actions[name] = mixer.clipAction(clip)
    }
    mixer.addEventListener('finished', (event) => {
      const action = (event as { action?: AnimationAction }).action
      if (!action || action !== current) return
      if (clipName === 'death') return
      play('idle')
    })
    material = mat
    skin = skinned
    play(queued ?? 'idle', true)
    queued = null
    if (gpu && cam) {
      const shown = parent.visible
      parent.visible = true
      gpu.compile(parent, cam)
      parent.visible = shown
    }
  }

  const url = `${import.meta.env.BASE_URL}assets/chars/compline_v2_meshopt.glb`
  void (async () => {
    try {
      await MeshoptDecoder.ready
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const gltf = await loader.loadAsync(url)
      mount(gltf)
    } catch (err) {
      console.error('compline glb failed', err)
    }
  })()

  return {
    ready: () => mixer !== null,
    step(dt) {
      step.pourStart = false
      step.pourEnd = false
      step.slamHit = false
      step.collapse = false
      step.haloLand = false
      if (!mixer || !current) return step
      mixer.update(dt)
      const t = current.time
      if (clipName === 'pour') {
        step.pourStart = cross(BIT_POUR_START, t, pourStartT)
        step.pourEnd = cross(BIT_POUR_END, t, pourEndT)
      } else if (clipName === 'slam') {
        step.slamHit = cross(BIT_SLAM, t, slamHitT)
      } else if (clipName === 'death') {
        step.collapse = cross(BIT_COLLAPSE, t, collapseT)
        step.haloLand = cross(BIT_HALO, t, haloLandT)
      }
      return step
    },
    play,
    clip: () => clipName,
    time: () => current?.time ?? 0,
    span: () => Math.max(0.05, pourEndT - pourStartT),
    tris: () => triCount,
    glow(phase, dead) {
      if (!material) return
      material.emissiveIntensity = dead ? 1.1 : phase >= 3 ? 3.2 : phase >= 2 ? 2.4 : 1.6
    },
    spread(u) {
      if (u <= 0.001) {
        puddle.visible = false
        return
      }
      puddle.visible = true
      puddle.scale.setScalar(PUDDLE_R * COMPLINE_SCALE * u)
    },
    noteWarm(renderer, camera) {
      gpu = renderer
      cam = camera
    },
    dispose() {
      mixer?.stopAllAction()
      puddleGeo.dispose()
      puddleMat.dispose()
      skin?.geometry.dispose()
      material?.dispose()
    },
  }
}
