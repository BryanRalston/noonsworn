import {
  AnimationMixer,
  AnimationUtils,
  Box3,
  CircleGeometry,
  Color,
  DataTexture,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoColorSpace,
  ShaderMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Camera,
  type Object3D,
} from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { enemyTime } from '../render/instancing'

const CLIPS = [
  'idle',
  'run',
  'run_lean',
  'dash',
  'dash_slash',
  'attack_thrust',
  'attack_slash',
  'throw',
  'hit',
  'flinch',
  'death',
  'flourish',
  'victory',
] as const
type ClipName = (typeof CLIPS)[number]

const LOWER = /(^|\.)(root|hips|thigh_L|thigh_R|shin_L|shin_R|foot_L|foot_R)\./

export interface SelaFocus {
  x: number
  y: number
  h: number
  meters: number
}

export interface SelaCue {
  throwRelease: boolean
  slashHit: boolean
  flourishPeak: boolean
}

export interface SelaView {
  root: Group
  /** The spear mesh on hand_R. Hidden with the body during the hurt blink. */
  halo: Object3D
  tris: number
  bones: number
  focus: SelaFocus
  matNote: string
  cue: SelaCue
  spearTip: (out: Vector3) => void
  pose: (frame: SelaFrame) => void
}

export interface SelaFrame {
  dt: number
  speed: number
  cutting: boolean
  thrust: boolean
  slash: boolean
  throwing: boolean
  flourish: boolean
  victory: boolean
  hurt: boolean
  dead: boolean
  aspect: number
  camera: Camera
  viewW: number
  viewH: number
  hold?: string | null
  holdAt?: number
  sparse?: boolean
}

const dark = new Color('#1B2A2E')
const gold = new Color('#E0A93A')
const rimColor = new Color(0xffc98a)
const feet = new Vector3()
const head = new Vector3()
const footNdc = new Vector3()
const headNdc = new Vector3()
const hipWorld = new Vector3()
const endA = new Vector3()
const endB = new Vector3()

function triCount(obj: Object3D): number {
  let n = 0
  obj.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry
    n += geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3
  })
  return n
}

function createMarker(): Mesh {
  const geo = new CircleGeometry(0.8, 40)
  geo.rotateX(-Math.PI / 2)
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: true,
    uniforms: { uTime: enemyTime() },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float pulse = 0.72 + 0.28 * sin(uTime * 1.5);
        float stroke = smoothstep(0.55, 0.58, r) * (1.0 - smoothstep(0.62, 0.65, r));
        vec3 col = mix(vec3(${dark.r.toFixed(4)}, ${dark.g.toFixed(4)}, ${dark.b.toFixed(4)}), vec3(${gold.r.toFixed(4)}, ${gold.g.toFixed(4)}, ${gold.b.toFixed(4)}), stroke * pulse);
        gl_FragColor = vec4(col, mix(0.8, 0.95, stroke));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new Mesh(geo, mat)
  mesh.name = 'marker'
  mesh.position.y = 0.05
  mesh.renderOrder = 2
  mesh.frustumCulled = false
  return mesh
}

function makeToonRamp(): DataTexture {
  const steps = [0.46, 0.76, 1]
  const data = new Uint8Array(steps.length * 4)
  for (let i = 0; i < steps.length; i++) {
    const c = Math.round((steps[i] ?? 1) * 255)
    data[i * 4] = c
    data[i * 4 + 1] = c
    data[i * 4 + 2] = c
    data[i * 4 + 3] = 255
  }
  const tex = new DataTexture(data, steps.length, 1)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = NoColorSpace
  tex.needsUpdate = true
  return tex
}

