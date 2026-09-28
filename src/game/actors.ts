import {
  AnimationMixer,
  Box3,
  CircleGeometry,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
  type Camera,
  type Object3D,
} from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { enemyTime } from '../render/instancing'

const CLIPS = ['idle', 'run', 'dash', 'attack_thrust', 'attack_slash', 'hit', 'death'] as const
type ClipName = (typeof CLIPS)[number]

export interface SelaFocus {
  x: number
  y: number
  h: number
  meters: number
}

export interface SelaView {
  root: Group
  halo: Object3D
  tris: number
  bones: number
  focus: SelaFocus
  matNote: string
  pose: (frame: SelaFrame) => void
}

export interface SelaFrame {
  dt: number
  speed: number
  cutting: boolean
  thrust: boolean
  slash: boolean
  hurt: boolean
  dead: boolean
  aspect: number
  camera: Camera
  viewW: number
  viewH: number
  hold?: string | null
  sparse?: boolean
}

const dark = new Color('#1B2A2E')
const gold = new Color('#E0A93A')
const feet = new Vector3()
const head = new Vector3()
const footNdc = new Vector3()
const headNdc = new Vector3()

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

export function createSela(gltf: GLTF): SelaView {
  const rig = gltf.scene
  rig.name = 'selaRig'
  let skinned: SkinnedMesh | null = null
  let halo: Object3D | null = rig.getObjectByName('halo') ?? null
  rig.traverse((obj) => {
    const mesh = obj as SkinnedMesh
    if (mesh.isSkinnedMesh) skinned = mesh
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
  if (!skinned) throw new Error('sela_rigged has no skinned mesh')
  if (!halo) throw new Error('sela_rigged has no halo')
  const skinnedMesh = skinned as SkinnedMesh
  const bodyMat = skinnedMesh.material as MeshStandardMaterial
  const beforeSpace = bodyMat.map?.colorSpace ?? 'none'
  const beforeNote = `metalness ${bodyMat.metalness} roughness ${bodyMat.roughness} colorSpace ${beforeSpace}`
  bodyMat.metalness = 0
  bodyMat.roughness = 0.75
  if (bodyMat.map) bodyMat.map.colorSpace = SRGBColorSpace
  bodyMat.emissive.set(0x000000)
  bodyMat.emissiveIntensity = 0
  bodyMat.emissiveMap = null
  bodyMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
outgoingLight += vec3(1.0, 0.82, 0.55) * fres * 0.16;
#include <opaque_fragment>`,
    )
  }
  const matNote = `before ${beforeNote}; after metalness 0 roughness 0.75 colorSpace ${bodyMat.map?.colorSpace ?? 'none'} emissive map off fresnel 0.16`
  const haloMesh = halo
  if ((haloMesh as Mesh).isMesh) {
    const mat = (haloMesh as Mesh).material as MeshStandardMaterial
    if (mat && mat.emissive) {
      mat.emissive.set('#E0A93A')
      mat.emissiveIntensity = 1.6
    }
  }
  const actions = new Map<ClipName, AnimationAction>()
  const mixer = new AnimationMixer(rig)
  for (let i = 0; i < CLIPS.length; i++) {
    const name = CLIPS[i]
    if (!name) continue
    const clip = gltf.animations.find((item) => item.name === name)
    if (!clip) throw new Error(`sela_rigged missing clip ${name}`)
    const action = mixer.clipAction(clip)
    action.clampWhenFinished = true
    actions.set(name, action)
  }
  const idle = actions.get('idle')
  if (!idle) throw new Error('sela idle missing')
  idle.setLoop(LoopRepeat, Infinity)
  idle.play()
  const rootBone = rig.getObjectByName('root')
  rig.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(rig)
  let authored = Math.max(0.2, bounds.max.y)
  let sized = false
  const visual = new Group()
  visual.name = 'selaVisual'
  // Asset faces +Z. Game heading is a local −Z front, so the mount turns 180°.
  visual.rotation.y = Math.PI
  visual.add(rig)
  const root = new Group()
  root.name = 'sela'
  root.add(createMarker(), visual)
  let current: ClipName = 'idle'
  let mixAcc = 0
  const focus: SelaFocus = { x: 0, y: 0, h: 0, meters: authored }

  function play(name: ClipName, loop: typeof LoopOnce | typeof LoopRepeat, restart: boolean) {
    const next = actions.get(name)
    if (!next) return
    next.setLoop(loop, loop === LoopOnce ? 1 : Infinity)
    next.clampWhenFinished = loop === LoopOnce
    if (current === name) {
      if (restart) next.reset().play()
      return
    }
    actions.get(current)?.fadeOut(0.1)
    next.reset().fadeIn(0.1).play()
    current = name
  }

  function oneShotBusy(): boolean {
    if (current !== 'hit' && current !== 'attack_thrust' && current !== 'attack_slash') return false
    const action = actions.get(current)
    if (!action) return false
    return action.isRunning() && action.time < action.getClip().duration - 0.04
  }

  return {
    root,
    halo: haloMesh,
    tris: triCount(rig),
    bones: skinnedMesh.skeleton.bones.length,
    matNote,
    focus,
    pose(frame) {
      const display = frame.aspect < 1 ? 1.5 : 1.25
      visual.scale.setScalar(display)
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
      const held = frame.hold && actions.has(frame.hold as ClipName) ? (frame.hold as ClipName) : null
      if (held) play(held, held === 'idle' || held === 'run' || held === 'dash' ? LoopRepeat : LoopOnce, false)
      else if (frame.dead) play('death', LoopOnce, false)
      else if (frame.hurt) play('hit', LoopOnce, true)
      else if (frame.cutting) play('dash', LoopRepeat, false)
      else if (frame.thrust) play('attack_thrust', LoopOnce, true)
      else if (frame.slash) play('attack_slash', LoopOnce, true)
      else if (!oneShotBusy()) play(frame.speed > 0.45 ? 'run' : 'idle', LoopRepeat, false)
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
