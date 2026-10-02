import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  ShaderMaterial,
  Vector4,
  WebGLRenderer,
  Camera,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32, type Rng } from '../core/rng'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import { octDist, slideCircle } from './collision'
import { damageAmount } from './sunClock'

const V_MAX = 18
const B_MAX = 8
const EYE = new Color(0.75, 0.95, 1)
const GOLD = COLOR.sunGold
const CRIMSON = COLOR.crimson

export interface CastHooks {
  hurt: (amount: number, floorHp: boolean) => void
  slow: (seconds: number) => void
  pushPlayer: (x: number, z: number) => void
  vulnerable: () => boolean
  each: (fn: (index: number, x: number, z: number) => void) => void
  damage: (index: number, base: number, source: 'weapon' | 'cut', might: number) => number
  place: (index: number, x: number, z: number) => void
  stagger: (index: number, seconds: number) => void
  wash: (index: number, seconds: number) => void
  xp: (x: number, z: number, value: number) => void
  ping: (x: number, z: number, lit: boolean) => void
  spawn: (kind: 0 | 1, x: number, z: number) => void
  cull: (n: number) => void
  track: (at: { x: number; z: number; r: number } | null) => void
  sfx: (name: string) => void
}

export interface CastQuery {
  under: (x: number, z: number) => boolean
  direct: (x: number, z: number) => boolean
  deep: (x: number, z: number) => boolean
  lit: (x: number, z: number) => boolean
  brim: () => boolean
}

export interface CastVisual {
  pull: number
  warn: number
  glyph: number
  crest: number
  dry: number
  hold: boolean
  lane0: Vector4
  lane1: Vector4
  laneT: number
  lanePhase: number
  slamX: number
  slamZ: number
  slamR: number
  fan: number
}

export interface CastPeek {
  votaries: { x: number; z: number; hp: number; mode: number; flash: number; wash: number; yaw: number }[]
  blots: { x: number; z: number; hp: number; mode: number; yaw: number; t: number; vx: number; vz: number }[]
  boss: { x: number; z: number; y: number; hp: number; max: number; phase: number; on: number; dead: number; rise: number }
  vis: { pull: number; warn: number; glyph: number; crest: number; dry: number; hold: number; fan: number; laneT: number; slamR: number; lane0: number[]; lane1: number[]; pours: number; slams: number }
  tris: { votary: number; blot: number; boss: number; ewer: number }
}

export interface CloisterCast {
  reset: () => void
  tick: (dt: number, time: number, cycle: number, px: number, pz: number, might: number, lite?: boolean) => void
  warm: (renderer: WebGLRenderer, camera: Camera) => void
  soak: (x: number, z: number, radius: number, base: number, source: 'weapon' | 'cut', might: number, stamp: number) => boolean
  cut: (sx: number, sz: number, ex: number, ez: number, active: boolean, id: number, radius: number, damage: number, might: number) => void
  touch: (px: number, pz: number) => number
  spawnVotary: (x: number, z: number) => void
  placeVotary: (x: number, z: number) => void
  spawnBlot: (x: number, z: number) => void
  peek: () => CastPeek
  plan: (time: number) => { votary: number; boss: boolean }
  visuals: () => CastVisual
  occluders: () => { x: number; z: number; r: number }[]
  cleared: () => boolean
  bossing: () => boolean
  phase: () => number
  debugPhase: (phase: number) => void
  times: () => { wake: number; p2: number; p3: number; dead: number }
  dispose: () => void
}

interface Foe {
  alive: number
  x: number
  z: number
  hp: number
  yaw: number
  t: number
  cd: number
  wash: number
  flash: number
  heading: number
  mode: number
  vx: number
  vz: number
  scan: number
  best: number
}

function blank(): Foe {
  return { alive: 0, x: 0, z: 0, hp: 0, yaw: 0, t: 0, cd: 0, wash: 0, flash: 0, heading: 0, mode: 0, vx: 0, vz: 0, scan: 0, best: 1e9 }
}

function tint(geo: BufferGeometry, color: Color) {
  const n = geo.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
}

function votaryGeo(): BufferGeometry {
  const robe = new CylinderGeometry(0.28, 0.46, 1.05, 6, 1)
  robe.translate(0, 0.62, 0)
  tint(robe, new Color(1, 1, 1))
  const hood = new ConeGeometry(0.3, 0.48, 6)
  hood.translate(0, 1.32, 0)
  tint(hood, new Color(1, 1, 1))
  const eyeL = new SphereGeometry(0.045, 4, 3)
  eyeL.translate(-0.08, 1.22, 0.16)
  tint(eyeL, EYE)
  const eyeR = new SphereGeometry(0.045, 4, 3)
  eyeR.translate(0.08, 1.22, 0.16)
  tint(eyeR, EYE)
  const geo = mergeGeometries([robe, hood, eyeL, eyeR], false)
  if (!geo) throw new Error('votary')
  robe.dispose()
  hood.dispose()
  eyeL.dispose()
  eyeR.dispose()
  return geo
}

function blotGeo(): BufferGeometry {
  const disc = new CylinderGeometry(1.15, 1.2, 0.12, 8, 1)
  tint(disc, new Color(0.05, 0.04, 0.08))
  const lip = TorusLike()
  const eyes = [ -0.28, 0, 0.28 ]
  const parts: BufferGeometry[] = [disc, lip]
  for (let i = 0; i < eyes.length; i++) {
    const eye = new SphereGeometry(0.07, 4, 3)
    eye.translate(eyes[i] ?? 0, 0.1, 0.55)
    tint(eye, EYE)
    parts.push(eye)
  }
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('blot')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

function TorusLike(): BufferGeometry {
  const lip = new CylinderGeometry(1.22, 1.05, 0.16, 8, 1)
  lip.translate(0, 0.08, 0)
  tint(lip, new Color(0.08, 0.05, 0.12))
  return lip
}

const FOE_VERT = /* glsl */ `
precision mediump float;
attribute float aHot;
attribute vec3 color;
varying vec3 vNormal;
varying vec3 vColor;
varying float vHot;
uniform float uTime;
void main() {
  vec3 p = position;
  p.x += sin(position.y * 5.0 + uTime * 1.8) * 0.03;
  p.z += sin(position.x * 3.0 - uTime * 2.4) * 0.02;
  #ifdef USE_INSTANCING
    vec3 nrm = mat3(instanceMatrix) * normal;
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  #else
    vec3 nrm = normal;
    vec4 wp = modelMatrix * vec4(p, 1.0);
  #endif
  vNormal = normalize(nrm);
  vColor = color;
  vHot = aHot;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FOE_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
varying float vHot;
void main() {
  vec3 ink = vec3(0.15, 0.06, 0.16);
  vec3 gold = vec3(0.91, 0.72, 0.29);
  vec3 lapis = vec3(0.24, 0.31, 0.60);
  vec3 base = ink;
  if (vHot > 1.5) base = mix(ink, lapis, 0.8);
  else if (vHot > 0.5) base = mix(ink, gold, 0.62);
  float ndl = clamp(dot(normalize(vNormal), normalize(vec3(-0.35, 0.86, -0.35))), 0.0, 1.0);
  vec3 col = base * mix(0.5, 1.12, ndl) * vColor;
  gl_FragColor = vec4(col, 1.0);
}
`

function foeMat(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: FOE_VERT,
    fragmentShader: FOE_FRAG,
  })
}

