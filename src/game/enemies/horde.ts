import {
  BufferAttribute,
  DoubleSide,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from 'three'
import { COLOR } from '../../data/palette'
import { TUNING, type DamageSource } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { resolveCircle } from '../collision'
import { hashBuild, hashQuery } from '../spatialHash'
import { damageAmount } from '../sunClock'
import { houndGeometry, miteGeometry } from '../actors'
import { createEnemyMaterial, makeCrowd, writeInstance } from '../../render/instancing'

const MAX = TUNING.hordeCap
const CHASE = 1
const TELE = 2
const LUNGE = 3
const RECOVER = 4
const STAGGER = 5
const DYING = 6
const QUERY = new Int16Array(48)

function attrs(mesh: InstancedMesh) {
  const flash = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  const lit = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  const phase = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  const move = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  flash.setUsage(DynamicDrawUsage)
  lit.setUsage(DynamicDrawUsage)
  phase.setUsage(DynamicDrawUsage)
  move.setUsage(DynamicDrawUsage)
  mesh.geometry.setAttribute('iFlash', flash)
  mesh.geometry.setAttribute('iLit', lit)
  mesh.geometry.setAttribute('iPhase', phase)
  mesh.geometry.setAttribute('iMove', move)
  return { flash, lit, phase, move }
}

export interface Horde {
  x: Float32Array
  z: Float32Array
  alive: Uint8Array
  miteMesh: InstancedMesh
  houndMesh: InstancedMesh
  teleMesh: InstancedMesh
  count: () => number
  exposed: () => number
  capLive: () => number
  spawn: (type: 0 | 1, x: number, z: number, bench: boolean, limit?: number, fromX?: number, fromZ?: number) => number
  clear: () => void
  cullTo: (cap: number, px: number, pz: number) => void
  damage: (index: number, base: number, source: DamageSource, might: number) => 0 | 1 | 2
  slay: (index: number, ctx: HordeCtx) => void
  update: (ctx: HordeCtx) => void
  sync: () => void
  nearest: (x: number, z: number, range: number) => number
  onHit: ((x: number, z: number, amount: number, lit: boolean, killed: boolean, index: number) => void) | null
  onExpose: ((x: number, z: number) => void) | null
  visit: (fn: (x: number, z: number, kind: number) => void) => void
  radial: (x: number, z: number, radius: number, amount: number, ctx: HordeCtx) => void
  slow: (x: number, z: number, radius: number, seconds: number) => void
  tris: { mite: number; hound: number }
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
  onHurt: (amount: number) => void
  onHit: ((x: number, z: number, amount: number, lit: boolean, killed: boolean, index: number) => void) | null
  onExpose: ((x: number, z: number) => void) | null
  onXp: (x: number, z: number, value: number) => void
  onKill: () => void
  onDeath: (x: number, z: number, lit: boolean) => void
  onEmber: (x: number, z: number) => void
}

export function createHorde(): Horde {
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const hp = new Float32Array(MAX)
  const yaw = new Float32Array(MAX)
  const phase = new Float32Array(MAX)
  const flash = new Float32Array(MAX)
  const slowT = new Float32Array(MAX)
  const burnT = new Float32Array(MAX)
  const scale = new Float32Array(MAX)
  const stateT = new Float32Array(MAX)
  const contact = new Float32Array(MAX)
  const staggerAt = new Float32Array(MAX)
  const aimX = new Float32Array(MAX)
  const aimZ = new Float32Array(MAX)
  const travelled = new Float32Array(MAX)
  const type = new Uint8Array(MAX)
  const state = new Uint8Array(MAX)
  const lit = new Uint8Array(MAX)
  const litKnown = new Uint8Array(MAX)
  const alive = new Uint8Array(MAX)
  const bench = new Uint8Array(MAX)
  const free = new FreeList(MAX)
  const material = createEnemyMaterial()
  const miteGeo = miteGeometry()
  const houndGeo = houndGeometry()
  const miteMesh = makeCrowd(miteGeo, material, MAX)
  const houndMesh = makeCrowd(houndGeo, material, MAX)
  const miteA = attrs(miteMesh)
  const houndA = attrs(houndMesh)
  const lineGeo = new BufferGeometry()
  const linePos = new Float32Array([
    -0.72, 0.04, 0.08, 0.72, 0.04, 0.08, 0.72, 0.04, -1.08,
    -0.72, 0.04, 0.08, 0.72, 0.04, -1.08, -0.72, 0.04, -1.08,
    -0.4, 0.07, 0, 0.4, 0.07, 0, 0.4, 0.07, -1,
    -0.4, 0.07, 0, 0.4, 0.07, -1, -0.4, 0.07, -1,
  ])
  const lineCol = new Float32Array(12 * 3)
  for (let i = 0; i < 6; i++) {
    lineCol[i * 3] = 0.08
    lineCol[i * 3 + 1] = 0.04
    lineCol[i * 3 + 2] = 0.12
  }
  for (let i = 6; i < 12; i++) {
    lineCol[i * 3] = COLOR.telegraph.r
    lineCol[i * 3 + 1] = COLOR.telegraph.g
    lineCol[i * 3 + 2] = COLOR.telegraph.b
  }
  lineGeo.setAttribute('position', new BufferAttribute(linePos, 3))
  lineGeo.setAttribute('color', new BufferAttribute(lineCol, 3))
  const teleMesh = makeCrowd(
    lineGeo,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: DoubleSide,
    }),
    8,
  )
  teleMesh.renderOrder = 3

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
  }

  function kill(i: number, ctx: HordeCtx) {
    if (state[i] === DYING || !alive[i]) return
    state[i] = DYING
    stateT[i] = TUNING.deathTime
    scale[i] = 1
    const value = type[i] === 0 ? TUNING.mite.xp : TUNING.hound.xp
    ctx.onXp(x[i] ?? 0, z[i] ?? 0, value)
    ctx.onKill()
    ctx.onDeath(x[i] ?? 0, z[i] ?? 0, lit[i] === 1)
  }

  const horde: Horde = {
    x,
    z,
    alive,
    miteMesh,
    houndMesh,
    teleMesh,
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
        return best
      }
      if (!isBench && limit != null && horde.count() >= limit) return relocate()
      const slot = free.acquire()
      if (slot < 0) return relocate()
      occupy(slot, kind, sx, sz, isBench)
      return slot
    },
    clear() {
      alive.fill(0)
      state.fill(0)
      bench.fill(0)
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
    tris: {
      mite: miteGeo.getAttribute('position').count / 3,
      hound: houndGeo.getAttribute('position').count / 3,
    },
    radial(cx, cz, radius, amount, hitCtx) {
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
        if ((i + ctx.tick) % TUNING.litHzDiv === 0) {
          const now = ctx.isLit(x[i] ?? 0, z[i] ?? 0)
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
          x[i] = (x[i] ?? 0) + (aimX[i] ?? 0) * step
          z[i] = (z[i] ?? 0) + (aimZ[i] ?? 0) * step
          travelled[i] = (travelled[i] ?? 0) + step
          const moved = resolveCircle(x[i] ?? 0, z[i] ?? 0, TUNING.hound.radius)
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
          if ((hp[i] ?? 0) <= 0) kill(i, ctx)
        } else if (ctx.searing > 0 && lit[i] && state[i] !== DYING) {
          burnT[i] = 2
          ctx.onEmber(x[i] ?? 0, z[i] ?? 0)
        }
        if ((slowT[i] ?? 0) > 0) slowT[i] = (slowT[i] ?? 0) - ctx.dt
        const spd = spec.speed * (lit[i] ? TUNING.exposedSpeed : 1) * ((slowT[i] ?? 0) > 0 ? 0.6 : 1)
        x[i] = (x[i] ?? 0) + (sx / sl) * spd * ctx.dt
        z[i] = (z[i] ?? 0) + (sz / sl) * spd * ctx.dt
        const slid = resolveCircle(x[i] ?? 0, z[i] ?? 0, spec.radius)
        x[i] = slid.x
        z[i] = slid.z
        yaw[i] = yawFromDirection(sx, sz)
      }
      hashBuild(x, z, alive, MAX)
      if (!ctx.vulnerable()) return
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
    sync() {
      let mites = 0
      let hounds = 0
      let lines = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const s = Math.max(0.001, scale[i] ?? 1)
        const moving = state[i] === CHASE || state[i] === LUNGE ? 1 : 0
        if (type[i] === 0) {
          writeInstance(miteMesh, mites, x[i] ?? 0, 0, z[i] ?? 0, yaw[i] ?? 0, s * 1.7)
          miteA.flash.setX(mites, (flash[i] ?? 0) > 0 ? 1 : 0)
          miteA.lit.setX(mites, lit[i] ?? 0)
          miteA.phase.setX(mites, phase[i] ?? 0)
          miteA.move.setX(mites, moving)
          mites++
        } else {
          const crouch = state[i] === TELE ? 0.62 : 1
          writeInstance(houndMesh, hounds, x[i] ?? 0, 0, z[i] ?? 0, yaw[i] ?? 0, s * 1.35, s * 1.35 * crouch)
          houndA.flash.setX(hounds, (flash[i] ?? 0) > 0 ? 1 : 0)
          houndA.lit.setX(hounds, lit[i] ?? 0)
          houndA.phase.setX(hounds, phase[i] ?? 0)
          houndA.move.setX(hounds, moving)
          hounds++
          if (state[i] === TELE && lines < 8) {
            writeTele(teleMesh, lines, x[i] ?? 0, z[i] ?? 0, yaw[i] ?? 0)
            lines++
          }
        }
      }
      finish(miteMesh, mites, miteA)
      finish(houndMesh, hounds, houndA)
      teleMesh.count = lines
      teleMesh.visible = lines > 0
      if (lines > 0) teleMesh.instanceMatrix.needsUpdate = true
    },
  }
  return horde
}

const teleDummy = new Object3D()

function writeTele(mesh: InstancedMesh, index: number, x: number, z: number, yaw: number) {
  teleDummy.position.set(x, 0, z)
  teleDummy.rotation.set(0, yaw, 0)
  teleDummy.scale.set(0.55, 1, TUNING.hound.line)
  teleDummy.updateMatrix()
  mesh.setMatrixAt(index, teleDummy.matrix)
}

function finish(
  mesh: InstancedMesh,
  count: number,
  a: { flash: InstancedBufferAttribute; lit: InstancedBufferAttribute; phase: InstancedBufferAttribute; move: InstancedBufferAttribute },
) {
  mesh.count = count
  mesh.visible = count > 0
  if (count > 0) {
    mesh.instanceMatrix.needsUpdate = true
    a.flash.needsUpdate = true
    a.lit.needsUpdate = true
    a.phase.needsUpdate = true
    a.move.needsUpdate = true
  }
}