function applyToon(mesh: Mesh, ramp: DataTexture, flash: { value: number }): void {
  const source = mesh.material
  const s = (Array.isArray(source) ? source[0] : source) as MeshStandardMaterial | undefined
  if (!s) return
  if (s.map) s.map.colorSpace = SRGBColorSpace
  const hasEmit = !!s.emissiveMap
  const t = new MeshToonMaterial({
    map: s.map ?? null,
    color: s.map ? 0xffffff : s.color ?? 0xffffff,
    vertexColors: !!s.vertexColors,
    emissiveMap: s.emissiveMap ?? null,
    emissive: hasEmit ? 0xffffff : 0x000000,
    emissiveIntensity: hasEmit ? 0.4 : 0,
    gradientMap: ramp,
  })
  t.name = s.name
  t.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rimColor }
    shader.uniforms.uRimK = { value: 0.45 }
    shader.uniforms.uFlash = flash
    shader.fragmentShader =
      'uniform vec3 uRim;\nuniform float uRimK;\nuniform float uFlash;\n' +
      shader.fragmentShader
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          { float fe = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance *= 0.6 + fe * fe; }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            float rb = smoothstep(0.58, 0.74, fr); outgoingLight += uRim * rb * uRimK * (0.30 + 0.70 * diffuseColor.rgb);
            outgoingLight = mix(outgoingLight, vec3(1.0, 0.93, 0.75), clamp(uFlash, 0.0, 1.0)); }
          #include <opaque_fragment>`,
        )
  }
  mesh.material = t
}

function clipNamed(gltf: GLTF, name: string): AnimationClip {
  const clip = gltf.animations.find((item) => item.name === name)
  if (!clip) throw new Error(`sela v7 missing clip ${name}`)
  return clip
}

function upperFlinch(gltf: GLTF): AnimationClip {
  const clip = clipNamed(gltf, 'flinch').clone()
  clip.tracks = clip.tracks.filter((track) => !LOWER.test(track.name))
  AnimationUtils.makeClipAdditive(clip, 0)
  return clip
}