const BOSS_SCALE = 1
const LOOP_R = 12
const STONE = new Color('#D9CBB0')
const STONE_DEEP = new Color('#B8A88C')
const FACE = new Color('#100c0a')
const HEM = new Color('#1A1410')
const EYE_GOLD = new Color('#E8C36A')

interface BossView {
  mesh: Mesh
  uTime: { value: number }
  uPour: { value: number }
  uPhase: { value: number }
  uShudder: { value: number }
  uDrink: { value: number }
}

function stampPart(geo: BufferGeometry, color: Color, part: number): BufferGeometry {
  const n = geo.getAttribute('position').count
  const col = new Float32Array(n * 3)
  const parts = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
    parts[i] = part
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.setAttribute('aPart', new Float32BufferAttribute(parts, 1))
  return geo
}

function paintLathe(geo: BufferGeometry, part: number): BufferGeometry {
  const pos = geo.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const parts = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ang = Math.atan2(x, z)
    let color = y < 2.4 ? STONE_DEEP : STONE
    if (y < 0.2) color = HEM
    else if ((y > 0.24 && y < 0.4) || (y > 5.9 && y < 6.15)) color = GOLD
    if (Math.abs(ang) < 0.72 && y > 0.36 && y < 5.05) color = CRIMSON
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
    parts[i] = part
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.setAttribute('aPart', new Float32BufferAttribute(parts, 1))
  return geo
}

function lathe(pts: Vector2[], seg: number, part: number): BufferGeometry {
  return paintLathe(new LatheGeometry(pts, seg), part)
}

