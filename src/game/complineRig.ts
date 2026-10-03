import {
  AnimationMixer,
  Bone,
  CircleGeometry,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/** Desktop visual scale. Portrait uses PORTRAIT_SCALE when the halo stays under the timer band. */
export const COMPLINE_SCALE = 1.2
const PORTRAIT_SCALE = 1.3

const FADE = 0.12
const POUR_START = 0.425
const POUR_END = 0.86
const SLAM_HIT = 0.56
const COLLAPSE = 0.75
const HALO_LAND = 1.622
const PUDDLE_R = 2.7
// Rest bounds of compline_h3d, mesh local, before the visual scale.
const REST_BOX: ReadonlyArray<readonly [number, number, number]> = [
  [-2.461, 0.009, -2.556],
  [2.49, 0.009, -2.556],
  [-2.461, 0.009, 2.737],
  [2.49, 0.009, 2.737],
  [-2.461, 6.475, -2.556],
  [2.49, 6.475, -2.556],
  [-2.461, 6.475, 2.737],
  [2.49, 6.475, 2.737],
]

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
  haloTop: (out: Vector3) => boolean
  /** Halo crown in the bone matrix from the last render. Does not update matrices. */
  haloSample: (out: Vector3) => boolean
  /** World points around the cloak: rest-bound corners plus the halo crown. */
  mark: (out: Vector3[]) => number
  /** Visual mesh scale only. Desktop stays at COMPLINE_SCALE. Portrait may use 1.3. Hitbox is unchanged. */
  fit: (portrait: boolean) => void
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
  let shown: Object3D | null = null
  let visualScale = COMPLINE_SCALE
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
  let slamAuthored = false
  let gpu: WebGLRenderer | null = null
  let cam: Camera | null = null
  let haloBone: Bone | null = null
  let upperR: Bone | null = null
  let forearmR: Bone | null = null
  let handR: Bone | null = null
  const actions: Partial<Record<ClipName, AnimationAction>> = {}
  // Centroid of the gold ewer on hand_R at slam_hit, bone-local. The spout is not along local +Y.
  const tipLocal = new Vector3(0.452, 0.355, -0.155)
  const yAxis = new Vector3(0, 1, 0)
  const tipAxis = tipLocal.clone().normalize()
  const vShoulder = new Vector3()
  const vTip = new Vector3()
  const vTarget = new Vector3()
  const vDir = new Vector3()
  const vAlong = new Vector3()
  const vHand0 = new Vector3()
  const qWorld = new Quaternion()
  const qParent = new Quaternion()
  const qTurn = new Quaternion()
  const qClipU = new Quaternion()
  const qClipF = new Quaternion()
  const qClipH = new Quaternion()
  const qPlantU = new Quaternion()
  const qPlantF = new Quaternion()
  const qPlantH = new Quaternion()


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
    const textured = !!mat.map
    mat.vertexColors = !textured
    mat.color.setRGB(1, 1, 1)
    mat.emissive.setRGB(1, 1, 1)
    mat.emissiveIntensity = 1.6
    mat.roughness = 0.78
    mat.metalness = 0
    if (mat.map) mat.map.channel = 1
    // The h3d albedo already carries its tone. The stone lift washes that texture and pales the water.
    if (!textured) {
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 stoneC = diffuseColor.rgb;
  float stoneHi = max(stoneC.r, max(stoneC.g, stoneC.b));
  float stoneLo = min(stoneC.r, min(stoneC.g, stoneC.b));
  float stoneL = dot(stoneC, vec3(0.2126, 0.7152, 0.0722));
  bool stoneSkip = stoneL < 0.16;
  #ifdef USE_EMISSIVEMAP
    if (vEmissiveMapUv.x > 0.25) stoneSkip = true;
  #endif
  if (stoneC.r > stoneC.g * 1.65 && stoneC.r > stoneC.b * 1.65 && stoneHi - stoneLo > 0.08) stoneSkip = true;
  if (stoneC.b < stoneC.g * 0.55 && stoneC.r > stoneC.b * 1.45 && stoneHi > 0.2) stoneSkip = true;
  if (!stoneSkip) {
    stoneC = mix(stoneC, vec3(stoneL), 0.30);
    stoneC *= 1.23;
    diffuseColor.rgb = stoneC;
  }
}
`,
        )
      }
      mat.customProgramCacheKey = () => 'compline-stone-m5b4'
    }
    slamAuthored = textured
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
    shown = gltf.scene
    shown.scale.setScalar(visualScale)
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
    haloBone = skinned.skeleton.getBoneByName('halo') ?? null
    upperR = skinned.skeleton.getBoneByName('upperarm_R') ?? null
    forearmR = skinned.skeleton.getBoneByName('forearm_R') ?? null
    handR = skinned.skeleton.getBoneByName('hand_R') ?? null
    play(queued ?? 'idle', true)
    queued = null
    if (gpu && cam) {
      const shown = parent.visible
      parent.visible = true
      gpu.compile(parent, cam)
      parent.visible = shown
    }
  }

  const url = `${import.meta.env.BASE_URL}assets/chars/compline_h3d_meshopt.glb`
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

  // Swing `localAxis` (unit, bone space) onto a unit world direction.
  function pointBone(bone: Bone, localAxis: Vector3, dir: Vector3) {
    bone.updateWorldMatrix(true, false)
    bone.getWorldQuaternion(qWorld)
    vAlong.copy(localAxis).applyQuaternion(qWorld)
    const len = vAlong.length()
    if (len < 1e-5) return
    vAlong.multiplyScalar(1 / len)
    qTurn.setFromUnitVectors(vAlong, dir)
    qTurn.multiply(qWorld)
    const parent = bone.parent
    if (!parent) return
    parent.getWorldQuaternion(qParent)
    bone.quaternion.copy(qParent.invert()).multiply(qTurn)
  }

  // The clip holds the ewer about 1.5 m up, out to the statue's right. Aim that chain at the floor under it.
  function plantSlamHand() {
    if (slamAuthored) return
    if (clipName !== 'slam' || !upperR || !forearmR || !handR || !current) return
    const d = current.time - slamHitT
    let w = 0
    if (d >= -0.22 && d <= 0.16) w = d < 0 ? (d + 0.22) / 0.22 : 1 - d / 0.16
    if (w <= 0) return
    upperR.updateWorldMatrix(true, false)
    upperR.getWorldPosition(vShoulder)
    parent.updateWorldMatrix(true, false)
    parent.getWorldPosition(vTarget)
    parent.getWorldQuaternion(qWorld)
    // Model faces local +Z. The ewer hangs on local -X, so the slam lands in front and on that side.
    vAlong.set(0, 0, 1).applyQuaternion(qWorld)
    vAlong.y = 0
    if (vAlong.lengthSq() < 1e-6) vAlong.set(0, 0, 1)
    vAlong.normalize()
    vDir.set(-1, 0, 0).applyQuaternion(qWorld)
    vDir.y = 0
    if (vDir.lengthSq() < 1e-6) vDir.set(-1, 0, 0)
    vDir.normalize()
    vTarget.addScaledVector(vAlong, 2.15).addScaledVector(vDir, 0.55)
    vTarget.y = 0.35
    vDir.copy(vTarget).sub(vShoulder)
    const dist = vDir.length()
    if (dist < 0.2) return
    vDir.multiplyScalar(1 / dist)
    qClipU.copy(upperR.quaternion)
    qClipF.copy(forearmR.quaternion)
    qClipH.copy(handR.quaternion)
    vHand0.copy(handR.position)
    pointBone(upperR, yAxis, vDir)
    pointBone(forearmR, yAxis, vDir)
    pointBone(handR, tipAxis, vDir)
    qPlantU.copy(upperR.quaternion)
    qPlantF.copy(forearmR.quaternion)
    qPlantH.copy(handR.quaternion)
    forearmR.updateWorldMatrix(true, false)
    const e = forearmR.matrixWorld.elements
    const sy = Math.hypot(e[4] ?? 0, e[5] ?? 0, e[6] ?? 0) || 1
    handR.updateWorldMatrix(true, false)
    vTip.copy(tipLocal).applyMatrix4(handR.matrixWorld)
    const short = vDir.dot(vTarget.sub(vTip))
    const extra = Math.min(1.6, Math.max(-0.6, short / sy))
    forearmR.getWorldQuaternion(qWorld)
    vAlong.copy(vDir).applyQuaternion(qWorld.invert())
    upperR.quaternion.copy(qClipU).slerp(qPlantU, w)
    forearmR.quaternion.copy(qClipF).slerp(qPlantF, w)
    handR.quaternion.copy(qClipH).slerp(qPlantH, w)
    handR.position.copy(vHand0).addScaledVector(vAlong, extra * w)
  }

  function sampleHalo(out: Vector3): boolean {
    if (!haloBone) return false
    // Ring radius is 0.62 m and the ring tilts back. This local point is the high side of that ring.
    out.set(0, 0.58, -0.28).applyMatrix4(haloBone.matrixWorld)
    return true
  }

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
      plantSlamHand()
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
        if (skin) skin.visible = true
        return
      }
      // The puddle covers the sink. Hiding the body keeps the death frame at one draw.
      puddle.visible = true
      if (skin) skin.visible = false
      puddle.scale.setScalar(PUDDLE_R * visualScale * u)
    },
    fit(portrait) {
      const next = portrait ? PORTRAIT_SCALE : COMPLINE_SCALE
      if (next === visualScale) return
      visualScale = next
      shown?.scale.setScalar(next)
    },
    noteWarm(renderer, camera) {
      gpu = renderer
      cam = camera
    },
    haloTop(out) {
      if (!haloBone) return false
      haloBone.updateWorldMatrix(true, false)
      return sampleHalo(out)
    },
    haloSample(out) {
      if (!haloBone) return false
      return sampleHalo(out)
    },
    mark(out) {
      if (!shown) return 0
      shown.updateWorldMatrix(true, true)
      let n = 0
      for (let i = 0; i < REST_BOX.length; i++) {
        const p = REST_BOX[i]
        const slot = out[n]
        if (!p || !slot) break
        slot.set(p[0], p[1], p[2]).applyMatrix4(shown.matrixWorld)
        n++
      }
      const crown = out[n]
      if (crown && sampleHalo(crown)) n++
      return n
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
