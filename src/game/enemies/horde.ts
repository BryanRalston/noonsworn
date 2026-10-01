import {
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
} from 'three'
import { TUNING, type DamageSource } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { slideCircle } from '../collision'
import { hashBuild, hashQuery } from '../spatialHash'
import { damageAmount } from '../sunClock'
import { createEnemyMaterial, makeCrowd } from '../../render/instancing'

const MAX = TUNING.hordeCap
const CHASE = 1
const TELE = 2
const LUNGE = 3
const RECOVER = 4
const STAGGER = 5
const DYING = 6
const QUERY = new Int16Array(48)

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
  count: () => number
  exposed: () => number
  capLive: () => number
  spawn: (type: 0 | 1, x: number, z: number, bench: boolean, limit?: number, fromX?: number, fromZ?: number) => number
  clear: () => void
  cullTo: (cap: number, px: number, pz: number) => void
  damage: (index: number, base: number, source: DamageSource, might: number) => 0 | 1 | 2
  slay: (index: number, ctx: HordeCtx) => void
  update: (ctx: HordeCtx) => void
  sync: (camX: number, camZ: number, high: boolean) => void
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
  knockFrom: (cx: number, cz: number, radius: number, dist: number) => void
  slow: (x: number, z: number, radius: number, seconds: number) => void
  frozen: boolean
  tris: { mite: number; hound: number }
  telegraphs: { x: number; z: number; yaw: number }[]
  onSpawn: ((kind: 0 | 1) => void) | null
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

export function createHorde(miteGeo: BufferGeometry, houndGeo: BufferGeometry): Horde {
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
  const miteMesh = makeCrowd(miteGeo, material, MAX)
  const houndMesh = makeCrowd(houndGeo, material, MAX)
  const miteA = attrs(miteMesh)
  const houndA = attrs(houndMesh)
  const miteTris = triCount(miteGeo)
  const houndTris = triCount(houndGeo)
  function occupy(i: number, kind: 0 | 1, sx: number, sz: number, isBench: boolean) {
    const spec = kind === 0 ? TUNING.mite : TUNING.hound
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
  }

  function kill(i: number, ctx: HordeCtx) {
    if (state[i] === DYING || !alive[i]) return
    state[i] = DYING
    stateT[i] = TUNING.deathTime
    scale[i] = 1
    let value: number = type[i] === 0 ? TUNING.mite.xp : TUNING.hound.xp
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
    },
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
        flash[i] = TUNING.hitFlash
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, dealt, litNow, killed, i)
        if (killed) kill(i, hitCtx)
      }
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
      flash[index] = TUNING.hitFlash
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
        flash[i] = TUNING.hitFlash
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, amount, lit[i] === 1, killed, i)
        if (killed) kill(i, hitCtx)
      }
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
        flash[i] = TUNING.hitFlash
        const killed = (hp[i] ?? 0) <= 0
        horde.onHit?.(x[i] ?? 0, z[i] ?? 0, amount, lit[i] === 1, killed, i)
        if (killed) kill(i, hitCtx)
      }
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
        const spec = type[i] === 0 ? TUNING.mite : TUNING.hound
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
      const amount = damageAmount(base, lit[index] === 1, source, might)
      hp[index] = (hp[index] ?? 0) - amount
      flash[index] = TUNING.hitFlash
      const killed = (hp[index] ?? 0) <= 0
      horde.onHit?.(x[index] ?? 0, z[index] ?? 0, amount, lit[index] === 1, killed, index)
      return killed ? 2 : 1
    },
    slay(index, ctx) {
      kill(index, ctx)
    },
    update(ctx) {
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
        if (state[i] === STAGGER) {
          stateT[i] = (stateT[i] ?? 0) - ctx.dt
          if ((stateT[i] ?? 0) <= 0) state[i] = CHASE
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
        if (ctx.separate) {
          const n = hashQuery(x[i] ?? 0, z[i] ?? 0, TUNING.separationRadius, QUERY)
          for (let k = 0; k < n; k++) {
            const j = QUERY[k] ?? -1
            if (j === i || j < 0 || !alive[j]) continue
            let ox = (x[i] ?? 0) - (x[j] ?? 0)
            let oz = (z[i] ?? 0) - (z[j] ?? 0)
            const d2 = ox * ox + oz * oz
            const rad = TUNING.separationRadius
            if (d2 > rad * rad || d2 < 1e-6) {
              if (d2 < 1e-6) sx += i % 2 === 0 ? 0.4 : -0.4
              continue
            }
            const d = Math.sqrt(d2)
            const push = (rad - d) / rad
            sx += (ox / d) * push
            sz += (oz / d) * push
          }
        }
        const sl = Math.hypot(sx, sz) || 1
        const spec = type[i] === 0 ? TUNING.mite : TUNING.hound
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
        x[i] = ox + (sx / sl) * spd * ctx.dt
        z[i] = oz + (sz / sl) * spd * ctx.dt
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
        const spec = type[i] === 0 ? TUNING.mite : TUNING.hound
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
        const spec = type[i] === 0 ? TUNING.mite : TUNING.hound
        const dx = ctx.px - (x[i] ?? 0)
        const dz = ctx.pz - (z[i] ?? 0)
        const reach = ctx.playerR + spec.radius
        if (dx * dx + dz * dz > reach * reach) continue
        if ((contact[i] ?? 0) > 0) continue
        if (state[i] !== CHASE && state[i] !== LUNGE && state[i] !== RECOVER && state[i] !== TELE) continue
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
      telegraphs.length = 0
      let miteFlash = false
      let miteLit = false
      let houndFlash = false
      let houndLit = false
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const s = Math.max(0.001, scale[i] ?? 1)
        const moving = state[i] === CHASE || state[i] === LUNGE ? 1 : 0
        const crouch = type[i] === 1 && state[i] === TELE ? 1 : 0
        const ph = phase[i] ?? 0
        const pack = ph + moving * 8 + crouch * 16 + Math.round(Math.min(1, s) * 32) * 32
        const hot = (flash[i] ?? 0) > 0 ? 1 : 0
        const litNow = lit[i] ?? 0
        const yawNow = yaw[i] ?? 0
        if (type[i] === 0) {
          miteA.pose.setXYZW(mites, x[i] ?? 0, z[i] ?? 0, yawNow, pack)
          if (miteA.flash.getX(mites) !== hot) {
            miteA.flash.setX(mites, hot)
            miteFlash = true
          }
          if (miteA.lit.getX(mites) !== litNow) {
            miteA.lit.setX(mites, litNow)
            miteLit = true
          }
          mites++
        } else {
          houndA.pose.setXYZW(hounds, x[i] ?? 0, z[i] ?? 0, yawNow, pack)
          if (houndA.flash.getX(hounds) !== hot) {
            houndA.flash.setX(hounds, hot)
            houndFlash = true
          }
          if (houndA.lit.getX(hounds) !== litNow) {
            houndA.lit.setX(hounds, litNow)
            houndLit = true
          }
          if (state[i] === TELE) telegraphs.push({ x: x[i] ?? 0, z: z[i] ?? 0, yaw: yawNow })
          hounds++
        }
      }
      finish(miteMesh, mites, miteA, miteFlash, miteLit)
      finish(houndMesh, hounds, houndA, houndFlash, houndLit)
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
