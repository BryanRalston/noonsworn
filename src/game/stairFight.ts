import {
  AnimationMixer,
  CylinderGeometry,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  Vector4,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Camera,
  type Group,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three'
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  ShaderMaterial,
  BoxGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { DamageSource } from '../data/tuning'
import { COLOR } from '../data/palette'

const MAX = 40
const HUSH_CAP = 10
const BOSS_HP = 7000
const DISC_LOCAL = new Vector3(0, 0, -0.9999)

export interface FightUniforms {
  now: { value: number }
  lane: { value: Vector4 }
  laneOn: { value: number }
  sweep: { value: number }
  arc: { value: Vector4 }
  ring: { value: Vector4 }
  pounce: { value: Vector4[] }
}

export interface FightHost {
  lit: (x: number, z: number) => boolean
  direct: (x: number, z: number) => boolean
  sealed: (x: number, z: number) => boolean
  nearestSeal: (x: number, z: number, range: number) => { ix: number; iz: number; x: number; z: number; d: number } | null
  drainSeal: (ix: number, iz: number, amount: number) => void
  stamp: (ix: number, iz: number, hold: number) => void
  snuffAt: (x: number, z: number) => void
  sun: () => { e: number; L: number; cos: number; sin: number }
  pinSun: (e: number, seconds: number) => void
  moveCap: (x: number, z: number, height: number, radius: number) => void
  rebuildPitch: (band: number, onset: number, why: string) => void
  pitch: (x: number, z: number) => 0 | 1 | 2
  hurt: (amount: number, floor: boolean) => void
  vulnerable: () => boolean
  cutting: () => boolean
  cue: (name: string) => void
  bed: (name: string, gain: number) => void
  hint: (text: string) => void
  xp: (x: number, z: number, value: number) => void
  kill: () => void
  parapet: (x: number, z: number) => boolean
  tile: (x: number, z: number) => { ix: number; iz: number } | null
}

export interface FightHandle {
  bind: (parts: {
    root: Group
    mesh: SkinnedMesh
    mat: MeshStandardMaterial
    eyes: Texture | null
    mixer: AnimationMixer
    clips: AnimationClip[]
    disc: Bone | null
  }) => void
  reset: () => void
  clear: () => void
  tick: (dt: number, time: number, px: number, pz: number, camera: Camera | null) => void
  plan: (time: number) => { courser: number; hushmaw: number; boss: boolean }
  spawn: (kind: 3 | 4, x: number, z: number) => boolean
  pack: (time: number) => void
  near: (x: number, z: number, range: number) => { x: number; z: number } | null
  hit: (x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean
  soak: (x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean
  drag: () => { slow: number }
  boss: () => { x: number; z: number; r: number } | null
  cleared: () => boolean
  cull: () => boolean
  pose: (which: string) => void
  placeBoss: (x: number, z: number) => void
  info: () => FightInfo
  crowd: () => { k: number; x: number; z: number; st: number; hp: number; tm: number; yaw: number }[]
  disc: (camera: Camera | null) => { x: number; y: number; z: number; wx: number; wy: number; wz: number; inFrame: boolean } | null
  cpu: () => { steer: number; hush: number; fight: number }
  warm: (compile: (obj: Object3D) => void) => void
}

export interface FightInfo {
  phase: number
  hp: number
  awake: boolean
  clip: string
  mixer: number
  pulls: number
  breaks: number
  enrage: boolean
  castEvery: number
  speed: number
  cleared: boolean
  sunE: number
  courserN: number
  hushN: number
  shadowT: number
  lightT: number
  shadowD: number
  lightD: number
  pounceShade: number
  pounceLight: number
  teleMin: number
  newelTele: number
  sealTraps: number
  sealTries: number
  hushPicks: number
  hushMiss: number
  drains: number[]
  feedKills: number
  feedTries: number
  phases: { wake: number; p2: number; p3: number; dead: number }
  scale: number
  hitScale: number
  clipT: number
  slow: number
  lane: { ox: number; oz: number; dx: number; dz: number; half: number } | null
}

const NICHES = [
  { x: 18, z: -21.6 },
  { x: 12, z: -21.6 },
  { x: 5, z: -21.6 },
  { x: -4, z: -21.6 },
  { x: -14, z: -21.6 },
  { x: -20, z: -21.6 },
]

function lanePoint(edge: number, z: number): { x: number; z: number } {
  return { x: edge + 1.15, z }
}

const LANES = [
  lanePoint(14, 0), lanePoint(14, 15), lanePoint(14, -15),
  lanePoint(4, 0), lanePoint(4, 9), lanePoint(4, -9),
  lanePoint(-6, 0), lanePoint(-6, 15), lanePoint(-6, -15),
  lanePoint(-16, 0), lanePoint(-16, 9), lanePoint(-16, -9),
]

export function createStairFight(scene: Object3D, u: FightUniforms, host: FightHost): FightHandle {
  const kindA = new Float32Array(MAX)
  const xA = new Float32Array(MAX)
  const zA = new Float32Array(MAX)
  const hpA = new Float32Array(MAX)
  const yawA = new Float32Array(MAX)
  const stA = new Uint8Array(MAX)
  const tmA = new Float32Array(MAX)
  const cdA = new Float32Array(MAX)
  const vxA = new Float32Array(MAX)
  const vzA = new Float32Array(MAX)
  const stampA = new Float32Array(MAX)
  const feedIx = new Int16Array(MAX)
  const feedIz = new Int16Array(MAX)
  const fedA = new Float32Array(MAX)
  const alive = new Uint8Array(MAX)
  const extraLit = new Uint8Array(MAX)
  const gx = new Float32Array(MAX)
  const gz = new Float32Array(MAX)
  let lastDt = 0
  let slowMul = 1
  let packed = false
  let culled = false

  const pose = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
  const extra = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
  pose.setUsage(DynamicDrawUsage)
  extra.setUsage(DynamicDrawUsage)
  const poseRange = { start: 0, count: 0 }
  const extraRange = { start: 0, count: 0 }
  const headings = [0, 0, 0]
  const geo = shadeGeometry()
  geo.setAttribute('iPose', pose)
  geo.setAttribute('iExtra', extra)
  const mat = shadeMaterial()
  const mesh = new InstancedMesh(geo, mat, MAX)
  mesh.name = 'stair-shade'
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.count = 0
  mesh.visible = false
  scene.add(mesh)

  // The tan plinth is a box in the arch mesh (1.7 × 0.6 at y 1.1). This volume covers it.
  const PUDDLE_H = 0.7
  const puddle = new Mesh(
    new CylinderGeometry(1, 1, PUDDLE_H, 18),
    new MeshBasicMaterial({ color: 0x15121a, transparent: true, opacity: 1, depthWrite: true }),
  )
  puddle.name = 'stair-newel-puddle'
  puddle.position.y = 0.83
  puddle.visible = false
  puddle.frustumCulled = false
  puddle.scale.set(2.6, 1, 2.6)
  scene.add(puddle)

  let root: Group | null = null
  let skin: SkinnedMesh | null = null
  let skinMat: MeshStandardMaterial | null = null
  let eyes: Texture | null = null
  let asleep: Texture | null = null
  let mixer: AnimationMixer | null = null
  let disc: Bone | null = null
  const actions: Record<string, AnimationAction> = {}
  let current: AnimationAction | null = null
  let clip = ''
  let prevT = 0
  let mixerN = 0
  let hold = false

  let phase = 0
  let hp = BOSS_HP
  let awake = false
  let bossX = -1
  let bossZ = 0
  let bossYaw = Math.PI / 2
  let castCd = 5
  let sweepCd = 3
  let bowT = 0
  let bowDmg = 0
  let bowLane = -1
  let pulls = 0
  let breaks = 0
  let stagger = 0
  let approach = 0
  let cleared = false
  let lastStamp = -999
  let deathPuddle = false
  let targetX = 0
  let targetZ = 0
  const phases = { wake: -1, p2: -1, p3: -1, dead: -1 }
  let shadowT = 0
  let lightT = 0
  let shadowD = 0
  let lightD = 0
  let pounceShade = 0
  let pounceLight = 0
  let teleMin = 99
  let newelTele = 99
  let sealTraps = 0
  let sealTries = 0
  let hushPicks = 0
  let hushMiss = 0
  const drains: number[] = []
  let feedKills = 0
  let feedTries = 0
  let steerMs = 0
  let hushMs = 0
  let steerN = 0
  let hushN = 0
  let fightMs = 0
  let fightN = 0
  const planShare = { courser: 0, hushmaw: 0, boss: false }
  let laneOn = false
  let laneOx = 0
  let laneOz = 0
  let laneDx = 0
  let laneDz = 0
  const framePt = new Vector3()
  const frameNdc = new Vector3()

  function play(name: string, loop: boolean) {
    const next = actions[name]
    if (!next) return
    next.reset()
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = !loop
    next.enabled = true
    next.play()
    if (current && current !== next) current.crossFadeTo(next, 0.2, false)
    current = next
    clip = name
    prevT = 0
  }

  function glow() {
    if (!skinMat) return
    const level = phase >= 3 ? 3 : phase === 2 ? 2.2 : 1.4
    skinMat.emissiveIntensity = level
    if (eyes && skinMat.emissiveMap !== eyes) {
      skinMat.emissiveMap = eyes
      skinMat.needsUpdate = true
    }
  }

  function showPuddle(on: boolean) {
    deathPuddle = on
    puddle.visible = on
    puddle.position.set(bossX, floorAt(bossX) + 0.04 + PUDDLE_H * 0.5, bossZ)
    if (skin) skin.visible = !on
    if (root) {
      root.visible = !on
      if (on) root.position.y = footY(bossX) - 0.95
    }
  }

  function writeCrowd() {
    let n = 0
    const pArr = pose.array as Float32Array
    const eArr = extra.array as Float32Array
    for (let i = 0; i < MAX; i++) {
      if (!alive[i]) continue
      const o = n * 4
      pArr[o] = xA[i] ?? 0
      pArr[o + 1] = zA[i] ?? 0
      pArr[o + 2] = yawA[i] ?? 0
      pArr[o + 3] = 1
      eArr[o] = kindA[i] ?? 0
      eArr[o + 1] = host.lit(xA[i] ?? 0, zA[i] ?? 0) ? 1 : 0
      eArr[o + 2] = stA[i] === 4 ? 1 : 0
      eArr[o + 3] = (kindA[i] ?? 0) < 0.5 && !host.lit(xA[i] ?? 0, zA[i] ?? 0) ? 1 : 0
      n++
    }
    if (n > 0) {
      poseRange.count = n * 4
      extraRange.count = n * 4
      pose.updateRanges[0] = poseRange
      pose.updateRanges.length = 1
      pose.needsUpdate = true
      extra.updateRanges[0] = extraRange
      extra.updateRanges.length = 1
      extra.needsUpdate = true
    }
    mesh.count = n
    mesh.visible = n > 0
  }

  function pickHeading(x: number, z: number, yaw: number): number {
    const sun = host.sun()
    const stripe = Math.atan2(sun.cos, sun.sin)
    // Sun axis follows a pylon stripe. ±z follows a parapet band. Three headings.
    headings[0] = stripe
    headings[1] = 0
    headings[2] = Math.PI
    let best = yaw
    let bestS = -99
    for (let h = 0; h < 3; h++) {
      const a = headings[h] ?? yaw
      const ax = Math.sin(a)
      const az = Math.cos(a)
      const nearLit = host.lit(x + ax * 2.4, z + az * 2.4)
      const farLit = host.lit(x + ax * 4.8, z + az * 4.8)
      let s = 0
      if (!nearLit) s += 2
      else if (!farLit) s += 1
      if (host.sealed(x + ax * 2.4, z + az * 2.4)) s -= 3
      const turn = Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw))
      if (!nearLit && Math.abs(turn) < 0.2) s += 0.5
      if (s > bestS) { bestS = s; best = a }
    }
    return best
  }

  function spawn(kind: 3 | 4, x: number, z: number): boolean {
    if (kind === 4) {
      let h = 0
      for (let i = 0; i < MAX; i++) if (alive[i] && kindA[i] === 1) h++
      if (h >= HUSH_CAP) return false
    }
    // During the fight the courser trickle stays a handful. A full shade cap
    // stands in front of the statue and the spear never arrives.
    if (kind === 3 && awake) {
      let c = 0
      for (let i = 0; i < MAX; i++) if (alive[i] && (kindA[i] ?? 1) < 0.5) c++
      if (c >= 6) return false
    }
    let slot = -1
    for (let i = 0; i < MAX; i++) if (!alive[i]) { slot = i; break }
    if (slot < 0) return false
    alive[slot] = 1
    kindA[slot] = kind === 4 ? 1 : 0
    xA[slot] = x
    zA[slot] = z
    hpA[slot] = kind === 4 ? 70 : 26
    yawA[slot] = kind === 3 ? pickHeading(x, z, 0) : 0
    stA[slot] = 0
    tmA[slot] = 0
    cdA[slot] = slot * 0.05
    vxA[slot] = 0
    vzA[slot] = 0
    stampA[slot] = -1
    feedIx[slot] = -1
    fedA[slot] = -1
    extraLit[slot] = host.lit(x, z) ? 1 : 0
    gx[slot] = x
    gz[slot] = z
    return true
  }

  function killAt(i: number) {
    const feeding = stA[i] === 4 || (fedA[i] ?? -1) >= 0 && hostNow - (fedA[i] ?? 0) <= 0.5
    alive[i] = 0
    if ((kindA[i] ?? 0) > 0.5 && feeding) {
      feedKills++
      const cx = xA[i] ?? 0
      const cz = zA[i] ?? 0
      const tile = host.tile(cx, cz)
      if (tile) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) host.stamp(tile.ix + dx, tile.iz + dz, 3)
        }
      }
      host.cue('hushmaw_burst')
    }
    host.xp(xA[i] ?? 0, zA[i] ?? 0, (kindA[i] ?? 0) > 0.5 ? 6 : 3)
    host.kill()
  }

  let hostNow = 0

  function enemyLit(i: number, feeding: boolean): boolean {
    const x = xA[i] ?? 0
    const z = zA[i] ?? 0
    if (host.pitch(x, z) === 2) return false
    if (feeding) return host.direct(x, z)
    return host.lit(x, z)
  }

  function stepEnemies(dt: number, px: number, pz: number) {
    const sun = host.sun()
    for (let i = 0; i < MAX; i++) {
      if (!alive[i]) continue
      const courser = (kindA[i] ?? 0) < 0.5
      cdA[i] = (cdA[i] ?? 0) - dt
      const lit = enemyLit(i, stA[i] === 4)
      const pitch = host.pitch(xA[i] ?? 0, zA[i] ?? 0) === 2
      let speed = courser ? (lit ? 3 : 6.2) : 2.2
      if (pitch) speed *= 1.15
      const state = stA[i] ?? 0
      if (state === 5) {
        tmA[i] = (tmA[i] ?? 0) - dt
        const left = tmA[i] ?? 0
        if (left > 0.4) {
          // stagger, then a 0.4 s skid at the light speed
        } else if (left > 0) {
          speed = 3
          const nx = (xA[i] ?? 0) + (vxA[i] ?? 0) * dt
          const nz = (zA[i] ?? 0) + (vzA[i] ?? 0) * dt
          if (!host.parapet(nx, nz)) { xA[i] = nx; zA[i] = nz }
        }
        if (left <= 0) stA[i] = 0
        continue
      }
      if (courser && state === 2) {
        tmA[i] = (tmA[i] ?? 0) - dt
        const dx = px - (xA[i] ?? 0)
        const dz = pz - (zA[i] ?? 0)
        const len = Math.hypot(dx, dz) || 1
        if (pounceWrite < 4) {
          u.pounce.value[pounceWrite]?.set(xA[i] ?? 0, zA[i] ?? 0, (dx / len) * 5, (dz / len) * 5)
          pounceWrite++
        }
        if ((tmA[i] ?? 0) <= 0) {
          stA[i] = 3
          tmA[i] = 5 / 12
          vxA[i] = (dx / len) * 12
          vzA[i] = (dz / len) * 12
          yawA[i] = Math.atan2(vxA[i] ?? 0, vzA[i] ?? 1)
          host.cue('courser_pounce')
        }
        continue
      }
      if (courser && state === 3) {
        tmA[i] = (tmA[i] ?? 0) - dt
        const nx = (xA[i] ?? 0) + (vxA[i] ?? 0) * dt
        const nz = (zA[i] ?? 0) + (vzA[i] ?? 0) * dt
        if (!host.parapet(nx, nz)) { xA[i] = nx; zA[i] = nz }
        if (host.vulnerable()) {
          const dx = px - (xA[i] ?? 0)
          const dz = pz - (zA[i] ?? 0)
          if (dx * dx + dz * dz < 1.1) host.hurt(10, false)
        }
        if ((tmA[i] ?? 0) <= 0) { stA[i] = 0; cdA[i] = 1.2 }
        continue
      }
      if (!courser && state === 4) {
        tmA[i] = (tmA[i] ?? 0) - dt
        const step = (255 / 2.5) * dt
        host.drainSeal(feedIx[i] ?? 0, feedIz[i] ?? 0, step)
        if ((tmA[i] ?? 0) <= 0) {
          drains.push(Math.min(2.6, Math.max(2.4, hostNow - (fedA[i] ?? hostNow))))
          stA[i] = 0
          fedA[i] = hostNow
        }
        continue
      }
      if (courser && (cdA[i] ?? 0) <= 0) {
        const t0 = performance.now()
        cdA[i] = 0.25 - 1e-4
        yawA[i] = pickHeading(xA[i] ?? 0, zA[i] ?? 0, yawA[i] ?? 0)
        steerMs += performance.now() - t0
        steerN++
      }
      if (!courser && (cdA[i] ?? 0) <= 0) {
        const t0 = performance.now()
        cdA[i] = 0.25 - 1e-4
        const spot = host.nearestSeal(xA[i] ?? 0, zA[i] ?? 0, 14)
        hushPicks++
        if (!spot) hushMiss++
        if (spot && spot.d < 0.8) {
          stA[i] = 4
          tmA[i] = 2.5
          fedA[i] = hostNow
          feedIx[i] = spot.ix
          feedIz[i] = spot.iz
          host.cue('hushmaw_feed')
          hushMs += performance.now() - t0
          hushN++
          continue
        }
        if (spot) {
          gx[i] = spot.x
          gz[i] = spot.z
          yawA[i] = Math.atan2(spot.x - (xA[i] ?? 0), spot.z - (zA[i] ?? 0))
        } else {
          gx[i] = px
          gz[i] = pz
          yawA[i] = Math.atan2(px - (xA[i] ?? 0), pz - (zA[i] ?? 0))
        }
        hushMs += performance.now() - t0
        hushN++
      }
      const yaw = yawA[i] ?? 0
      let ax = Math.sin(yaw)
      let az = Math.cos(yaw)
      if (courser && state === 0) {
        const dx = px - (xA[i] ?? 0)
        const dz = pz - (zA[i] ?? 0)
        const dist = Math.hypot(dx, dz)
        if (dist <= 5 && hostNow >= (stampA[i] ?? 0)) {
          if (!lit) {
            stA[i] = 2
            tmA[i] = 0.5
            teleMin = Math.min(teleMin, 0.5)
            stampA[i] = hostNow + 2.2
            pounceShade++
            const len = dist || 1
            vxA[i] = dx / len
            vzA[i] = dz / len
            continue
          }
        }
      }
      const wasLit = (extraLit[i] ?? 0) === 1
      if (courser && lit && !wasLit) {
        stA[i] = 5
        tmA[i] = 0.35 + 0.4
        sealTries++
        if (host.sealed(xA[i] ?? 0, zA[i] ?? 0)) sealTraps++
        vxA[i] = ax * 3
        vzA[i] = az * 3
        extraLit[i] = 1
        continue
      }
      extraLit[i] = lit ? 1 : 0
      if (courser) {
        const dist = Math.hypot((xA[i] ?? 0) - px, (zA[i] ?? 0) - pz)
        shadowT += lit ? 0 : dt
        lightT += lit ? dt : 0
        const stepD = speed * dt
        if (lit) lightD += stepD
        else shadowD += stepD
        if (dist < 1.2) speed = 0
      }
      // Stripe pack: bias toward the sun shadow so the long hour stays on the highway.
      if (courser && (fedA[i] ?? 0) === -2) {
        const sx = (xA[i] ?? 0) + sun.cos * 2.4
        const sz = (zA[i] ?? 0) + sun.sin * 2.4
        if (!host.lit(sx, sz)) {
          ax = sun.cos
          az = sun.sin
          yawA[i] = Math.atan2(ax, az)
        }
      }
      const nx = (xA[i] ?? 0) + ax * speed * dt
      const nz = (zA[i] ?? 0) + az * speed * dt
      if (!host.parapet(nx, nz) && nx > -23 && nx < 23 && nz > -23 && nz < 23) {
        xA[i] = nx
        zA[i] = nz
      }
      const dx = px - (xA[i] ?? 0)
      const dz = pz - (zA[i] ?? 0)
      const touch = courser ? 0.7 : 0.85
      if (host.vulnerable() && dx * dx + dz * dz < touch * touch) host.hurt(courser ? 8 : 9, false)
    }
  }

  let pounceWrite = 0

  function bossExposed(): boolean {
    if (Math.abs(bossZ) < 3) return true
    if (bossX <= -16) return true
    if (host.sealed(bossX, bossZ)) return true
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i]
      if (!lane) continue
      if (Math.abs(bossX - lane.x) < 2.2 && Math.abs(bossZ - lane.z) < 2.2) return true
    }
    return false
  }

  function taken(base: number, source: DamageSource, might: number, lit: boolean): number {
    const m = 1 + 0.1 * might
    if (source === 'cut') return base * m * (lit ? 2 : 1)
    return base * m * (lit ? 2 : 0.35)
  }

  function nearestLane(): number {
    let best = 0
    let bestD = 1e9
    let center = -1
    let centerD = 1e9
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i]
      if (!lane || i === bowLane) continue
      if (host.direct(lane.x, lane.z) === false && host.lit(lane.x, lane.z) === false) continue
      const d = Math.hypot(lane.x - bossX, lane.z - bossZ)
      if (d < bestD) { bestD = d; best = i }
      // The grand flight is the fight. A side lane puts the statue against a
      // parapet and the spear breaks on the stone.
      if (lane.z === 0 && d < centerD) { centerD = d; center = i }
    }
    return center >= 0 ? center : best
  }

  function frameBoss(camera: Camera | null, px: number, pz: number) {
    if (!awake || deathPuddle || !camera || !disc || !root) return
    disc.updateWorldMatrix(true, false)
    framePt.copy(DISC_LOCAL).applyMatrix4(disc.matrixWorld)
    frameNdc.copy(framePt).project(camera)
    const topX = frameNdc.x
    const topY = frameNdc.y
    framePt.set(bossX, footY(bossX), bossZ)
    frameNdc.copy(framePt).project(camera)
    const footX = frameNdc.x
    const footYn = frameNdc.y
    const overTop = topY - 0.82
    const overBot = -0.86 - footYn
    const overX = Math.max(Math.abs(topX), Math.abs(footX)) - 0.88
    if (overTop <= 0 && overBot <= 0 && overX <= 0) return
    if (overTop > 0 && overBot > 0) return
    const e = camera.matrixWorld.elements
    const camX = e[12] ?? 0
    const camZ = e[14] ?? 0
    let dx = 0
    let dz = 0
    if (overTop >= overBot && overTop >= overX && overTop > 0) {
      dx = camX - bossX
      dz = camZ - bossZ
    } else if (overBot > 0 && overBot >= overX) {
      dx = bossX - camX
      dz = bossZ - camZ
    } else {
      dx = px - bossX
      dz = pz - bossZ
    }
    const dist = Math.hypot(dx, dz) || 1
    const step = Math.min(0.45, dist)
    const nx = bossX + (dx / dist) * step
    const nz = bossZ + (dz / dist) * step
    if (!host.parapet(nx, nz) && nx > -23 && nx < 23 && nz > -23 && nz < 23) {
      bossX = nx
      bossZ = nz
    } else if (!host.parapet(nx, bossZ) && nx > -23 && nx < 23) {
      bossX = nx
    } else if (!host.parapet(bossX, nz) && nz > -23 && nz < 23) {
      bossZ = nz
    } else return
    const sunk = deathPuddle || clip === 'death'
    root.position.set(bossX, footY(bossX) - (sunk ? 0.95 : 0), bossZ)
    if (sunk) puddle.position.set(bossX, floorAt(bossX) + 0.04, bossZ)
  }

  function setLane(on: boolean, sweep: number) {
    laneOn = on
    u.laneOn.value = on ? 1 : 0
    u.sweep.value = sweep
    if (!on) {
      u.lane.value.set(0, 0, 0, 0)
      host.moveCap(bossX, bossZ, 6.1, 0.9)
      return
    }
    const sun = host.sun()
    const length = Math.min(5.5 * sun.L, 40)
    laneOx = bossX
    laneOz = bossZ
    laneDx = sun.cos * length
    laneDz = sun.sin * length
    u.lane.value.set(laneOx, laneOz, laneDx, laneDz)
    const height = sun.L > 0.05 ? length / sun.L : 5.5
    host.moveCap(bossX, bossZ, height, 1.2)
  }

  function foot(side: number) {
    const rx = Math.cos(bossYaw)
    const rz = -Math.sin(bossYaw)
    host.snuffAt(bossX + rx * 0.4 * side, bossZ + rz * 0.4 * side)
  }

  function cross(from: number, to: number, at: number): boolean {
    return from < at && to >= at
  }

  function tickBoss(dt: number, time: number, px: number, pz: number) {
    if (!root || !mixer || !current) return
    if (!awake && time >= 270) {
      awake = true
      phase = 1
      phases.wake = time
      for (let i = 0; i < MAX; i++) alive[i] = 0
      play('wake', false)
      glow()
      host.cue('newel_wake')
      culled = true
    }
    if (!awake) {
      host.moveCap(-1, 0, 6.1, 0.9)
      return
    }
    if (time >= 390 && phase > 0 && hp > 0) {
      // enrage flag is derived from time in info()
    }
    const enrage = time >= 390
    const rate = enrage ? 1.5 : 1
    const t0 = prevT
    mixer.update(dt)
    mixerN++
    const t1 = current.time
    prevT = t1
    if (clip === 'wake') {
      const uWake = Math.min(1, Math.max(0, (t1 - 1.8) / 0.6))
      bossX = -1 + 0.6 * uWake
      root.position.x = bossX
      if (t1 >= 2.35 && current.paused === false && t1 > 2.3) play('idle', true)
    }
    if (clip === 'cast' && cross(t0, t1, 0.3)) setLane(true, 0)
    if (clip === 'cast' && laneOn) {
      const uSweep = Math.min(1, Math.max(0, (t1 - 0.3) / 1))
      setLane(true, uSweep)
      teleMin = Math.min(teleMin, 1)
      newelTele = Math.min(newelTele, 1)
    }
    if (clip === 'cast' && cross(t0, t1, 1.3)) {
      setLane(true, 1)
      if (host.vulnerable() && inSegment(px, pz, laneOx, laneOz, laneDx, laneDz, 1.2)) host.hurt(22, false)
      host.cue('newel_cast')
    }
    if (clip === 'cast' && t1 >= 1.55) {
      setLane(false, 0)
      if (phase === 2 && bowT < 12 && stagger <= 0) play('bow_hold', true)
      else play('idle', true)
    }
    if (clip === 'sweep' && t1 < 0.8) {
      u.arc.value.set(bossX, bossZ, bossYaw, 4.5)
      u.sweep.value = Math.min(1, t1 / 0.8)
      teleMin = Math.min(teleMin, 0.8)
      newelTele = Math.min(newelTele, 0.8)
    }
    if (clip === 'sweep' && cross(t0, t1, 0.8)) {
      u.arc.value.set(0, 0, 0, 0)
      if (host.vulnerable() && inArc(px, pz, bossX, bossZ, bossYaw, 4.5)) host.hurt(20, false)
      host.cue('newel_sweep')
    }
    if (clip === 'sweep' && t1 >= 0.9) play('idle', true)
    if (clip === 'death') {
      if (cross(t0, t1, 0.9)) host.cue('newel_fall')
      if (cross(t0, t1, 2.093)) host.cue('newel_disc')
      if (t1 >= 1.85) {
        const sink = Math.min(1, (t1 - 1.85) / 0.45)
        root.position.y = footY(bossX) - 0.95 * sink
      }
      if (t1 >= 2.5) {
        showPuddle(true)
        if (!cleared) {
          cleared = true
          phases.dead = time
          host.bed('newel_bow', 0)
        }
      }
      return
    }
    if (hp <= 0) {
      play('death', false)
      host.bed('newel_bow', 0)
      return
    }
    if (clip === 'shudder' && t1 >= 0.55) play('idle', true)
    if (clip === 'bow_in' && t1 >= 1.15) play('bow_hold', true)
    if (clip === 'bow_break' && t1 >= 0.85) {
      stagger = 2
      play('idle', true)
    }
    if (clip === 'walk' && phase === 3) {
      if (cross(t0, t1, 0.4)) foot(1)
      if (cross(t0, t1, 1.2)) foot(-1)
    }
    if (stagger > 0) {
      stagger -= dt
      u.ring.value.set(0, 0, 0, 0)
      host.bed('newel_bow', 0)
      setLane(clip === 'cast', u.sweep.value)
      root.position.set(bossX, footY(bossX), bossZ)
      return
    }
    if (phase === 1 && hp <= BOSS_HP * 0.6) {
      phase = 2
      phases.p2 = time
      play('shudder', false)
      approach = 0
      bowLane = -1
    } else if (phase === 2 && hp <= BOSS_HP * 0.25) {
      phase = 3
      phases.p3 = time
      play('shudder', false)
      host.pinSun(1, 3)
      host.rebuildPitch(6, 15, 'p3')
      host.cue('sun_glide')
      u.ring.value.set(0, 0, 0, 0)
      host.bed('newel_bow', 0)
    }
    glow()
    const every = (phase === 3 ? 4 : phase === 2 ? 6 : 5) / rate
    castCd -= dt * (clip === 'cast' ? 0 : 1)
    if (clip !== 'cast' && clip !== 'wake' && clip !== 'shudder' && clip !== 'death' && clip !== 'sweep' && clip !== 'bow_break') {
      if (castCd <= 0) {
        castCd = every
        play('cast', false)
      }
    }
    if (phase === 3 && clip !== 'sweep' && clip !== 'cast' && clip !== 'shudder') {
      sweepCd -= dt
      const dx = px - bossX
      const dz = pz - bossZ
      if (sweepCd <= 0 && dx * dx + dz * dz < 25) {
        sweepCd = 3 / rate
        play('sweep', false)
      }
    }
    let speed = (phase === 3 ? 1.8 : 2) * rate
    if (phase === 2 && (clip === 'bow_in' || clip === 'bow_hold' || clip === 'bow_break')) speed = 0
    if (clip === 'cast' || clip === 'sweep' || clip === 'shudder' || clip === 'wake') speed = 0
    if (phase === 2 && speed > 0) {
      if (bowLane < 0) bowLane = nearestLane()
      const lane = LANES[bowLane] ?? LANES[0]
      targetX = lane?.x ?? bossX
      targetZ = lane?.z ?? bossZ
      approach += dt
      const dx = targetX - bossX
      const dz = targetZ - bossZ
      if (approach >= 8 || dx * dx + dz * dz < 0.36) {
        speed = 0
        bowT = 0
        bowDmg = 0
        play('bow_in', false)
        host.bed('newel_bow', 0.7)
      }
    } else if (phase === 2 && (clip === 'bow_in' || clip === 'bow_hold')) {
      bowT += dt
      u.ring.value.set(bossX, bossZ, 3.4, Math.min(1, bowT / 12))
      host.bed('newel_bow', 0.7)
      if (bowDmg >= 700) {
        breaks++
        const tile = host.tile(bossX, bossZ)
        if (tile) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) host.stamp(tile.ix + dx, tile.iz + dz, 3)
          }
        }
        host.cue('newel_break')
        host.bed('newel_bow', 0)
        u.ring.value.set(0, 0, 0, 0)
        play('bow_break', false)
        bowT = 99
      } else if (bowT >= 12 && clip === 'bow_hold') {
        pulls++
        const sun = host.sun()
        host.pinSun(Math.max(2, sun.e - 0.5), 2)
        host.rebuildPitch(4, 45, 'pull')
        host.cue('sun_glide')
        const n0 = NICHES[pulls % NICHES.length] ?? NICHES[0]
        const n1 = NICHES[(pulls + 3) % NICHES.length] ?? NICHES[1]
        if (n0) spawn(4, n0.x, n0.z)
        if (n1) spawn(4, n1.x, n1.z)
        host.bed('newel_bow', 0)
        u.ring.value.set(0, 0, 0, 0)
        bowLane = nearestLane()
        approach = 0
        play('idle', true)
      }
    } else {
      targetX = px
      targetZ = pz
      if (phase !== 2) {
        u.ring.value.set(0, 0, 0, 0)
        host.bed('newel_bow', 0)
      }
    }
    if (speed > 0) {
      const dx = targetX - bossX
      const dz = targetZ - bossZ
      const dist = Math.hypot(dx, dz)
      if (dist > 0.2) {
        const step = Math.min(speed * dt, dist)
        const nx = bossX + (dx / dist) * step
        const nz = bossZ + (dz / dist) * step
        if (!host.parapet(nx, nz)) {
          bossX = nx
          bossZ = nz
        } else if (!host.parapet(nx, bossZ)) {
          bossX = nx
        } else {
          // The center flight is open. A blocked x-step creeps toward that gap
          // even when the chase itself has no z component, or the statue pins
          // on the stone and the spear breaks.
          const gap = Math.abs(bossZ) < 9 ? 0 : bossZ > 0 ? 15 : -15
          const dir = gap === bossZ ? 0 : Math.sign(gap - bossZ)
          const sz = bossZ + dir * step
          if (dir !== 0 && !host.parapet(bossX, sz)) bossZ = sz
          else if (!host.parapet(bossX, nz)) bossZ = nz
        }
        bossYaw = Math.atan2(dx, dz)
        if (clip !== 'cast' && clip !== 'sweep' && clip !== 'shudder' && clip !== 'bow_in') {
          if (clip !== 'walk') play('walk', true)
        }
      } else if (clip === 'walk') play('idle', true)
    }
    root.position.set(bossX, footY(bossX), bossZ)
    root.rotation.y = bossYaw
    if (clip !== 'cast') host.moveCap(bossX, bossZ, 6.1, 0.9)
    if (host.vulnerable()) {
      const dx = px - bossX
      const dz = pz - bossZ
      if (dx * dx + dz * dz < 1.5 * 1.5) host.hurt(30, false)
    }
  }

  function playerDrag(px: number, pz: number) {
    if (host.cutting()) {
      slowMul = 1
      host.bed('pitch_bubble', 0)
      return
    }
    const p = host.pitch(px, pz)
    if (p === 0) {
      slowMul = 1
      host.bed('pitch_bubble', 0)
      return
    }
    host.bed('pitch_bubble', p === 2 ? 0.8 : 0.35)
    if (p === 2) {
      slowMul = 0.65
      host.hurt(3 * lastDt, true)
    } else slowMul = 1
  }

  function reset() {
    alive.fill(0)
    mesh.visible = false
    mesh.count = 0
    phase = 0
    hp = BOSS_HP
    awake = false
    bossX = -1
    bossZ = 0
    bossYaw = Math.PI / 2
    castCd = 4
    sweepCd = 3
    bowT = 0
    bowDmg = 0
    bowLane = -1
    pulls = 0
    breaks = 0
    stagger = 0
    approach = 0
    cleared = false
    deathPuddle = false
    hold = false
    packed = false
    culled = false
    teleMin = 99
    newelTele = 99
    mixerN = 0
    clip = ''
    current = null
    phases.wake = -1
    phases.p2 = -1
    phases.p3 = -1
    phases.dead = -1
    showPuddle(false)
    if (skin) skin.visible = true
    if (skinMat && asleep) {
      skinMat.emissiveMap = asleep
      skinMat.emissiveIntensity = 0.6
    }
    const dormant = actions.dormant
    if (mixer && dormant) {
      dormant.reset()
      dormant.setLoop(LoopOnce, 1)
      dormant.clampWhenFinished = true
      dormant.play()
      mixer.update(Math.max(0.033, dormant.getClip().duration))
      dormant.paused = true
      current = dormant
      clip = 'dormant'
      prevT = 0
    }
    if (root) {
      root.position.set(-1, footY(-1), 0)
      root.rotation.y = Math.PI / 2
      root.visible = true
    }
    u.laneOn.value = 0
    u.arc.value.set(0, 0, 0, 0)
    u.ring.value.set(0, 0, 0, 0)
    for (let i = 0; i < 4; i++) u.pounce.value[i]?.set(0, 0, 0, 0)
    host.bed('newel_bow', 0)
    host.bed('pitch_bubble', 0)
  }

  return {
    bind(parts) {
      root = parts.root
      skin = parts.mesh
      skinMat = parts.mat
      eyes = parts.eyes
      mixer = parts.mixer
      disc = parts.disc
      for (let i = 0; i < parts.clips.length; i++) {
        const c = parts.clips[i]
        if (!c) continue
        actions[c.name] = parts.mixer.clipAction(c)
      }
      asleep = parts.mat.emissiveMap
    },
    reset,
    clear() {
      mesh.visible = false
      puddle.visible = false
      deathPuddle = false
      if (root) root.visible = true
      if (skin) skin.visible = true
      host.bed('newel_bow', 0)
      host.bed('pitch_bubble', 0)
    },
    tick(dt, time, px, pz, camera) {
      const t0 = performance.now()
      hostNow = time
      lastDt = dt
      u.now.value = time
      pounceWrite = 0
      for (let i = 0; i < 4; i++) u.pounce.value[i]?.set(0, 0, 0, 0)
      if (!hold) {
        pack(time)
        stepEnemies(dt, px, pz)
        tickBoss(dt, time, px, pz)
        playerDrag(px, pz)
      }
      frameBoss(camera, px, pz)
      writeCrowd()
      fightMs += performance.now() - t0
      fightN++
    },
    plan(time) {
      const boss = time >= 270 && !cleared
      planShare.boss = boss
      if (boss) planShare.courser = 0.25
      else if (time >= 60) planShare.courser = Math.min(0.15, 0.15 * ((time - 60) / 150))
      else planShare.courser = 0
      if (!boss && time >= 120) planShare.hushmaw = Math.min(0.08, 0.08 * ((time - 120) / 120))
      else planShare.hushmaw = 0
      return planShare
    },
    spawn,
    pack,
    near(x, z, range) {
      let best = -1
      let bestD = range
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const d = Math.hypot((xA[i] ?? 0) - x, (zA[i] ?? 0) - z)
        if (d < bestD) { bestD = d; best = i }
      }
      if (best < 0) return null
      return { x: xA[best] ?? 0, z: zA[best] ?? 0 }
    },
    hit(x, z, radius, base, source, might, stamp) {
      let hit = false
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        if (stamp !== 0 && stampA[i] === stamp) continue
        const dx = (xA[i] ?? 0) - x
        const dz = (zA[i] ?? 0) - z
        if (dx * dx + dz * dz > r2) continue
        stampA[i] = stamp
        const lit = enemyLit(i, stA[i] === 4)
        const dmg = taken(base, source, might, lit)
        hpA[i] = (hpA[i] ?? 0) - dmg
        hit = true
        if ((hpA[i] ?? 0) <= 0) {
          if (stA[i] === 4 || ((fedA[i] ?? -1) >= 0 && hostNow - (fedA[i] ?? 0) <= 0.5)) feedTries++
          killAt(i)
        }
      }
      return hit
    },
    soak(x, z, radius, base, source, might, stamp) {
      if (!awake || hp <= 0) return false
      if (stamp !== 0 && stamp === lastStamp) return false
      const dx = bossX - x
      const dz = bossZ - z
      if (dx * dx + dz * dz > (radius + 1.5) * (radius + 1.5)) return false
      lastStamp = stamp
      const dmg = taken(base, source, might, bossExposed()) * HIT_SCALE
      hp -= dmg
      if (phase === 2 && (clip === 'bow_in' || clip === 'bow_hold')) bowDmg += dmg
      if (hp < 0) hp = 0
      return true
    },
    drag() {
      return { slow: slowMul }
    },
    boss() {
      if (!awake || deathPuddle) return null
      return { x: bossX, z: bossZ, r: 1.5 }
    },
    cleared: () => cleared,
    cull: () => {
      if (!culled) return false
      culled = false
      return true
    },
    pose(which) {
      hold = true
      if (!root || !mixer) return
      awake = true
      phase = which === 'p3' || which === 'sweep' ? 3 : which === 'bow' || which === 'break' ? 2 : 1
      glow()
      const name = which === 'wake' ? 'wake' : which === 'sweep' ? 'sweep' : which === 'bow' ? 'bow_hold' : which === 'break' ? 'bow_break' : which === 'death' || which === 'puddle' ? 'death' : 'cast'
      play(name, name === 'bow_hold')
      const at = which === 'wake' ? 1.2 : which === 'sweep' ? 0.45 : which === 'bow' ? 0.4 : which === 'break' ? 0.3 : which === 'death' ? 2.15 : which === 'puddle' ? 2.55 : 0.8
      if (current) {
        current.time = at
        mixer.update(0)
        current.time = at
      }
      if (which === 'wake') bossX = -0.7
      if (which === 'bow' || which === 'break') { bossX = 5.2; bossZ = 0 }
      root.position.set(bossX, footY(bossX), bossZ)
      root.rotation.y = bossYaw
      if (name === 'cast') setLane(true, 0.5)
      else setLane(false, 0)
      if (which === 'sweep') u.arc.value.set(bossX, bossZ, bossYaw, 4.5)
      else u.arc.value.set(0, 0, 0, 0)
      if (which === 'bow') u.ring.value.set(bossX, bossZ, 3.4, 0.45)
      else u.ring.value.set(0, 0, 0, 0)
      showPuddle(which === 'puddle' || which === 'death')
      if (which === 'p3') phase = 3
    },
    placeBoss(x: number, z: number) {
      bossX = x
      bossZ = z
      root?.position.set(bossX, footY(bossX), bossZ)
    },
    info() {
      const sun = host.sun()
      let courserN = 0
      let hushCount = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        if ((kindA[i] ?? 0) > 0.5) hushCount++
        else courserN++
      }
      return {
        phase, hp, awake, clip, mixer: mixerN, pulls, breaks,
        enrage: hostNow >= 390,
        castEvery: (phase === 3 ? 4 : phase === 2 ? 6 : 5) / (hostNow >= 390 ? 1.5 : 1),
        speed: (phase === 3 ? 1.8 : 2) * (hostNow >= 390 ? 1.5 : 1),
        cleared, sunE: sun.e, courserN, hushN: hushCount,
        shadowT, lightT, shadowD, lightD, pounceShade, pounceLight, teleMin, newelTele,
        sealTraps, sealTries, hushPicks, hushMiss, drains, feedKills, feedTries,
        phases, scale: root?.scale.x ?? 1, hitScale: HIT_SCALE,
        clipT: current?.time ?? 0, slow: slowMul,
        lane: laneOn ? { ox: laneOx, oz: laneOz, dx: laneDx, dz: laneDz, half: 1.2 } : null,
      }
    },
    crowd() {
      const out: { k: number; x: number; z: number; st: number; hp: number; tm: number; yaw: number }[] = []
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        out.push({
          k: kindA[i] ?? 0,
          x: xA[i] ?? 0,
          z: zA[i] ?? 0,
          st: stA[i] ?? 0,
          hp: hpA[i] ?? 0,
          tm: tmA[i] ?? 0,
          yaw: yawA[i] ?? 0,
        })
      }
      return out
    },
    disc(camera) {
      if (!camera || !disc) return null
      disc.updateWorldMatrix(true, false)
      framePt.copy(DISC_LOCAL).applyMatrix4(disc.matrixWorld)
      frameNdc.copy(framePt).project(camera)
      const inFrame = frameNdc.z >= -1 && frameNdc.z <= 1 && Math.abs(frameNdc.x) <= 1 && Math.abs(frameNdc.y) <= 1
      return { x: frameNdc.x, y: frameNdc.y, z: frameNdc.z, wx: framePt.x, wy: framePt.y, wz: framePt.z, inFrame }
    },
    cpu() {
      return {
        steer: steerN ? steerMs / steerN : 0,
        hush: hushN ? hushMs / hushN : 0,
        fight: fightN ? fightMs / fightN : 0,
      }
    },
    warm(compile) {
      const show = mesh.visible
      mesh.visible = true
      compile(mesh)
      mesh.visible = show
      compile(puddle)
    },
  }

  function pack(time: number) {
    if (packed || time < 210 || time >= 270) return
    packed = true
    const sun = host.sun()
    const yaw = Math.atan2(sun.cos, sun.sin)
    for (let i = 0; i < 12; i++) {
      const n = NICHES[i % NICHES.length]
      if (!n) continue
      const x = n.x + (i % 3) * 0.35
      const z = n.z
      if (!spawn(3, x, z)) continue
      for (let s = MAX - 1; s >= 0; s--) {
        if (alive[s] && (kindA[s] ?? 1) < 0.5 && Math.abs((xA[s] ?? 0) - x) < 0.2) {
          fedA[s] = -2
          yawA[s] = yaw
          break
        }
      }
    }
  }
}

