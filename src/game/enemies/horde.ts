import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TUNING, type DamageSource } from '../../data/tuning'
import { COLOR } from '../../data/palette'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { BEDS, slideCircle, steerBeds } from '../collision'
import { hashBuild, hashQuery } from '../spatialHash'
import { damageAmount } from '../sunClock'
import { createEnemyMaterial, makeCrowd, writeInstance } from '../../render/instancing'
import type { EnemyMesh, MorphLut } from '../charpack'

const MAX = TUNING.hordeCap
const CHASE = 1
const TELE = 2
const LUNGE = 3
const RECOVER = 4
const STAGGER = 5
const DYING = 6
const DART = 7
const QUERY = new Int16Array(48)

function specOf(kind: number): { hp: number; speed: number; radius: number; contact: number; xp: number } {
  if (kind === 2) return TUNING.darter
  if (kind === 1) return TUNING.hound
  return TUNING.mite
}

function nearestShade(x: number, z: number, isLit: (x: number, z: number) => boolean): { x: number; z: number; ok: boolean } {
  // Prefer the closest shade. The 3 m dart still wins when shade is that close.
  let best = 10.5
  let bx = x
  let bz = z
  let ok = false
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    for (let step = 1; step <= 20; step++) {
      const dist = step * 0.5
      const tx = x + c * dist
      const tz = z + s * dist
      if (isLit(tx, tz)) continue
      if (dist < best) {
        best = dist
        bx = tx
        bz = tz
        ok = true
      }
    }
  }
  return { x: bx, z: bz, ok }
}

function darterGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, color: { r: number; g: number; b: number }) => {
    const geo = new BoxGeometry(w, h, d)
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const emit = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.setAttribute('aEmit', new BufferAttribute(emit, 1))
    geo.translate(x, y, z)
    parts.push(geo)
  }
  const ink = COLOR.umbral
  const rim = COLOR.umbralRim
  add(0.22, 0.16, 0.95, 0, 0.28, 0, ink)
  add(0.38, 0.07, 0.26, 0, 0.42, 0.46, rim)
  add(0.06, 0.3, 0.06, 0.12, 0.15, 0.28, COLOR.ink)
  add(0.06, 0.3, 0.06, -0.12, 0.15, 0.28, COLOR.ink)
  add(0.06, 0.34, 0.06, 0.14, 0.17, -0.32, COLOR.ink)
  add(0.06, 0.34, 0.06, -0.14, 0.17, -0.32, COLOR.ink)
  add(0.5, 0.05, 0.05, 0.32, 0.36, 0.05, ink)
  add(0.5, 0.05, 0.05, -0.32, 0.36, 0.05, ink)
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('darter merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

function attrs(mesh: InstancedMesh) {
  const pose = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
  const flash = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  const lit = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  pose.setUsage(DynamicDrawUsage)
  flash.setUsage(DynamicDrawUsage)
  lit.setUsage(DynamicDrawUsage)
  mesh.geometry.setAttribute('iPose', pose)
  mesh.geometry.setAttribute('iFlash', flash)
  mesh.geometry.setAttribute('iLit', lit)
  return { pose, flash, lit }
}

export interface Horde {
  x: Float32Array
  z: Float32Array
  alive: Uint8Array
  state: Uint8Array
  miteMesh: InstancedMesh
  houndMesh: InstancedMesh
  darterMesh: InstancedMesh
  count: () => number
  exposed: () => number
  capLive: () => number
  spawn: (type: 0 | 1 | 2, x: number, z: number, bench: boolean, limit?: number, fromX?: number, fromZ?: number) => number
  clear: () => void
  cullTo: (cap: number, px: number, pz: number) => void
  damage: (index: number, base: number, source: DamageSource, might: number) => 0 | 1 | 2
  slay: (index: number, ctx: HordeCtx) => void
  update: (ctx: HordeCtx) => void
  sync: (camX: number, camZ: number, high: boolean) => void
  /** World y of a foot point. Lattice terraces override this; Sundial stays at 0. */
  ground: (z: number) => number
  face: (yaw: number) => void
  nearest: (x: number, z: number, range: number) => number
  onHit: ((x: number, z: number, amount: number, lit: boolean, killed: boolean, index: number) => void) | null
  onExpose: ((x: number, z: number) => void) | null
  visit: (fn: (x: number, z: number, kind: number) => void) => void
  radial: (x: number, z: number, radius: number, amount: number, ctx: HordeCtx) => void
  soak: (index: number, amount: number, expose: boolean, ctx: HordeCtx) => 0 | 1 | 2
  punishBox: (cx: number, cz: number, hx: number, hz: number, amount: number, ctx: HordeCtx) => void
  hurtRadius: (cx: number, cz: number, radius: number, amount: number, ctx: HordeCtx) => void
  staggerRing: (cx: number, cz: number, inner: number, outer: number, seconds: number) => void
  exposeBox: (cx: number, cz: number, half: number, freeze: number) => void
  knockFrom: (cx: number, cz: number, radius: number, dist: number) => void
  slow: (x: number, z: number, radius: number, seconds: number) => void
  frozen: boolean
  tris: { mite: number; hound: number; darter: number }
  telegraphs: { x: number; z: number; yaw: number }[]
  onSpawn: ((kind: 0 | 1 | 2) => void) | null
  onDart: (() => void) | null
  bossHit: ((x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean) | null
  bossAt: { x: number; z: number; r: number } | null
}

export interface HordeCtx {
  dt: number
  time: number
  tick: number
  px: number
  pz: number
  playerR: number
  iframe: number
  invuln: number
  vulnerable: () => boolean
  separate: boolean
  might: number
  searing: number
  isLit: (x: number, z: number) => boolean
  /** Enemies north of this line are unlit unless a coin bloom is alive. Sundial passes a value south of the arena. */
  shadeZ: number
  bloomLive: boolean
  guide: ((x: number, z: number, px: number, pz: number) => { x: number; z: number } | null) | null
  lureX: number
  lureZ: number
  lureR2: number
  pass: boolean
  onHurt: (amount: number) => void
  onHit: ((x: number, z: number, amount: number, lit: boolean, killed: boolean, index: number) => void) | null
  onExpose: ((x: number, z: number) => void) | null
  onXp: (x: number, z: number, value: number) => void
  onKill: () => void
  onDeath: (x: number, z: number, lit: boolean) => void
  onEmber: (x: number, z: number) => void
  onSpark: (x: number, z: number, lit: boolean) => void
}

function triCount(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3
  return geo.getAttribute('position').count / 3
}

function sampleMorph(lut: MorphLut, phase: number, out: number[]) {
  const cols = lut.cols
  const rows = cols > 0 ? (lut.weights.length / cols) | 0 : 0
  if (rows < 2) {
    for (let k = 0; k < out.length; k++) out[k] = 0
    return
  }
  const f = Math.min(0.9999, Math.max(0, phase)) * (rows - 1)
  const i0 = Math.floor(f)
  const i1 = Math.min(rows - 1, i0 + 1)
  const a = f - i0
  const n = Math.min(cols, out.length)
  for (let k = 0; k < n; k++) {
    const p = lut.weights[i0 * cols + k] ?? 0
    const q = lut.weights[i1 * cols + k] ?? 0
    out[k] = p * (1 - a) + q * a
  }
}

export function createHorde(miteSrc: EnemyMesh, houndSrc: EnemyMesh): Horde {
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const hp = new Float32Array(MAX)
  const yaw = new Float32Array(MAX)
  const phase = new Float32Array(MAX)
  const flash = new Float32Array(MAX)
  const slowT = new Float32Array(MAX)
  const burnT = new Float32Array(MAX)
  const burnVis = new Float32Array(MAX)
  const scale = new Float32Array(MAX)
  const stateT = new Float32Array(MAX)
  const contact = new Float32Array(MAX)
  const staggerAt = new Float32Array(MAX)
  const aimX = new Float32Array(MAX)
  const aimZ = new Float32Array(MAX)
  const travelled = new Float32Array(MAX)
  let bonusMites = 0
  const type = new Uint8Array(MAX)
  const state = new Uint8Array(MAX)
  const lit = new Uint8Array(MAX)
  const litKnown = new Uint8Array(MAX)
  const alive = new Uint8Array(MAX)
  const bench = new Uint8Array(MAX)
  const free = new FreeList(MAX)
  const material = createEnemyMaterial()
  const darterGeo = darterGeometry()
  const miteMesh = makeCrowd(miteSrc.geometry, miteSrc.material, MAX)
  const houndMesh = makeCrowd(houndSrc.geometry, houndSrc.material, MAX)
  const darterMesh = makeCrowd(darterGeo, material, MAX)
  darterMesh.visible = false
  const miteA = attrs(miteMesh)
  const houndA = attrs(houndMesh)
  const darterA = attrs(darterMesh)
  miteMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
  houndMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
  const miteMorph = new Mesh(miteSrc.geometry)
  const houndMorph = new Mesh(houndSrc.geometry)
  const miteMorphN = miteSrc.geometry.morphAttributes.position?.length ?? 0
  const houndMorphN = houndSrc.geometry.morphAttributes.position?.length ?? 0
  miteMorph.morphTargetInfluences = new Array(Math.max(miteMorphN, 1)).fill(0)
  houndMorph.morphTargetInfluences = new Array(Math.max(houndMorphN, 1)).fill(0)
  // setMorphAt sizes its texture from mesh.count. Allocate the full cap once.
  if (miteMorphN > 0) {
    miteMesh.count = MAX
    miteMesh.setMorphAt(0, miteMorph)
    miteMesh.count = 0
  }
  if (houndMorphN > 0) {
    houndMesh.count = MAX
    houndMesh.setMorphAt(0, houndMorph)
    houndMesh.count = 0
  }
  const miteW = miteMorph.morphTargetInfluences
  const houndW = houndMorph.morphTargetInfluences
  const miteShade = new Color()
  const houndShade = new Color()
  const body = new Float32Array(MAX)
  const squash = new Float32Array(MAX)
  let stepDt = 0
  const miteTris = triCount(miteSrc.geometry)
  const houndTris = triCount(houndSrc.geometry)
  const darterTris = triCount(darterGeo)
  const holdT = new Float32Array(MAX)
  const dartCd = new Float32Array(MAX)
  const steerT = new Float32Array(MAX)
  const wantDart = new Uint8Array(MAX)
  function occupy(i: number, kind: 0 | 1 | 2, sx: number, sz: number, isBench: boolean) {
    const spec = specOf(kind)
    x[i] = sx
    z[i] = sz
    hp[i] = spec.hp
    yaw[i] = 0
    phase[i] = (i % 17) * 0.37
    flash[i] = 0
    scale[i] = 1
    stateT[i] = 0
    contact[i] = 0
    staggerAt[i] = -10
    aimX[i] = 0
    aimZ[i] = 1
    travelled[i] = 0
    type[i] = kind
    state[i] = CHASE
    lit[i] = 0
    litKnown[i] = 0
    alive[i] = 1
    bench[i] = isBench ? 1 : 0
    slowT[i] = 0
    burnT[i] = 0
    burnVis[i] = 0
    holdT[i] = 0
    dartCd[i] = 0
    steerT[i] = 0
    wantDart[i] = 0
    const bucket = (i * 13) % 5
    body[i] = kind === 0 ? (bucket < 2 ? 0.8 : bucket < 4 ? 1 : 1.35) : kind === 1 ? 1.3 : 1
    squash[i] = 0
  }

  function sting(i: number) {
    flash[i] = TUNING.hitFlash
    squash[i] = 0.1
  }

  function kill(i: number, ctx: HordeCtx) {
    if (state[i] === DYING || !alive[i]) return
    state[i] = DYING
    stateT[i] = TUNING.deathTime
    scale[i] = 1
    let value = specOf(type[i] ?? 0).xp
    if (type[i] === 0 && bonusMites < 15) {
      bonusMites++
      value = 2
    }
    ctx.onXp(x[i] ?? 0, z[i] ?? 0, value)
    ctx.onKill()
    ctx.onDeath(x[i] ?? 0, z[i] ?? 0, lit[i] === 1)
  }

  const telegraphs: { x: number; z: number; yaw: number }[] = []
  const horde: Horde = {
    x,
    z,
    alive,
    state,
    miteMesh,
    houndMesh,
    darterMesh,
    count() {
      let n = 0
      for (let i = 0; i < MAX; i++) if (alive[i] && state[i] !== DYING) n++
      return n
    },
    exposed() {
      let n = 0
      let d = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING) continue
        d++
        if (lit[i]) n++
      }
      return d > 0 ? n / d : 0
    },
    capLive() {
      return free.used
    },
    spawn(kind, sx, sz, isBench, limit, fromX, fromZ) {
      const ox = fromX ?? sx
      const oz = fromZ ?? sz
      const relocate = () => {
        let best = -1
        let bestD = -1
        for (let i = 0; i < MAX; i++) {
          if (!alive[i] || state[i] === DYING || bench[i]) continue
          const dx = (x[i] ?? 0) - ox
          const dz = (z[i] ?? 0) - oz
          const d = dx * dx + dz * dz
          if (d > bestD) {
            bestD = d
            best = i
          }
        }
        if (best < 0) return -1
        occupy(best, kind, sx, sz, false)
        if (!isBench) horde.onSpawn?.(kind)
        return best
      }
      if (!isBench && limit != null && horde.count() >= limit) return relocate()
      const slot = free.acquire()
      if (slot < 0) return relocate()
      occupy(slot, kind, sx, sz, isBench)
      if (!isBench) horde.onSpawn?.(kind)
      return slot
    },
    frozen: false,
    clear() {
      alive.fill(0)
      state.fill(0)
      bench.fill(0)
      bonusMites = 0
      horde.frozen = false
      free.reset()
    },
    cullTo(cap, px, pz) {
      let live = horde.count()
      while (live > cap) {
        let best = -1
        let bestD = -1
        for (let i = 0; i < MAX; i++) {
          if (!alive[i] || state[i] === DYING) continue
          const dx = (x[i] ?? 0) - px
          const dz = (z[i] ?? 0) - pz
          const d = dx * dx + dz * dz
          if (d > bestD) {
            bestD = d
            best = i
          }
        }
        if (best < 0) break
        alive[best] = 0
        state[best] = 0
        free.release(best)
        live--
      }
    },
    onHit: null,
    onExpose: null,
    onSpawn: null,
    telegraphs,
    tris: {
      mite: miteTris,
      hound: houndTris,
      darter: darterTris,
    },
    onDart: null,
    ground: () => 0,
    bossHit: null,
    bossAt: null,
    radial(cx, cz, radius, amount, hitCtx) {
      if (horde.frozen) return
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        const dx = (x[i] ?? 0) - cx
        const dz = (z[i] ?? 0) - cz
        if (dx * dx + dz * dz > r2) continue
        const litNow = lit[i] === 1
        const dealt = amount * (litNow ? 2 : 1)
        hp[i] = (hp[i] ?? 0) - dealt
        sting(i)
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, dealt, litNow, killed, i)
        if (killed) kill(i, hitCtx)
      }
      horde.bossHit?.(cx, cz, radius, amount, 'weapon', hitCtx.might, 0)
    },
    soak(index, amount, expose, hitCtx) {
      if (horde.frozen) return 0
      if (!alive[index] || state[index] === DYING || bench[index]) return 0
      if (expose) {
        lit[index] = 1
        litKnown[index] = 1
        if (hitCtx.searing > 0 && (burnT[index] ?? 0) <= 0) {
          burnT[index] = 2
          hitCtx.onEmber(x[index] ?? 0, z[index] ?? 0)
        }
      }
      hp[index] = (hp[index] ?? 0) - amount
      sting(index)
      const killed = (hp[index] ?? 0) <= 0
      horde.onHit?.(x[index] ?? 0, z[index] ?? 0, amount, lit[index] === 1, killed, index)
      if (killed) kill(index, hitCtx)
      return killed ? 2 : 1
    },
    punishBox(cx, cz, hx, hz, amount, hitCtx) {
      if (horde.frozen) return
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        if (Math.abs((x[i] ?? 0) - cx) > hx || Math.abs((z[i] ?? 0) - cz) > hz) continue
        hp[i] = (hp[i] ?? 0) - amount
        sting(i)
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, amount, lit[i] === 1, killed, i)
        if (killed) kill(i, hitCtx)
      }
      horde.bossHit?.(cx, cz, Math.hypot(hx, hz), amount, 'weapon', hitCtx.might, 0)
    },
    hurtRadius(cx, cz, radius, amount, hitCtx) {
      if (horde.frozen) return
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        const dx = (x[i] ?? 0) - cx
        const dz = (z[i] ?? 0) - cz
        if (dx * dx + dz * dz > r2) continue
        hp[i] = (hp[i] ?? 0) - amount
        sting(i)
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, amount, lit[i] === 1, killed, i)
        if (killed) kill(i, hitCtx)
      }
      horde.bossHit?.(cx, cz, radius, amount, 'weapon', hitCtx.might, 0)
    },
    staggerRing(cx, cz, inner, outer, seconds) {
      const i2 = inner * inner
      const o2 = outer * outer
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        const dx = (x[i] ?? 0) - cx
        const dz = (z[i] ?? 0) - cz
        const d2 = dx * dx + dz * dz
        if (d2 < i2 || d2 > o2) continue
        state[i] = STAGGER
        stateT[i] = seconds
      }
    },
    exposeBox(cx, cz, half, freeze) {
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        if (Math.abs((x[i] ?? 0) - cx) > half || Math.abs((z[i] ?? 0) - cz) > half) continue
        lit[i] = 1
        litKnown[i] = 1
        wantDart[i] = 0
        if (state[i] !== STAGGER) {
          state[i] = STAGGER
          stateT[i] = TUNING.staggerTime
        }
        if (type[i] === 2) holdT[i] = freeze
      }
    },
    knockFrom(cx, cz, radius, dist) {
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING || bench[i]) continue
        const dx = (x[i] ?? 0) - cx
        const dz = (z[i] ?? 0) - cz
        const d2 = dx * dx + dz * dz
        if (d2 > r2 || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const ox = x[i] ?? 0
        const oz = z[i] ?? 0
        x[i] = ox + (dx / d) * dist
        z[i] = oz + (dz / d) * dist
        const spec = specOf(type[i] ?? 0)
        const slid = slideCircle(ox, oz, x[i] ?? 0, z[i] ?? 0, spec.radius)
        x[i] = slid.x
        z[i] = slid.z
      }
    },
    slow(cx, cz, radius, seconds) {
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || state[i] === DYING) continue
        const dx = (x[i] ?? 0) - cx
        const dz = (z[i] ?? 0) - cz
        if (dx * dx + dz * dz > r2) continue
        slowT[i] = Math.max(slowT[i] ?? 0, seconds)
      }
    },
    visit(fn) {
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || bench[i] || state[i] === DYING) continue
        fn(x[i] ?? 0, z[i] ?? 0, type[i] ?? 0)
      }
    },
    damage(index, base, source, might) {
      if (horde.frozen) return 0
      if (!alive[index] || state[index] === DYING || bench[index]) return 0
      const darting = type[index] === 2 && state[index] === DART
      let amount = damageAmount(base, lit[index] === 1 || darting, source, might)
      if (darting && source === 'cut') amount *= 1.5
      hp[index] = (hp[index] ?? 0) - amount
      sting(index)
      const killed = (hp[index] ?? 0) <= 0
      horde.onHit?.(x[index] ?? 0, z[index] ?? 0, amount, lit[index] === 1, killed, index)
      return killed ? 2 : 1
    },
    slay(index, ctx) {
      kill(index, ctx)
    },
    update(ctx) {
      stepDt = horde.frozen ? 0 : ctx.dt
      hashBuild(x, z, alive, MAX)
      if (horde.frozen) return
      const shadeZ = ctx.shadeZ
      const blooms = ctx.bloomLive
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || bench[i] || state[i] === DYING) continue
        if ((i + ctx.tick) % TUNING.litHzDiv !== 0) continue
        const ez = z[i] ?? 0
        const now = !blooms && ez < shadeZ ? false : ctx.isLit(x[i] ?? 0, ez)
        if (litKnown[i] && now && !lit[i]) {
          ctx.onExpose?.(x[i] ?? 0, z[i] ?? 0)
          if (type[i] === 2) wantDart[i] = 1
          if (ctx.time - (staggerAt[i] ?? -10) >= TUNING.staggerGap) {
            state[i] = STAGGER
            stateT[i] = TUNING.staggerTime
            staggerAt[i] = ctx.time
          }
        }
        litKnown[i] = 1
        lit[i] = now ? 1 : 0
      }
      let activeHounds = 0
      for (let i = 0; i < MAX; i++) {
        if (alive[i] && type[i] === 1 && (state[i] === TELE || state[i] === LUNGE)) activeHounds++
      }
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        flash[i] = Math.max(0, (flash[i] ?? 0) - ctx.dt)
        squash[i] = Math.max(0, (squash[i] ?? 0) - ctx.dt)
        contact[i] = Math.max(0, (contact[i] ?? 0) - ctx.dt)
        if (bench[i]) continue
        if (state[i] === DYING) {
          stateT[i] = (stateT[i] ?? 0) - ctx.dt
          scale[i] = Math.max(0, (stateT[i] ?? 0) / TUNING.deathTime)
          if ((stateT[i] ?? 0) <= 0) {
            alive[i] = 0
            state[i] = 0
            free.release(i)
          }
          continue
        }
        const dx = ctx.px - (x[i] ?? 0)
        const dz = ctx.pz - (z[i] ?? 0)
        const dist = Math.hypot(dx, dz) || 0.0001
        const nx = dx / dist
        const nz = dz / dist
        if (type[i] === 2) {
          dartCd[i] = Math.max(0, (dartCd[i] ?? 0) - ctx.dt)
          if ((holdT[i] ?? 0) > 0) holdT[i] = (holdT[i] ?? 0) - ctx.dt
        }
        if (state[i] === STAGGER) {
          stateT[i] = (stateT[i] ?? 0) - ctx.dt
          if ((stateT[i] ?? 0) <= 0) state[i] = CHASE
          if (state[i] === STAGGER) continue
        }
        if (type[i] === 2 && (holdT[i] ?? 0) > 0) continue
        if (type[i] === 2 && state[i] === CHASE && wantDart[i] && (dartCd[i] ?? 0) <= 0) {
          const spot = nearestShade(x[i] ?? 0, z[i] ?? 0, ctx.isLit)
          if (!spot.ok) wantDart[i] = 0
          else {
            state[i] = DART
            aimX[i] = spot.x
            aimZ[i] = spot.z
            travelled[i] = 0
            lit[i] = 1
            wantDart[i] = 0
            dartCd[i] = TUNING.darter.dartCd
            horde.onDart?.()
            continue
          }
        }
        if (type[i] === 2 && state[i] === DART) {
          const tx = aimX[i] ?? 0
          const tz = aimZ[i] ?? 0
          const mx = tx - (x[i] ?? 0)
          const mz = tz - (z[i] ?? 0)
          const left = Math.hypot(mx, mz) || 0.0001
          const step = Math.min(TUNING.darter.dart * ctx.dt, left)
          const ox = x[i] ?? 0
          const oz = z[i] ?? 0
          x[i] = ox + (mx / left) * step
          z[i] = oz + (mz / left) * step
          const slid = slideCircle(ox, oz, x[i] ?? 0, z[i] ?? 0, TUNING.darter.radius)
          x[i] = slid.x
          z[i] = slid.z
          travelled[i] = (travelled[i] ?? 0) + Math.hypot((x[i] ?? 0) - ox, (z[i] ?? 0) - oz)
          yaw[i] = yawFromDirection(mx, mz)
          lit[i] = 1
          const shaded = !ctx.isLit(x[i] ?? 0, z[i] ?? 0)
          const arrived = Math.hypot(tx - (x[i] ?? 0), tz - (z[i] ?? 0)) < 0.25
          const capped = (travelled[i] ?? 0) >= 10
          if (shaded || arrived || capped) {
            if (!shaded) {
              const again = nearestShade(x[i] ?? 0, z[i] ?? 0, ctx.isLit)
              const room = 10 - (travelled[i] ?? 0)
              if (again.ok && room > 0.2) {
                aimX[i] = again.x
                aimZ[i] = again.z
              } else if (again.ok) {
                x[i] = again.x
                z[i] = again.z
                lit[i] = 0
                state[i] = CHASE
              } else {
                state[i] = CHASE
              }
            } else {
              lit[i] = 0
              state[i] = CHASE
            }
          }
          continue
        }
        if (type[i] === 1 && state[i] === TELE) {
          stateT[i] = (stateT[i] ?? 0) - ctx.dt
          yaw[i] = yawFromDirection(aimX[i] ?? 0, aimZ[i] ?? 1)
          if ((stateT[i] ?? 0) <= 0) {
            state[i] = LUNGE
            travelled[i] = 0
          }
          continue
        }
        if (type[i] === 1 && state[i] === LUNGE) {
          const step = TUNING.hound.lungeSpeed * ctx.dt
          const ox = x[i] ?? 0
          const oz = z[i] ?? 0
          x[i] = ox + (aimX[i] ?? 0) * step
          z[i] = oz + (aimZ[i] ?? 0) * step
          travelled[i] = (travelled[i] ?? 0) + step
          const moved = slideCircle(ox, oz, x[i] ?? 0, z[i] ?? 0, TUNING.hound.radius)
          x[i] = moved.x
          z[i] = moved.z
          yaw[i] = yawFromDirection(aimX[i] ?? 0, aimZ[i] ?? 1)
          if ((travelled[i] ?? 0) >= TUNING.hound.lunge) {
            state[i] = RECOVER
            stateT[i] = TUNING.hound.recover
          }
          continue
        }
        if (state[i] === RECOVER) {
          stateT[i] = (stateT[i] ?? 0) - ctx.dt
          if ((stateT[i] ?? 0) <= 0) state[i] = CHASE
          continue
        }
        if (type[i] === 1 && state[i] === CHASE && dist <= TUNING.hound.range && activeHounds < TUNING.hound.maxActive) {
          state[i] = TELE
          stateT[i] = TUNING.hound.telegraph
          aimX[i] = nx
          aimZ[i] = nz
          activeHounds++
          continue
        }
        let sx = nx
        let sz = nz
        let lured = false
        if (ctx.lureR2 > 0) {
          const lx = ctx.lureX - (x[i] ?? 0)
          const lz = ctx.lureZ - (z[i] ?? 0)
          const ld2 = lx * lx + lz * lz
          if (ld2 < ctx.lureR2 && ld2 > 0.04) {
            const ld = Math.sqrt(ld2)
            sx = lx / ld
            sz = lz / ld
            lured = true
          }
        }
        if (!lured && ctx.guide) {
          const g = ctx.guide(x[i] ?? 0, z[i] ?? 0, ctx.px, ctx.pz)
          if (g) {
            sx = g.x
            sz = g.z
          }
        }
        if (type[i] === 2 && state[i] === CHASE) {
          steerT[i] = (steerT[i] ?? 0) - ctx.dt
          if ((steerT[i] ?? 0) <= 0) {
            steerT[i] = 0.25
            const heading = Math.atan2(nz, nx)
            let bestScore = 1e9
            let bx = nx
            let bz = nz
            for (let h = 0; h < 3; h++) {
              const off = (h - 1) * 0.8
              const ang = heading + off
              const cx = Math.cos(ang)
              const cz = Math.sin(ang)
              const lit = ctx.isLit((x[i] ?? 0) + cx * 1.5, (z[i] ?? 0) + cz * 1.5) ? 1 : 0
              const score = lit * 3 - (cx * nx + cz * nz)
              if (score < bestScore) {
                bestScore = score
                bx = cx
                bz = cz
              }
            }
            aimX[i] = bx
            aimZ[i] = bz
          }
          sx = (aimX[i] ?? nx) * 0.8 + nx * 0.45
          sz = (aimZ[i] ?? nz) * 0.8 + nz * 0.45
        }
        if (ctx.separate) {
          const rad = type[i] === 0 ? Math.max(TUNING.separationRadius, 0.55 + (body[i] ?? 1) * 0.55) : TUNING.separationRadius
          const n = hashQuery(x[i] ?? 0, z[i] ?? 0, rad, QUERY)
          for (let k = 0; k < n; k++) {
            const j = QUERY[k] ?? -1
            if (j === i || j < 0 || !alive[j]) continue
            let ox = (x[i] ?? 0) - (x[j] ?? 0)
            let oz = (z[i] ?? 0) - (z[j] ?? 0)
            const d2 = ox * ox + oz * oz
            if (d2 > rad * rad || d2 < 1e-6) {
              if (d2 < 1e-6) sx += i % 2 === 0 ? 0.4 : -0.4
              continue
            }
            const d = Math.sqrt(d2)
            const push = ((rad - d) / rad) * (type[i] === 0 ? 1.45 : 1)
            sx += (ox / d) * push
            sz += (oz / d) * push
          }
        }
        if (BEDS.length > 0 && sx * nx + sz * nz < 0.2) {
          sx += nx
          sz += nz
        }
        const spec = specOf(type[i] ?? 0)
        if ((burnT[i] ?? 0) > 0) {
          burnT[i] = (burnT[i] ?? 0) - ctx.dt
          hp[i] = (hp[i] ?? 0) - 4 * ctx.dt
          burnVis[i] = (burnVis[i] ?? 0) - ctx.dt
          if ((burnVis[i] ?? 0) <= 0) {
            burnVis[i] = ctx.searing >= 5 ? 0.22 : 0.4
            ctx.onSpark(x[i] ?? 0, z[i] ?? 0, lit[i] === 1)
          }
          if ((hp[i] ?? 0) <= 0) kill(i, ctx)
        } else if (ctx.searing > 0 && lit[i] && state[i] !== DYING) {
          burnT[i] = 2
          ctx.onEmber(x[i] ?? 0, z[i] ?? 0)
        }
        if ((slowT[i] ?? 0) > 0) slowT[i] = (slowT[i] ?? 0) - ctx.dt
        const spd = spec.speed * (lit[i] ? TUNING.exposedSpeed : 1) * ((slowT[i] ?? 0) > 0 ? 0.6 : 1)
        const ox = x[i] ?? 0
        const oz = z[i] ?? 0
        const along = steerBeds(ox, oz, spec.radius, sx, sz, ctx.px, ctx.pz)
        if (along) {
          sx = along.x
          sz = along.z
        }
        const steer = Math.hypot(sx, sz) || 1
        x[i] = ox + (sx / steer) * spd * ctx.dt
        z[i] = oz + (sz / steer) * spd * ctx.dt
        const slid = slideCircle(ox, oz, x[i] ?? 0, z[i] ?? 0, spec.radius)
        x[i] = slid.x
        z[i] = slid.z
        yaw[i] = yawFromDirection(sx, sz)
      }
      if (!ctx.pass) {
      const pushR = 0.9
      const pushR2 = pushR * pushR
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || bench[i] || state[i] === DYING) continue
        const dx = (x[i] ?? 0) - ctx.px
        const dz = (z[i] ?? 0) - ctx.pz
        const d2 = dx * dx + dz * dz
        if (d2 >= pushR2 || d2 < 1e-8) continue
        const d = Math.sqrt(d2)
        const spec = specOf(type[i] ?? 0)
        const spd = spec.speed * (lit[i] ? TUNING.exposedSpeed : 1) * ((slowT[i] ?? 0) > 0 ? 0.6 : 1)
        const push = Math.min(pushR - d, spd * ctx.dt * 1.5)
        const ox = x[i] ?? 0
        const oz = z[i] ?? 0
        x[i] = ox + (dx / d) * push
        z[i] = oz + (dz / d) * push
        const slid = slideCircle(ox, oz, x[i] ?? 0, z[i] ?? 0, spec.radius)
        x[i] = slid.x
        z[i] = slid.z
      }
      }
      hashBuild(x, z, alive, MAX)
      if (ctx.pass || !ctx.vulnerable()) return
      const near = hashQuery(ctx.px, ctx.pz, 2.2, QUERY)
      for (let k = 0; k < near; k++) {
        const i = QUERY[k] ?? -1
        if (i < 0 || !alive[i] || bench[i] || state[i] === DYING || state[i] === STAGGER) continue
        const spec = specOf(type[i] ?? 0)
        const dx = ctx.px - (x[i] ?? 0)
        const dz = ctx.pz - (z[i] ?? 0)
        const reach = ctx.playerR + spec.radius
        if (dx * dx + dz * dz > reach * reach) continue
        if ((contact[i] ?? 0) > 0) continue
        if (state[i] !== CHASE && state[i] !== LUNGE && state[i] !== RECOVER && state[i] !== TELE && state[i] !== DART) continue
        contact[i] = TUNING.contactGap
        const open = ctx.time < TUNING.openSeconds ? TUNING.openContact : 1
        ctx.onHurt(spec.contact * open)
        if (!ctx.vulnerable()) return
      }
    },
    nearest(px, pz, range) {
      let best = -1
      let bestD = range * range
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || bench[i] || state[i] === DYING) continue
        const dx = (x[i] ?? 0) - px
        const dz = (z[i] ?? 0) - pz
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best
    },
    face(angle) {
      for (let i = 0; i < MAX; i++) if (alive[i]) yaw[i] = angle
    },
    sync(_camX, _camZ, _high) {
      let mites = 0
      let hounds = 0
      let darters = 0
      telegraphs.length = 0
      let miteFlash = false
      let miteLit = false
      let houndFlash = false
      let houndLit = false
      let darterFlash = false
      let darterLit = false
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const s = Math.max(0.001, scale[i] ?? 1)
        const moving = state[i] === CHASE || state[i] === LUNGE || state[i] === DART ? 1 : 0
        const crouch = type[i] === 1 && state[i] === TELE ? 1 : 0
        const ph = phase[i] ?? 0
        const pack = ph + moving * 8 + crouch * 16 + Math.round(Math.min(1, s) * 32) * 32
        const hot = Math.min(1, (flash[i] ?? 0) / TUNING.hitFlash)
        const litNow = lit[i] ?? 0
        const yawNow = yaw[i] ?? 0
        const squish = Math.min(1, (squash[i] ?? 0) / 0.1)
        const sized = Math.max(0.001, (scale[i] ?? 1) * (body[i] ?? 1))
        if (type[i] === 2) {
          darterA.pose.setXYZW(darters, x[i] ?? 0, z[i] ?? 0, yawNow, pack)
          if (darterA.flash.getX(darters) !== hot) {
            darterA.flash.setX(darters, hot)
            darterFlash = true
          }
          if (darterA.lit.getX(darters) !== litNow) {
            darterA.lit.setX(darters, litNow)
            darterLit = true
          }
          darters++
        } else if (type[i] === 0) {
          writeInstance(miteMesh, mites, x[i] ?? 0, horde.ground(z[i] ?? 0), z[i] ?? 0, yawNow, sized * (1 + 0.1 * squish), sized * (1 - 0.1 * squish))
          if (moving && state[i] !== DYING) phase[i] = ((phase[i] ?? 0) + stepDt / 0.4) % 1
          else phase[i] = 0
          if (miteSrc.hop && miteMorphN > 0) sampleMorph(miteSrc.hop, phase[i] ?? 0, miteW)
          if (miteMorphN > 0) miteMesh.setMorphAt(mites, miteMorph)
          const jitter = 0.92 + ((i * 13) % 10) * 0.016
          miteShade.setRGB(jitter, jitter, jitter)
          miteMesh.setColorAt(mites, miteShade)
          miteA.flash.setX(mites, hot)
          miteA.lit.setX(mites, litNow)
          miteFlash = true
          miteLit = true
          mites++
        } else {
          writeInstance(houndMesh, hounds, x[i] ?? 0, horde.ground(z[i] ?? 0), z[i] ?? 0, yawNow, sized * (1 + 0.1 * squish), sized * (1 - 0.1 * squish))
          let morphPhase = 0
          let useLunge = false
          if (state[i] === TELE) {
            const tele = TUNING.hound.telegraph || 0.5
            const u = 1 - Math.min(1, (stateT[i] ?? 0) / tele)
            morphPhase = u * (0.1 / 0.35)
            useLunge = true
          } else if (state[i] === LUNGE) {
            const u = Math.min(1, (travelled[i] ?? 0) / Math.max(0.01, TUNING.hound.lunge))
            morphPhase = 0.1 / 0.35 + u * (1 - 0.1 / 0.35)
            useLunge = true
          } else if (moving && state[i] !== DYING) {
            phase[i] = ((phase[i] ?? 0) + stepDt / 0.5) % 1
            morphPhase = phase[i] ?? 0
          }
          const lut = useLunge ? houndSrc.lunge : houndSrc.gallop
          if (lut && houndMorphN > 0 && (useLunge || moving)) sampleMorph(lut, morphPhase, houndW)
          else for (let w = 0; w < houndW.length; w++) houndW[w] = 0
          if (houndMorphN > 0) houndMesh.setMorphAt(hounds, houndMorph)
          const jitter = 0.92 + ((i * 13) % 10) * 0.016
          houndShade.setRGB(jitter, jitter, jitter)
          houndMesh.setColorAt(hounds, houndShade)
          houndA.flash.setX(hounds, hot)
          houndA.lit.setX(hounds, litNow)
          houndFlash = true
          houndLit = true
          if (state[i] === TELE) telegraphs.push({ x: x[i] ?? 0, z: z[i] ?? 0, yaw: yawNow })
          hounds++
        }
      }
      finish(miteMesh, mites, miteA, miteFlash, miteLit)
      finish(houndMesh, hounds, houndA, houndFlash, houndLit)
      finish(darterMesh, darters, darterA, darterFlash, darterLit)
      if (mites > 0) {
        miteMesh.instanceMatrix.needsUpdate = true
        if (miteMesh.morphTexture) miteMesh.morphTexture.needsUpdate = true
        if (miteMesh.instanceColor) miteMesh.instanceColor.needsUpdate = true
      }
      if (hounds > 0) {
        houndMesh.instanceMatrix.needsUpdate = true
        if (houndMesh.morphTexture) houndMesh.morphTexture.needsUpdate = true
        if (houndMesh.instanceColor) houndMesh.instanceColor.needsUpdate = true
      }
    },
  }
  return horde
}

function finish(
  mesh: InstancedMesh,
  count: number,
  a: { pose: InstancedBufferAttribute; flash: InstancedBufferAttribute; lit: InstancedBufferAttribute },
  flashDirty: boolean,
  litDirty: boolean,
) {
  mesh.count = count
  mesh.visible = count > 0
  if (count > 0) {
    a.pose.clearUpdateRanges()
    a.pose.addUpdateRange(0, count * 4)
    a.pose.needsUpdate = true
  }
  if (count > 0 && flashDirty) a.flash.needsUpdate = true
  if (count > 0 && litDirty) a.lit.needsUpdate = true
}