export function createSela(gltf: GLTF): SelaView {
  const rig = gltf.scene
  rig.name = 'selaRig'
  let skinned: SkinnedMesh | null = null
  const spear = rig.getObjectByName('spear')
  rig.traverse((obj) => {
    const mesh = obj as SkinnedMesh
    if (mesh.isSkinnedMesh) skinned = mesh
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
  if (!skinned) throw new Error('sela v7 has no skinned mesh')
  if (!spear || !(spear as Mesh).isMesh) throw new Error('sela v7 has no spear on hand_R')
  const skinnedMesh = skinned as SkinnedMesh
  const ramp = makeToonRamp()
  const flashU = { value: 0 }
  rig.traverse((obj) => {
    const mesh = obj as Mesh
    if (mesh.isMesh) applyToon(mesh, ramp, flashU)
  })
  const matNote = 'toon ramp 0.46/0.76/1 rim #ffc98a 0.45 emissive glint 0.40'
  const actions = new Map<ClipName, AnimationAction>()
  const mixer = new AnimationMixer(rig)
  for (let i = 0; i < CLIPS.length; i++) {
    const name = CLIPS[i]
    if (!name || name === 'flinch') continue
    const action = mixer.clipAction(clipNamed(gltf, name))
    action.clampWhenFinished = true
    actions.set(name, action)
  }
  const flinch = mixer.clipAction(upperFlinch(gltf))
  flinch.clampWhenFinished = true
  flinch.setLoop(LoopOnce, 1)
  const idle = actions.get('idle')
  const run = actions.get('run')
  const lean = actions.get('run_lean')
  if (!idle || !run || !lean) throw new Error('sela locomotion missing')
  idle.setLoop(LoopRepeat, Infinity).play()
  run.setLoop(LoopRepeat, Infinity).play().setEffectiveWeight(0)
  lean.setLoop(LoopRepeat, Infinity).play().setEffectiveWeight(0)
  const rootBone = rig.getObjectByName('root')
  const hips = rig.getObjectByName('hips')
  rig.updateMatrixWorld(true)
  const spearMesh = spear as Mesh
  spearMesh.geometry.computeBoundingBox()
  const bounds = spearMesh.geometry.boundingBox
  const tipLocal = new Vector3()
  if (bounds && hips) {
    const size = bounds.getSize(new Vector3())
    const mid = bounds.getCenter(new Vector3())
    if (size.y >= size.x && size.y >= size.z) {
      endA.set(mid.x, bounds.min.y, mid.z)
      endB.set(mid.x, bounds.max.y, mid.z)
    } else if (size.z >= size.x) {
      endA.set(mid.x, mid.y, bounds.min.z)
      endB.set(mid.x, mid.y, bounds.max.z)
    } else {
      endA.set(bounds.min.x, mid.y, mid.z)
      endB.set(bounds.max.x, mid.y, mid.z)
    }
    hips.getWorldPosition(hipWorld)
    const wa = endA.clone().applyMatrix4(spearMesh.matrixWorld)
    const wb = endB.clone().applyMatrix4(spearMesh.matrixWorld)
    // The head is the end farther from the hips. forearm_R to hand_R is 0.210 m; the spear node hangs off hand_R.
    tipLocal.copy(wa.distanceToSquared(hipWorld) >= wb.distanceToSquared(hipWorld) ? endA : endB)
  }
  const boundsRig = new Box3().setFromObject(rig)
  let authored = Math.max(0.2, boundsRig.max.y)
  let sized = false
  const visual = new Group()
  visual.name = 'selaVisual'
  // Asset faces +Z (head sits in front of the hips on +Z). Game heading is a local −Z front, so the mount turns 180°.
  visual.rotation.y = Math.PI
  visual.add(rig)
  const root = new Group()
  root.name = 'sela'
  root.add(createMarker(), visual)
  let actionName: ClipName | null = null
  let fired = ''
  let flourishLatch = false
  let mixAcc = 0
  let squash = 0
  const focus: SelaFocus = { x: 0, y: 0, h: 0, meters: authored }
  const cue: SelaCue = { throwRelease: false, slashHit: false, flourishPeak: false }

  function actionOf(name: ClipName): AnimationAction | undefined {
    return actions.get(name)
  }

  function looping(name: ClipName): boolean {
    return name === 'idle' || name === 'run' || name === 'run_lean' || name === 'victory'
  }

  function startAction(name: ClipName, restart: boolean) {
    const next = actionOf(name)
    if (!next) return
    if (actionName === name && !restart) return
    if (actionName && actionName !== name) actionOf(actionName)?.fadeOut(0.08)
    next.setLoop(looping(name) ? LoopRepeat : LoopOnce, looping(name) ? Infinity : 1)
    next.clampWhenFinished = !looping(name)
    next.reset().fadeIn(0.08).play()
    actionName = name
    fired = ''
  }

  function actionBusy(): boolean {
    if (!actionName || actionName === 'hit' || actionName === 'victory' || actionName === 'death') return false
    const action = actionOf(actionName)
    if (!action) return false
    if (looping(actionName)) return true
    return action.isRunning() && action.time < action.getClip().duration - 0.04
  }

  function mark(name: ClipName, key: string, at: number, flag: keyof SelaCue) {
    if (actionName !== name || fired === key) return
    const action = actionOf(name)
    if (!action || action.time < at) return
    fired = key
    cue[flag] = true
  }

  return {
    root,
    halo: spearMesh,
    tris: triCount(rig),
    bones: skinnedMesh.skeleton.bones.length,
    matNote,
    focus,
    cue,
    spearTip(out) {
      root.updateMatrixWorld(true)
      out.copy(tipLocal).applyMatrix4(spearMesh.matrixWorld)
    },
    pose(frame) {
      cue.throwRelease = false
      cue.slashHit = false
      cue.flourishPeak = false
      const display = frame.aspect < 1 ? 1.5 : 1.25
      if (frame.hurt) {
        squash = 0.1
        flashU.value = 1
      } else {
        squash = Math.max(0, squash - frame.dt)
        flashU.value = Math.max(0, flashU.value - frame.dt / 0.08)
      }
      const squish = squash / 0.1
      visual.scale.set(display * (1 + 0.1 * squish), display * (1 - 0.1 * squish), display * (1 + 0.1 * squish))
      if (frame.dt > 0) {
        if (frame.sparse) {
          mixAcc += frame.dt
          if (mixAcc >= 1 / 30) {
            mixer.update(mixAcc)
            mixAcc = 0
          }
        } else mixer.update(frame.dt)
      }
      if (rootBone) {
        rootBone.position.x = 0
        rootBone.position.z = 0
      }
      const askedFlourish = frame.flourish
      if (askedFlourish) flourishLatch = true
      const held = frame.hold && actions.has(frame.hold as ClipName) ? (frame.hold as ClipName) : null
      let want: ClipName | null = null
      if (held) want = held
      else if (frame.dead) want = 'death'
      else if (frame.victory) want = 'victory'
      else if (frame.throwing) want = 'throw'
      else if (frame.cutting) want = 'dash_slash'
      else if (flourishLatch) want = 'flourish'
      else if (frame.thrust) want = 'attack_thrust'
      else if (frame.slash) want = 'attack_slash'
      else if (frame.hurt && !actionBusy()) want = 'hit'
      else if (actionBusy()) want = actionName
      if (want === 'flourish') flourishLatch = false
      const replay =
        (want === 'hit' && frame.hurt) ||
        (want === 'throw' && frame.throwing) ||
        (want === 'attack_thrust' && frame.thrust) ||
        (want === 'attack_slash' && frame.slash) ||
        (want === 'flourish' && askedFlourish)
      if (want) startAction(want, replay)
      else if (actionName) {
        actionOf(actionName)?.fadeOut(0.1)
        actionName = null
        fired = ''
      }
      if (held && frame.holdAt !== undefined && actionName) {
        const heldAction = actionOf(actionName)
        if (heldAction) heldAction.time = frame.holdAt
      }
      const aw = actionName ? (actionOf(actionName)?.getEffectiveWeight() ?? 0) : 0
      const lw = held ? 0 : 1 - Math.min(1, aw)
      const moving = frame.speed > 0.45
      const leanW = Math.min(1, Math.max(0, (frame.speed - 3.4) / 2.1))
      idle.setEffectiveWeight(lw * (moving ? 0 : 1))
      run.setEffectiveWeight(lw * (moving ? 1 - leanW : 0))
      lean.setEffectiveWeight(lw * (moving ? leanW : 0))
      if (frame.hurt && !frame.dead) flinch.reset().play()
      mark('throw', 'throw_release', 0.1667, 'throwRelease')
      mark('dash_slash', 'slash_hit', 0.2333, 'slashHit')
      mark('flourish', 'flourish_peak', 0.5, 'flourishPeak')
      if (!sized) {
        visual.scale.setScalar(1)
        root.updateMatrixWorld(true)
        const posed = new Box3().setFromObject(skinnedMesh)
        const top = posed.max.y - root.position.y
        if (top > 0.4 && top < 3) authored = top
        visual.scale.setScalar(display)
        sized = true
      }
      root.updateMatrixWorld(true)
      feet.set(0, 0, 0).applyMatrix4(root.matrixWorld)
      head.set(0, authored * display, 0).applyMatrix4(root.matrixWorld)
      footNdc.copy(feet).project(frame.camera)
      headNdc.copy(head).project(frame.camera)
      const midX = (footNdc.x + headNdc.x) * 0.5
      const midY = (footNdc.y + headNdc.y) * 0.5
      focus.x = (midX * 0.5 + 0.5) * frame.viewW
      focus.y = (-midY * 0.5 + 0.5) * frame.viewH
      focus.h = Math.abs(headNdc.y - footNdc.y) * 0.5 * frame.viewH
      focus.meters = authored * display
    },
  }
}