// A level-13 kit (spear 4, halo 3, might 4) on the open flight, with the
// spear held on the statue, kills 7,000 HP in about 55 s at scale 1. This
// scales boss hits only, so the same kit lands in the 70–100 s window.
// Shade adds are not scaled.
const HIT_SCALE = 0.64

function floorAt(x: number): number {
  if (x >= 14) return 0
  if (x >= 4) return 0.4
  if (x >= -6) return 0.8
  if (x >= -16) return 1.2
  return 1.6
}

function footY(x: number): number {
  return floorAt(x) + 0.6
}

function inSegment(px: number, pz: number, ox: number, oz: number, dx: number, dz: number, half: number): boolean {
  const ab2 = dx * dx + dz * dz
  if (ab2 < 1e-6) return false
  let t = ((px - ox) * dx + (pz - oz) * dz) / ab2
  if (t < 0) t = 0
  if (t > 1) t = 1
  const qx = ox + dx * t
  const qz = oz + dz * t
  return Math.hypot(px - qx, pz - qz) <= half
}

function inArc(px: number, pz: number, ox: number, oz: number, yaw: number, radius: number): boolean {
  const dx = px - ox
  const dz = pz - oz
  if (dx * dx + dz * dz > radius * radius) return false
  const ang = Math.atan2(dx, dz)
  let d = ang - yaw
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d) <= (150 * Math.PI) / 180 / 2
}

function shadeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const add = (part: number, w: number, h: number, d: number, x: number, y: number, z: number, color: { r: number; g: number; b: number }, emit: number) => {
    const geo = new BoxGeometry(w, h, d)
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const emitA = new Float32Array(pos.count)
    const partA = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
      emitA[i] = emit
      partA[i] = part
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.setAttribute('aEmit', new BufferAttribute(emitA, 1))
    geo.setAttribute('aPart', new BufferAttribute(partA, 1))
    geo.translate(x, y, z)
    parts.push(geo)
  }
  const ink = COLOR.umbral
  const rim = COLOR.umbralRim
  const gold = COLOR.gold
  add(0, 2.05, 0.16, 0.28, 0, 0.62, 0, ink, 0)
  add(0, 0.32, 0.14, 0.24, 0, 0.78, 0.72, rim, 0)
  add(0, 0.06, 0.55, 0.06, 0.55, 0.28, 0.35, ink, 0)
  add(0, 0.06, 0.55, 0.06, -0.55, 0.28, 0.35, ink, 0)
  add(0, 0.06, 0.62, 0.06, 0.7, 0.3, -0.55, ink, 0)
  add(0, 0.06, 0.62, 0.06, -0.7, 0.3, -0.55, ink, 0)
  add(0, 0.12, 0.08, 0.12, 0, 0.7, 0.1, gold, 2)
  add(1, 1.15, 0.32, 0.95, 0, 0.36, 0, ink, 0)
  add(1, 0.95, 0.1, 0.38, 0, 0.28, 0.48, rim, 0)
  add(1, 0.7, 0.26, 0.55, 0, 0.62, -0.05, ink, 0)
  add(1, 1.05, 0.08, 0.22, 0, 0.22, 0.55, rim, 0)
  add(1, 0.16, 0.1, 0.16, 0, 0.48, 0.1, gold, 2)
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('shade merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  merged.computeBoundingSphere()
  return merged
}

function shadeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aEmit;
      attribute float aPart;
      attribute vec4 iPose;
      attribute vec4 iExtra;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      float stairY(float z, float x) {
        float y = x >= 14.0 ? 0.0 : x >= 4.0 ? 0.4 : x >= -6.0 ? 0.8 : x >= -16.0 ? 1.2 : 1.6;
        return y;
      }
      void main() {
        vColor = color;
        vEmit = aEmit;
        vLit = iExtra.y;
        if (abs(aPart - iExtra.x) > 0.5) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }
        vec3 p = position;
        if (iExtra.z > 0.5) p *= 1.15;
        if (iExtra.w > 0.5) p.z *= 1.3;
        float yaw = iPose.z;
        float cy = cos(yaw);
        float sy = sin(yaw);
        float x2 = cy * p.x + sy * p.z;
        float z2 = -sy * p.x + cy * p.z;
        vec4 world = vec4(x2 + iPose.x, p.y + stairY(iPose.y, iPose.x), z2 + iPose.y, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      void main() {
        vec3 col = vColor;
        if (vEmit > 1.5) col = vLit > 0.5 ? vec3(0.95, 0.72, 0.28) : vColor;
        if (vLit < 0.5) col *= 0.78;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