function buildBoss(): BossView {
  const bell = lathe(
    [
      new Vector2(2.7, 0),
      new Vector2(3.45, 0.12),
      new Vector2(3.3, 0.4),
      new Vector2(2.85, 1.2),
      new Vector2(2.35, 2.5),
      new Vector2(2.15, 3.7),
      new Vector2(2.45, 4.55),
      new Vector2(2.85, 5.15),
      new Vector2(2.3, 5.7),
      new Vector2(1.55, 6.2),
    ],
    22,
    0,
  )
  const face = new CylinderGeometry(1.02, 1.02, 0.06, 14)
  face.rotateX(0.42)
  face.translate(0, 6.32, 0.28)
  stampPart(face, FACE, 0)
  const rim = new TorusGeometry(1.12, 0.11, 6, 18)
  rim.rotateX(-1.15)
  rim.translate(0, 6.32, 0.28)
  stampPart(rim, STONE_DEEP, 0)
  const lining = new TorusGeometry(0.92, 0.07, 5, 16)
  lining.rotateX(-1.15)
  lining.translate(0, 6.4, 0.42)
  stampPart(lining, CRIMSON, 0)
  const eyeL = new SphereGeometry(0.16, 7, 5)
  eyeL.translate(-0.42, 6.48, 0.4)
  stampPart(eyeL, EYE_GOLD, 2)
  const eyeR = new SphereGeometry(0.16, 7, 5)
  eyeR.translate(0.42, 6.48, 0.4)
  stampPart(eyeR, EYE_GOLD, 2)
  const arm = new CylinderGeometry(0.28, 0.34, 1.55, 6, 1)
  arm.rotateZ(-Math.PI / 3)
  arm.translate(2.7, 4.35, 0.3)
  stampPart(arm, STONE, 1)
  const bowl = new CylinderGeometry(0.58, 0.82, 2.15, 10, 1)
  bowl.translate(3.7, 3.25, 0.5)
  stampPart(bowl, GOLD, 1)
  const neck = new CylinderGeometry(0.26, 0.42, 0.55, 8, 1)
  neck.translate(3.7, 4.55, 0.5)
  stampPart(neck, GOLD, 1)
  const lip = new CylinderGeometry(0.66, 0.3, 0.22, 10, 1)
  lip.translate(3.7, 4.9, 0.5)
  stampPart(lip, GOLD, 1)
  const handle = new TorusGeometry(0.52, 0.07, 5, 10)
  handle.rotateY(Math.PI / 2)
  handle.translate(4.35, 3.7, 0.5)
  stampPart(handle, GOLD, 1)
  const halo = new TorusGeometry(1.25, 0.045, 6, 24)
  halo.rotateX(Math.PI / 2)
  halo.translate(0, 7.15, -0.15)
  stampPart(halo, GOLD, 2)
  const hemRing = new TorusGeometry(3.42, 0.045, 4, 24)
  hemRing.rotateX(Math.PI / 2)
  hemRing.translate(0, 0.32, 0)
  stampPart(hemRing, GOLD, 0)
  const parts: BufferGeometry[] = [bell, face, rim, lining, eyeL, eyeR, arm, bowl, neck, lip, handle, halo, hemRing]
  for (let i = 0; i < 4; i++) {
    const ang = (i - 1.5) * 0.42
    const drip = new BoxGeometry(0.34, 1.35, 0.16)
    drip.translate(Math.sin(ang) * 3.15, 0.85, Math.cos(ang) * 3.15)
    stampPart(drip, HEM, 3)
    parts.push(drip)
  }
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('compline')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  const uTime = { value: 0 }
  const uPour = { value: 0 }
  const uPhase = { value: 1 }
  const uShudder = { value: 0 }
  const uDrink = { value: 0 }
  const mat = new ShaderMaterial({
    uniforms: { uTime, uPour, uPhase, uShudder, uDrink },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aPart;
      uniform float uTime;
      uniform float uPour;
      uniform float uShudder;
      uniform float uDrink;
      varying vec3 vColor;
      varying vec3 vN;
      varying float vPart;
      void main() {
        vec3 p = position;
        float h = clamp(position.y / 6.9, 0.0, 1.0);
        p.x += sin(uTime * 0.65) * 0.09 * h;
        p.z += cos(uTime * 0.5) * 0.045 * h;
        p.x += sin(uTime * 23.0 + position.y * 2.2) * uShudder * 0.07 * h;
        p.z += uDrink * h * 0.42;
        if (aPart > 0.5 && aPart < 1.5) {
          vec3 pivot = vec3(2.05, 5.15, 0.15);
          vec3 q = p - pivot;
          float a = -uPour * 0.9;
          float cs = cos(a);
          float sn = sin(a);
          float y = q.y * cs - q.z * sn;
          float z = q.y * sn + q.z * cs;
          q.y = y;
          q.z = z;
          p = q + pivot;
        }
        if (aPart > 2.5) {
          p.y -= 0.12 * (0.5 + 0.5 * sin(uTime * 1.2 + position.x * 3.0));
        }
        vN = normalize(normalMatrix * normal);
        vColor = color;
        vPart = aPart;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec3 vColor;
      varying vec3 vN;
      varying float vPart;
      uniform float uPhase;
      void main() {
        float ndl = clamp(dot(normalize(vN), normalize(vec3(-0.35, 0.86, -0.3))), 0.0, 1.0);
        vec3 col = vColor * mix(0.58, 1.12, ndl);
        if (vPart > 1.5 && vPart < 2.5) col += vec3(0.95, 0.78, 0.34) * (0.55 + 0.35 * uPhase);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new Mesh(geo, mat)
  mesh.name = 'compline'
  mesh.scale.setScalar(BOSS_SCALE)
  mesh.frustumCulled = false
  mesh.castShadow = false
  return { mesh, uTime, uPour, uPhase, uShudder, uDrink }
}

const loopPt = { x: 0, z: 0 }
const outPt = { x: 0, z: 0 }

function outward(x: number, z: number, ap: number): { x: number; z: number } {
  const o = octDist(x, z)
  if (o < 1e-3) {
    outPt.x = 0
    outPt.z = -ap
    return outPt
  }
  const s = ap / o
  outPt.x = x * s
  outPt.z = z * s
  return outPt
}

function laneHit(px: number, pz: number, lane: Vector4, half: number): boolean {
  const ax = lane.x
  const az = lane.y
  const bx = lane.z
  const bz = lane.w
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-4) return false
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const qx = ax + dx * t - px
  const qz = az + dz * t - pz
  return qx * qx + qz * qz <= half * half
}

export function createCast(parent: Object3D, hooks: CastHooks, ask: CastQuery): CloisterCast {
  let rng: Rng = mulberry32(7)
  const votaries: Foe[] = []
  const blots: Foe[] = []
  for (let i = 0; i < V_MAX; i++) votaries.push(blank())
  for (let i = 0; i < B_MAX; i++) blots.push(blank())
  const vGeo = votaryGeo()
  const bGeo = blotGeo()
  const vHot = new InstancedBufferAttribute(new Float32Array(V_MAX), 1)
  const bHot = new InstancedBufferAttribute(new Float32Array(B_MAX), 1)
  vHot.setUsage(DynamicDrawUsage)
  bHot.setUsage(DynamicDrawUsage)
  vGeo.setAttribute('aHot', vHot)
  bGeo.setAttribute('aHot', bHot)
  const vMat = foeMat()
  const bMat = foeMat()
  const vMesh = new InstancedMesh(vGeo, vMat, V_MAX)
  const bMesh = new InstancedMesh(bGeo, bMat, B_MAX)
  vMesh.frustumCulled = false
  bMesh.frustumCulled = false
  vMesh.count = 0
  bMesh.count = 0
  const bossParts = buildBoss()
  bossParts.mesh.visible = false
  parent.add(vMesh, bMesh, bossParts.mesh)
  const trackPt = { x: 0, z: 0, r: 0 }
  const occPool = [
    { x: 0, z: 0, r: 0 },
    { x: 0, z: 0, r: 0 },
    { x: 0, z: 0, r: 0 },
    { x: 0, z: 0, r: 0 },
  ]
  const occOut: { x: number; z: number; r: number }[] = []
  const summonQ = Array.from({ length: 12 }, () => ({ kind: 0, x: 0, z: 0 }))
  let qHead = 0
  let qCount = 0
  let qTail = 0
  let steerTick = 0
  function trackBoss() {
    trackPt.x = bossX
    trackPt.z = bossZ
    trackPt.r = specBoss.radius
    hooks.track(trackPt)
  }
  function enqueue(kind: number, x: number, z: number) {
    if (qCount >= summonQ.length) return
    const slot = summonQ[qTail]
    if (!slot) return
    slot.kind = kind
    slot.x = x
    slot.z = z
    qTail = (qTail + 1) % summonQ.length
    qCount++
  }
  function dequeue() {
    if (qCount <= 0) return
    const slot = summonQ[qHead]
    qHead = (qHead + 1) % summonQ.length
    qCount--
    if (!slot) return
    if (slot.kind === 1) spawnVotary(slot.x, slot.z)
    else if (slot.kind === 2) spawnBlot(slot.x, slot.z)
  }
  const dummy = new Object3D()
  const lane0 = new Vector4()
  const lane1 = new Vector4()
  const visual: CastVisual = {
    pull: 0, warn: 0, glyph: 0, crest: 0, dry: 0, hold: false,
    lane0, lane1, laneT: 0, lanePhase: 0, slamX: 0, slamZ: 0, slamR: 0, fan: 0,
  }
  let selaWash = -1
  let refill = 0
  let cowlCd = 0
  let bossOn = false
  let bossDead = false
  let bossHp = 0
  let bossX = 0
  let bossZ = -6
  let bossY = 0
  let phase = 0
  let bossT = 0
  let born = false
  let rise = 0
  let riseHit = false
  let pourCd = 1.2
  let pourT = 0
  let pourOn = false
  let slamCd = 2
  let slamT = 0
  let selfCd = 6
  let selfT = 0
  let drink = 0
  let stamp = 1e9
  let proc = false
  let blotGen = 0
  let prevCycle = 4
  let washGen = -1
  const washed = new Uint8Array(480)
  let force = 0
  let forceCrest = 0
  let hold = false
  let dry = 0
  let p2at = 0
  let p3at = 0
  let deadAt = 0
  let wakeAt = 0
  let contactCd = 0
  let poursFired = 0
  let slamsFired = 0
  let enrage = 1
  let shudder = 0
  const specV = TUNING.cloister.votary
  const specB = TUNING.cloister.blot
  const specBoss = TUNING.cloister.boss

  function living(list: Foe[]): number {
    let n = 0
    for (let i = 0; i < list.length; i++) {
      const foe = list[i]
      if (foe?.alive && foe.mode !== 3) n++
    }
    return n
  }

  function take(list: Foe[]): Foe | null {
    for (let i = 0; i < list.length; i++) {
      const foe = list[i]
      if (foe && !foe.alive) return foe
    }
    return null
  }

  function sync(mesh: InstancedMesh, list: Foe[], hot: InstancedBufferAttribute, yFor: (foe: Foe) => number, sFor: (foe: Foe) => number) {
    let n = 0
    for (let i = 0; i < list.length; i++) {
      const foe = list[i]
      if (!foe?.alive) continue
      const s = sFor(foe)
      dummy.position.set(foe.x, yFor(foe), foe.z)
      dummy.rotation.set(0, foe.yaw, 0)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      const hotV = foe.flash > 0 ? 2 : foe.wash > 0 || foe.mode === 2 ? 1 : 0
      hot.setX(n, hotV)
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    hot.needsUpdate = true
  }

  function placeVotary(x: number, z: number) {
    const foe = take(votaries)
    if (!foe) return
    foe.alive = 1
    foe.x = x
    foe.z = z
    foe.hp = specV.hp
    foe.yaw = 0
    foe.t = 0
    foe.cd = 0
    foe.wash = 0
    foe.flash = 0
    foe.heading = Math.atan2(-z, -x || 1)
    foe.mode = 0
    foe.vx = 0
    foe.vz = -1
  }

  function spawnVotary(x: number, z: number) {
    if (octDist(x, z) < 10) {
      outward(x, z, 14)
      placeVotary(outPt.x, outPt.z)
      return
    }
    placeVotary(x, z)
  }

  function spawnBlot(tx: number, tz: number) {
    if (living(blots) >= 4) return
    const foe = take(blots)
    if (!foe) return
    const j = (rng() - 0.5) * ((20 * Math.PI) / 180)
    const c = Math.cos(j)
    const s = Math.sin(j)
    const dock = outward(tx * c - tz * s, tx * s + tz * c, specB.dock)
    foe.alive = 1
    foe.x = dock.x * 0.15
    foe.z = dock.z * 0.15
    foe.vx = dock.x
    foe.vz = dock.z
    foe.hp = specB.hp
    foe.mode = 0
    foe.t = 0
    foe.cd = 1.2
    foe.wash = 0
    foe.flash = 0
    foe.yaw = Math.atan2(dock.z, dock.x)
    hooks.sfx('blot_rise')
  }

  function wake(time: number) {
    born = true
    bossOn = true
    bossDead = false
    bossHp = specBoss.hp
    phase = 1
    bossX = 0
    bossZ = -8.4
    bossY = -1.6
    rise = 3
    riseHit = false
    bossT = 0
    wakeAt = time
    pourCd = 1.4
    slamCd = 3
    selfCd = 8
    hold = false
    dry = 0
    bossParts.mesh.visible = true
    hooks.cull(40)
    trackBoss()
    hooks.sfx('compline_wake')
  }

  function killBoss(time: number) {
    if (!bossOn) return
    bossOn = false
    bossDead = true
    phase = 0
    deadAt = time
    hold = false
    hooks.track(null)
    hooks.sfx('compline_drink')
    visual.fan = 1
    if (dry > 0.05) refill = 3
    else dry = 0
  }

  function hurtBoss(base: number, _source: 'weapon' | 'cut', might: number, time: number) {
    if (!bossOn || rise > 0) return false
    const exposed = ask.lit(bossX, bossZ)
    const deep = ask.deep(bossX, bossZ)
    let m = 1 + TUNING.passive.might * might
    if (exposed) m *= TUNING.exposedDamage
    else if (deep) m *= TUNING.cloister.deepBoss
    else m *= TUNING.cloister.shadeBoss
    bossHp -= base * m
    hooks.ping(bossX, bossZ, exposed)
    if (bossHp <= specBoss.hp * 0.6 && phase === 1) {
      phase = 2
      p2at = time
      shudder = 1
      if (!ask.brim()) force = TUNING.cloister.wash.telegraph
      hold = true
    }
    if (bossHp <= specBoss.hp * 0.25 && phase === 2) {
      phase = 3
      p3at = time
      shudder = 1
      hold = false
      drink = 0
    }
    if (bossHp <= 0) killBoss(time)
    return true
  }

  function armLanes(px: number, pz: number, dual: boolean) {
    const dx = px - bossX
    const dz = pz - bossZ
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len
    const uz = dz / len
    const pxn = -uz
    const pzn = ux
    const span = 16
    const off = dual ? 1.5 : 0
    lane0.set(bossX + pxn * off, bossZ + pzn * off, bossX + ux * span + pxn * off, bossZ + uz * span + pzn * off)
    lane1.set(bossX - pxn * off, bossZ - pzn * off, bossX + ux * span - pxn * off, bossZ + uz * span - pzn * off)
    if (!dual) lane1.set(0, 0, 0, 0)
    pourOn = true
    pourT = 0.8
    visual.lanePhase = 0
    poursFired++
    hooks.sfx('compline_pour')
  }

  function applyWashHit(px: number, pz: number, crest: number) {
    hooks.each((index, x, z) => {
      if (washed[index]) return
      const o = octDist(x, z)
      if (o < 6 || o > crest || o > 10.6) return
      washed[index] = 1
      const pushed = outward(x, z, TUNING.cloister.wash.push)
      hooks.place(index, pushed.x, pushed.z)
      hooks.damage(index, TUNING.cloister.wash.enemy, 'weapon', 0)
      hooks.stagger(index, TUNING.cloister.wash.stagger)
      hooks.wash(index, TUNING.cloister.wash.washed)
    })
    for (let i = 0; i < votaries.length; i++) {
      const foe = votaries[i]
      if (!foe?.alive || foe.mode === 9) continue
      if ((foe.vz | 0) === washGen) continue
      const o = octDist(foe.x, foe.z)
      if (o < 6 || o > crest || o > 10.6) continue
      foe.vz = washGen
      const pushed = outward(foe.x, foe.z, TUNING.cloister.wash.push)
      foe.x = pushed.x
      foe.z = pushed.z
      foe.wash = TUNING.cloister.wash.washed
      foe.hp -= TUNING.cloister.wash.enemy
      if (foe.hp <= 0) foe.alive = 0
    }
    if (selaWash !== washGen && hooks.vulnerable()) {
      const o = octDist(px, pz)
      if (o >= 6 && o <= crest && o <= 10.6) {
        selaWash = washGen
        const pushed = outward(px, pz, TUNING.cloister.wash.push)
        hooks.pushPlayer(pushed.x, pushed.z)
        hooks.hurt(TUNING.cloister.wash.sela, true)
        hooks.slow(TUNING.cloister.wash.slow)
      }
    }
  }

  const cast: CloisterCast = {
    reset() {
      rng = mulberry32(7)
      wakeAt = 0
      p2at = 0
      p3at = 0
      deadAt = 0
      stamp = 1e9
      cowlCd = 0
      rise = 0
      pourT = 0
      pourOn = false
      slamT = 0
      selfT = 0
      contactCd = 0
      poursFired = 0
      slamsFired = 0
      visual.hold = false
      visual.dry = 0
      visual.laneT = 0
      visual.slamR = 0
      visual.pull = 0
      visual.warn = 0
      visual.crest = 0
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (foe) foe.alive = 0
      }
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (foe) foe.alive = 0
      }
      bossOn = false
      bossDead = false
      born = false
      phase = 0
      hold = false
      dry = 0
      force = 0
      proc = false
      blotGen = 0
      washGen = -1
      selaWash = -1
      refill = 0
      visual.fan = 0
      vMesh.count = 0
      bMesh.count = 0
      bossParts.mesh.visible = false
      shudder = 0
      qHead = 0
      qTail = 0
      qCount = 0
      hooks.track(null)
    },
    spawnVotary,
    placeVotary,
    spawnBlot,
    peek() {
      const pack = (foe: Foe) => ({
        x: foe.x,
        z: foe.z,
        hp: foe.hp,
        mode: foe.mode,
        flash: foe.flash,
        wash: foe.wash,
        yaw: foe.yaw,
        t: foe.t,
        vx: foe.vx,
        vz: foe.vz,
      })
      const votariesOut = []
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (foe?.alive) votariesOut.push(pack(foe))
      }
      const blotsOut = []
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (foe?.alive) blotsOut.push(pack(foe))
      }
      const trisOf = (geo: BufferGeometry) => (geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3)
      return {
        votaries: votariesOut,
        blots: blotsOut,
        boss: { x: bossX, z: bossZ, y: bossY, hp: bossHp, max: specBoss.hp, phase, on: bossOn ? 1 : 0, dead: bossDead ? 1 : 0, rise },
        vis: {
          pull: visual.pull,
          warn: visual.warn,
          glyph: visual.glyph,
          crest: visual.crest,
          dry: visual.dry,
          hold: visual.hold ? 1 : 0,
          fan: visual.fan,
          laneT: visual.laneT,
          slamR: visual.slamR,
          pours: poursFired,
          slams: slamsFired,
          lane0: [visual.lane0.x, visual.lane0.y, visual.lane0.z, visual.lane0.w],
          lane1: [visual.lane1.x, visual.lane1.y, visual.lane1.z, visual.lane1.w],
        },
        tris: {
          votary: trisOf(vGeo),
          blot: trisOf(bGeo),
          boss: trisOf(bossParts.mesh.geometry),
          ewer: 0,
        },
      }
    },
    plan(time) {
      const votary = time >= 90 ? 0.12 * Math.min(1, (time - 90) / 120) : 0
      return { votary, boss: bossOn }
    },
    visuals: () => visual,
    occluders() {
      let n = 0
      for (let i = 0; i < blots.length && n < 4; i++) {
        const foe = blots[i]
        if (!foe?.alive || foe.mode !== 0) continue
        const slot = occPool[n]
        if (!slot) break
        slot.x = foe.x
        slot.z = foe.z
        slot.r = specB.radius
        occOut[n] = slot
        n++
      }
      occOut.length = n
      return occOut
    },
    warm(renderer, camera) {
      const shown = [vMesh.visible, bMesh.visible, bossParts.mesh.visible]
      const counts = [vMesh.count, bMesh.count]
      vMesh.visible = true
      bMesh.visible = true
      bossParts.mesh.visible = true
      vMesh.count = Math.max(1, counts[0] ?? 0)
      bMesh.count = Math.max(1, counts[1] ?? 0)
      renderer.compile(vMesh, camera)
      renderer.compile(bMesh, camera)
      renderer.compile(bossParts.mesh, camera)
      vMesh.count = counts[0] ?? 0
      bMesh.count = counts[1] ?? 0
      vMesh.visible = shown[0] ?? false
      bMesh.visible = shown[1] ?? false
      bossParts.mesh.visible = shown[2] ?? false
    },
    cleared: () => bossDead,
    bossing: () => bossOn,
    phase: () => phase,
    debugPhase(next) {
      if (!born) wake(270)
      phase = next
      shudder = 1
      if (next >= 2) {
        hold = true
        bossHp = Math.min(bossHp, specBoss.hp * 0.55)
      }
      if (next >= 3) {
        hold = false
        dry = 1
        bossHp = Math.min(bossHp, specBoss.hp * 0.2)
        bossY = 0
        rise = 0
      }
      if (next <= 0) killBoss(0)
    },
    times: () => ({ wake: wakeAt, p2: p2at, p3: p3at, dead: deadAt }),
    dispose() {
      vGeo.dispose()
      bGeo.dispose()
      vMat.dispose()
      bMat.dispose()
      bossParts.mesh.geometry.dispose()
      const mat = bossParts.mesh.material
      if (!Array.isArray(mat)) mat.dispose()
    },
    touch(px, pz) {
      if (contactCd > 0) return 0
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (!foe?.alive) continue
        const dx = foe.x - px
        const dz = foe.z - pz
        if (dx * dx + dz * dz <= (specV.radius + 0.34) * (specV.radius + 0.34)) {
          contactCd = 0.45
          return specV.contact
        }
      }
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (!foe?.alive || foe.mode !== 1) continue
        const dx = foe.x - px
        const dz = foe.z - pz
        if (dx * dx + dz * dz <= 1.6) {
          contactCd = 0.45
          return specB.contact
        }
      }
      if (bossOn && rise <= 0) {
        const dx = bossX - px
        const dz = bossZ - pz
        if (dx * dx + dz * dz <= (specBoss.radius + 0.34) * (specBoss.radius + 0.34)) {
          contactCd = 0.55
          return specBoss.contact
        }
      }
      return 0
    },
    cut(sx, sz, ex, ez, active, id, radius, damage, might) {
      if (!active) return
      const hit = (x: number, z: number, r: number) => {
        const dx = ex - sx
        const dz = ez - sz
        const len2 = dx * dx + dz * dz || 1
        let t = ((x - sx) * dx + (z - sz) * dz) / len2
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const qx = sx + dx * t - x
        const qz = sz + dz * t - z
        return qx * qx + qz * qz <= (radius + r) * (radius + r)
      }
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (!foe?.alive || foe.cd === id) continue
        if (!hit(foe.x, foe.z, specV.radius)) continue
        foe.cd = id
        const under = ask.under(foe.x, foe.z) || foe.wash > 0
        let m = 1 + TUNING.passive.might * might
        if (under) m *= TUNING.exposedDamage
        foe.hp -= damage * m
        hooks.ping(foe.x, foe.z, under)
        if (foe.hp <= 0) {
          foe.alive = 0
          hooks.xp(foe.x, foe.z, specV.xp)
        }
      }
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (!foe?.alive || foe.mode === 3 || foe.heading === id) continue
        const reach = foe.mode === 0 ? specB.radius : 0.45
        if (!hit(foe.x, foe.z, reach)) continue
        foe.heading = id
        let amount = damage * (1 + TUNING.passive.might * might)
        if (foe.mode === 0) amount *= TUNING.armoredWeapon
        else amount = damageAmount(damage, ask.lit(foe.x, foe.z), 'cut', might, ask.deep(foe.x, foe.z))
        foe.hp -= amount
        if (foe.hp <= 0) {
          foe.alive = 0
          hooks.xp(foe.x, foe.z, specB.xp)
        }
      }
      if (bossOn && hit(bossX, bossZ, specBoss.radius) && stamp !== -id) {
        stamp = -id
        hurtBoss(damage, 'cut', might, bossT)
      }
    },
    soak(x, z, radius, base, source, might, mark) {
      if (mark === stamp) return false
      let any = false
      const rPad = radius
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (!foe?.alive) continue
        const dx = foe.x - x
        const dz = foe.z - z
        if (dx * dx + dz * dz > (rPad + specV.radius) * (rPad + specV.radius)) continue
        const under = ask.under(foe.x, foe.z) || foe.wash > 0
        const deep = ask.deep(foe.x, foe.z)
        let m = 1 + TUNING.passive.might * might
        if (under) m *= TUNING.exposedDamage
        else if (deep) m *= TUNING.cloister.deepWeapon
        else m *= TUNING.armoredWeapon
        foe.hp -= base * m
        hooks.ping(foe.x, foe.z, under)
        any = true
        if (foe.hp <= 0) {
          foe.alive = 0
          hooks.xp(foe.x, foe.z, specV.xp)
        }
      }
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (!foe?.alive || foe.mode === 3) continue
        const dx = foe.x - x
        const dz = foe.z - z
        const reach = foe.mode === 0 ? specB.radius : 0.45
        if (dx * dx + dz * dz > (rPad + reach) * (rPad + reach)) continue
        let amount = base * (1 + TUNING.passive.might * might)
        if (foe.mode === 0) amount *= TUNING.armoredWeapon
        else amount = damageAmount(base, ask.lit(foe.x, foe.z), source, might, ask.deep(foe.x, foe.z))
        foe.hp -= amount
        any = true
        if (foe.hp <= 0) {
          foe.alive = 0
          hooks.xp(foe.x, foe.z, specB.xp)
        }
      }
      if (bossOn) {
        const dx = bossX - x
        const dz = bossZ - z
        if (dx * dx + dz * dz <= (rPad + specBoss.radius) * (rPad + specBoss.radius)) {
          stamp = mark
          if (hurtBoss(base, source, might, bossT)) any = true
        }
      }
      return any
    },
    tick(dt, time, cycle, px, pz, _might, lite = false) {
      dequeue()
      steerTick++
      cowlCd = Math.max(0, cowlCd - dt)
      vMat.uniforms.uTime!.value = time
      bMat.uniforms.uTime!.value = time
      enrage = time >= specBoss.enrage ? 1.5 : 1
      if (!born && time >= specBoss.wake) wake(time)
      if (!proc && time >= 210) {
        proc = true
        for (let i = 0; i < 6; i++) enqueue(1, -3 + i * 1.2, -21.2)
        for (let i = 0; i < 4; i++) hooks.spawn(1, -2 + i * 1.4, -16.5)
      }
      const minute = Math.floor(time / 60)
      if (minute >= 1 && minute !== blotGen && cycle >= 1 && cycle <= 12 && !hold) {
        blotGen = minute
        const n = minute <= 1 ? 2 : minute === 2 ? 3 : 4
        const aimX = phase === 2 ? bossX : px
        const aimZ = phase === 2 ? bossZ : pz
        for (let i = 0; i < n; i++) enqueue(2, aimX, aimZ)
      }
      const natural = prevCycle > 40 && cycle < 2
      if (natural) {
        washGen += 1
        washed.fill(0)
        hooks.sfx('brimwash_warn')
      }
      let pull = 0
      let warn = 0
      let glyph = 0
      let crest = 0
      if (cycle >= 58) {
        const u = (cycle - 58) / 2
        pull = Math.min(1, u * 1.2)
        warn = Math.min(1, u)
        glyph = Math.min(8, (cycle - 58) / 0.25)
      }
      if (force > 0) {
        force -= dt
        const u = 1 - Math.max(0, force) / TUNING.cloister.wash.telegraph
        pull = Math.max(pull, Math.min(1, u))
        warn = Math.max(warn, Math.min(1, u))
        glyph = Math.max(glyph, Math.min(8, u * 8))
        if (force <= 0) {
          forceCrest = 0.6
          washGen += 1
          washed.fill(0)
          hooks.sfx('brimwash_crash')
        }
      }
      if (cycle < 0.6 && washGen >= 0) {
        crest = 6 + (cycle / 0.6) * 4.6
        applyWashHit(px, pz, crest)
      }
      if (forceCrest > 0) {
        const u = 1 - forceCrest / 0.6
        crest = Math.max(crest, 6 + u * 4.6)
        applyWashHit(px, pz, crest)
        forceCrest -= dt
      }
      visual.pull = pull
      visual.warn = warn
      visual.glyph = glyph
      visual.crest = crest
      if (bossDead && refill > 0) {
        refill = Math.max(0, refill - dt)
        dry = refill / 3
      }
      visual.hold = hold
      visual.dry = dry
      visual.fan = bossDead ? 1 : 0
      for (let i = 0; i < votaries.length; i++) {
        const foe = votaries[i]
        if (!foe?.alive) continue
        foe.t += dt
        foe.wash = Math.max(0, foe.wash - dt)
        foe.flash = Math.max(0, foe.flash - dt)
        if (ask.direct(foe.x, foe.z)) {
          if (foe.flash <= 0 && cowlCd <= 0) {
            cowlCd = 0.5
            hooks.sfx('votary_cowl')
          }
          foe.flash = 0.18
        }
        const dx = px - foe.x
        const dz = pz - foe.z
        const dist = Math.hypot(dx, dz) || 1
        if (dist < 4) foe.heading = Math.atan2(dz, dx)
        else if (foe.t >= 0.25) {
          foe.t = 0
          const aim = Math.atan2(dz, dx)
          if (lite) {
            const h = foe.scan % 3
            const ang = aim + (h - 1) * 0.7
            const sx = foe.x + Math.cos(ang) * 1.5
            const sz = foe.z + Math.sin(ang) * 1.5
            const score = (ask.under(sx, sz) ? 2 : 0) - (Math.cos(ang) * dx + Math.sin(ang) * dz) / dist
            if (h === 0 || score < foe.best) {
              foe.best = score
              foe.heading = ang
            }
            foe.scan = h + 1
          } else {
            let best = foe.heading
            let bestS = 1e9
            for (let h = 0; h < 3; h++) {
              const ang = aim + (h - 1) * 0.7
              const sx = foe.x + Math.cos(ang) * 1.5
              const sz = foe.z + Math.sin(ang) * 1.5
              const score = (ask.under(sx, sz) ? 2 : 0) - (Math.cos(ang) * dx + Math.sin(ang) * dz) / dist
              if (score < bestS) {
                bestS = score
                best = ang
              }
            }
            foe.heading = best
          }
        }
        const step = specV.speed * dt
        const nx = foe.x + Math.cos(foe.heading) * step
        const nz = foe.z + Math.sin(foe.heading) * step
        const slid = slideCircle(foe.x, foe.z, nx, nz, specV.radius)
        foe.x = slid.x
        foe.z = slid.z
        foe.yaw = foe.heading
        if (!lite || (steerTick + i) % 3 === 0) foe.mode = ask.under(foe.x, foe.z) || foe.wash > 0 ? 2 : 0
        else if (foe.wash > 0) foe.mode = 2
      }
      for (let i = 0; i < blots.length; i++) {
        const foe = blots[i]
        if (!foe?.alive) continue
        if (foe.mode === 3) {
          foe.t -= dt
          if (foe.t > 1.4) continue
          foe.x += foe.vx * dt
          foe.z += foe.vz * dt
          const dx = foe.x - px
          const dz = foe.z - pz
          if (foe.t <= 0 || dx * dx + dz * dz < 0.36) {
            if (dx * dx + dz * dz < 0.64 && hooks.vulnerable()) hooks.hurt(specB.spit, false)
            foe.alive = 0
          }
          continue
        }
        const stranded = !hold && cycle >= 32 && cycle < 58
        if (foe.mode === 0 && foe.t < 0.8) {
          foe.t += dt
          const u = Math.min(1, foe.t / 0.8)
          foe.x = foe.vx * u
          foe.z = foe.vz * u
        } else if (stranded) {
          foe.mode = 1
          const dx = px - foe.x
          const dz = pz - foe.z
          const dist = Math.hypot(dx, dz) || 1
          const step = specB.crawl * dt
          const nx = foe.x + (dx / dist) * step
          const nz = foe.z + (dz / dist) * step
          const slid = slideCircle(foe.x, foe.z, nx, nz, 0.45)
          foe.x = slid.x
          foe.z = slid.z
          foe.yaw = Math.atan2(dz, dx)
        } else if (cycle < 8 && foe.mode === 1) {
          foe.mode = 0
        }
        if (foe.mode === 0) {
          foe.cd -= dt
          const dx = px - foe.x
          const dz = pz - foe.z
          if (foe.cd <= 0 && dx * dx + dz * dz < 81) {
            foe.cd = 3
            const spit = take(blots)
            if (spit) {
              const dist = Math.hypot(dx, dz) || 1
              spit.alive = 1
              spit.mode = 3
              spit.x = foe.x
              spit.z = foe.z
              spit.vx = (dx / dist) * specB.spitSpeed
              spit.vz = (dz / dist) * specB.spitSpeed
              spit.t = 2
              spit.hp = 1
              hooks.sfx('blot_spit')
            }
          }
        }
      }
      visual.slamR = 0
      visual.laneT = 0
      if (bossOn) {
        bossT += dt
        const rate = enrage
        if (rise > 0) {
          rise -= dt
          const u = 1 - Math.max(0, rise) / 3
          bossY = -1.6 + u * 1.6
          visual.slamX = bossX
          visual.slamZ = bossZ
          visual.slamR = 4 * u
          if (rise <= 0 && !riseHit) {
            riseHit = true
            const dx = px - bossX
            const dz = pz - bossZ
            if (dx * dx + dz * dz <= 16 && hooks.vulnerable()) hooks.hurt(18, false)
          }
        } else if (phase === 1 || phase === 2) {
          const loop = nearestLoop(px, pz)
          let tx = loop.x
          let tz = loop.z
          const reach = Math.max(Math.abs(bossX), Math.abs(bossZ))
          if (reach < LOOP_R - 0.8) {
            const s = LOOP_R / Math.max(reach, 0.25)
            tx = bossX * s
            tz = bossZ * s
          }
          const dx = tx - bossX
          const dz = tz - bossZ
          const dist = Math.hypot(dx, dz) || 1
          const spd = (phase === 2 ? specBoss.speed2 : specBoss.speed1) * rate
          const step = Math.min(dist, spd * dt)
          bossX += (dx / dist) * step
          bossZ += (dz / dist) * step
          if (phase === 2 && Math.floor(bossT / 10) !== Math.floor((bossT - dt) / 10)) {
            enqueue(2, bossX, bossZ)
            enqueue(2, bossX, bossZ)
          }
          pourCd -= dt * rate
          if (pourCd <= 0) {
            pourCd = phase === 2 ? 3.6 : 3.2
            armLanes(px, pz, phase === 2)
          }
          if (phase === 1 && Math.floor(bossT / 12) !== Math.floor((bossT - dt) / 12)) {
            enqueue(1, px > 0 ? -21 : 21, pz)
            enqueue(1, px, pz > 0 ? -21 : 21)
          }
        } else if (phase === 3) {
          if (dry < 1) {
            const rim = outward(bossX, bossZ, 8)
            const dx = rim.x - bossX
            const dz = rim.z - bossZ
            const dist = Math.hypot(dx, dz) || 1
            if (dist > 0.4 && drink <= 0) {
              const step = Math.min(dist, specBoss.speed1 * dt)
              bossX += (dx / dist) * step
              bossZ += (dz / dist) * step
            } else {
              drink += dt
              dry = Math.min(1, drink / 4)
              if (drink >= 4) hooks.sfx('compline_drink')
            }
          } else {
            const dx = px - bossX
            const dz = pz - bossZ
            const dist = Math.hypot(dx, dz) || 1
            const step = Math.min(dist, specBoss.speed3 * rate * dt)
            bossX += (dx / dist) * step
            bossZ += (dz / dist) * step
            slamCd -= dt * rate
            if (slamCd <= 0) {
              slamCd = 4
              slamT = 0.9
              slamsFired++
              hooks.sfx('compline_slam')
            }
            selfCd -= dt * rate
            if (selfCd <= 0) {
              selfCd = 16
              selfT = 1.6
            }
          }
        }
        if (pourOn) {
          pourT -= dt
          visual.laneT = pourT > 0 ? 1 - pourT / 0.8 : Math.max(0, visual.laneT)
          visual.lanePhase = pourT > 0 ? 0 : 1
          if (pourT <= 0 && pourOn) {
            pourOn = false
            visual.laneT = 1
            if (laneHit(px, pz, lane0, 0.7) || laneHit(px, pz, lane1, 0.7)) {
              if (hooks.vulnerable()) hooks.hurt(22, false)
            }
            pourT = -6
          }
        } else if (pourT < 0) {
          pourT += dt
          visual.laneT = Math.max(0, 1 + pourT / 6)
          visual.lanePhase = 1
        }
        if (slamT > 0) {
          slamT -= dt
          visual.slamX = bossX
          visual.slamZ = bossZ
          visual.slamR = 4 * (1 - Math.max(0, slamT) / 0.9)
          if (slamT <= 0) {
            const dx = px - bossX
            const dz = pz - bossZ
            if (dx * dx + dz * dz <= 16 && hooks.vulnerable()) hooks.hurt(25, false)
          }
        }
        if (selfT > 0) {
          selfT -= dt
          const u = 1 - Math.max(0, selfT) / 1.6
          visual.slamX = bossX
          visual.slamZ = bossZ
          visual.slamR = Math.max(visual.slamR, u * 7)
          if (selfT <= 0) {
            hooks.each((index, x, z) => {
              const dx = x - bossX
              const dz = z - bossZ
              if (dx * dx + dz * dz > 49) return
              const len = Math.hypot(dx, dz) || 1
              hooks.place(index, x + (dx / len) * 2.4, z + (dz / len) * 2.4)
              hooks.damage(index, 12, 'weapon', 0)
              hooks.wash(index, 2.5)
              hooks.stagger(index, 0.4)
            })
            const dx = px - bossX
            const dz = pz - bossZ
            if (dx * dx + dz * dz <= 49 && hooks.vulnerable()) {
              hooks.hurt(12, true)
              hooks.slow(0.8)
            }
          }
        }
        const face = Math.atan2(px - bossX, pz - bossZ)
        shudder = Math.max(0, shudder - dt * 1.6)
        bossParts.uTime.value = time
        bossParts.uPour.value = pourOn ? 1 : pourT < 0 ? Math.max(0, 0.45 + pourT / 6) : 0
        bossParts.uPhase.value = phase
        bossParts.uShudder.value = shudder
        bossParts.uDrink.value = phase === 3 && drink > 0 && drink < 4 ? 1 : 0
        bossParts.mesh.rotation.y = face
        bossParts.mesh.rotation.x = 0
        const bob = phase === 3 && slamT > 0.4 ? (0.9 - slamT) * 0.35 : Math.sin(time * 1.3) * 0.04
        bossParts.mesh.position.set(bossX, bossY + bob + (bossDead ? -2 : 0), bossZ)
        bossParts.mesh.scale.setScalar(bossHp > 0 ? BOSS_SCALE : Math.max(0.2, BOSS_SCALE))
        trackBoss()
      } else if (bossDead) {
        bossY -= dt * 0.8
        bossParts.mesh.position.set(bossX, bossY, bossZ)
        const s = Math.max(0, 1 + bossY * 0.3)
        bossParts.mesh.scale.setScalar(s)
        if (s <= 0.05) bossParts.mesh.visible = false
      }
      prevCycle = cycle
      sync(vMesh, votaries, vHot, () => 0, () => 1)
      sync(bMesh, blots, bHot, (foe) => (foe.mode === 3 ? 0.7 : 0.12), (foe) => (foe.mode === 3 ? 0.28 : foe.mode === 0 ? 1 : 0.72))
      contactCd = Math.max(0, contactCd - dt)
    },
  }
  return cast
}

function nearestLoop(px: number, pz: number): { x: number; z: number } {
  const ax = Math.abs(px)
  const az = Math.abs(pz)
  if (ax >= az) {
    loopPt.x = Math.sign(px || 1) * LOOP_R
    loopPt.z = Math.max(-LOOP_R, Math.min(LOOP_R, pz))
  } else {
    loopPt.x = Math.max(-LOOP_R, Math.min(LOOP_R, px))
    loopPt.z = Math.sign(pz || -1) * LOOP_R
  }
  return loopPt
}
