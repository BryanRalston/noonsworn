import { TUNING } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { hashQuery } from '../spatialHash'
import { resolveCircle, segmentBlocked } from '../collision'
import { hasteMul } from '../sunClock'
import type { Horde, HordeCtx } from '../enemies/horde'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import { type WeaponFx } from './fx'

const HITN = 16
const BODY_Y = 0.9
/** Throw clip reaches throw_release at 0.1667 s. Aim has to cover that wait plus the flight. */
const RELEASE = 0.17

const MAX = TUNING.tiers.high.projectiles
const QUERY = new Int16Array(32)
const lead = { x: 0, z: 0 }

function segT(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const abx = bx - ax
  const abz = bz - az
  const ab2 = abx * abx + abz * abz
  if (ab2 < 1e-8) return 0
  let t = ((px - ax) * abx + (pz - az) * abz) / ab2
  if (t < 0) return 0
  if (t > 1) return 1
  return t
}

function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const t = segT(ax, az, bx, bz, px, pz)
  const dx = ax + (bx - ax) * t - px
  const dz = az + (bz - az) * t - pz
  return dx * dx + dz * dz
}

export interface SpearStats {
  damage: number
  pierce: number
  count: number
  cooldown: number
}

export function spearStats(level: number): SpearStats {
  let damage = TUNING.spear.baseDamage
  let pierce = TUNING.spear.basePierce
  let count = 1
  let cooldown = TUNING.spear.baseCooldown
  if (level >= 2) pierce += TUNING.spear.levelPierce
  if (level >= 3) damage += TUNING.spear.levelDamage
  if (level >= 4) count = 2
  if (level >= 5) {
    damage += TUNING.spear.levelDamage
    cooldown -= TUNING.spear.levelCooldown
  }
  return { damage, pierce, count, cooldown }
}

export function spearText(level: number): string {
  if (level <= 0) return "Throw a lance. Lit foes don't stop it; shaded foes are Gleamed."
  if (level === 1) return 'L2: +1 pierce'
  if (level === 2) return 'L3: +6 damage'
  if (level === 3) return 'L4: a second spear, fanned'
  if (level === 4) return 'L5: +6 damage, faster throws'
  return 'Sunspear is mastered'
}

export interface Sunspear {
  cooldown: number
  rank: number
  update: (
    dt: number,
    px: number,
    pz: number,
    horde: Horde,
    level: number,
    haste: number,
    might: number,
    cap: number,
    ctx: HordeCtx,
  ) => void
  sync: () => void
  clear: () => void
  kick: (px: number, pz: number, ang: number, level: number, cap: number) => void
  used: () => number
  onFire: (() => void) | null
  onWindup: (() => void) | null
  onImpact: ((x: number, z: number, lit: boolean) => void) | null
  /** Spawn the armed volley at the spear tip. The throw clip calls this on throw_release. */
  release: (x: number, z: number) => void
  /** Places n live lances for the upload measurement. */
  seed: (n: number, px: number, pz: number) => void
  /** True when a body at this height is inside the view the player already has. */
  see: (x: number, z: number) => boolean
  throws: number
  connects: number
}

export function createSunspear(fx: WeaponFx, arsenal: Arsenal): Sunspear {
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vz = new Float32Array(MAX)
  const life = new Float32Array(MAX)
  const pierce = new Int16Array(MAX)
  const dmg = new Float32Array(MAX)
  const alive = new Uint8Array(MAX)
  const hits = new Int16Array(MAX * HITN)
  const gleamed = new Uint8Array(MAX)
  const trailAt = new Float32Array(MAX)
  const serial = new Int32Array(MAX)
  const bossed = new Uint8Array(MAX)
  const linked = new Uint8Array(MAX)
  const live = new Int16Array(MAX)
  const liveAt = new Int16Array(MAX)
  let liveN = 0
  let nextSerial = 100000
  const free = new FreeList(MAX)
  liveAt.fill(-1)

  function remember(i: number) {
    liveAt[i] = liveN
    live[liveN] = i
    liveN++
  }

  function forget(i: number) {
    const at = liveAt[i] ?? -1
    if (at < 0) return
    const last = liveN - 1
    const moved = live[last] ?? -1
    live[at] = moved
    if (moved >= 0) liveAt[moved] = at
    liveN = last
    liveAt[i] = -1
  }

  function note(i: number) {
    if (linked[i]) return
    linked[i] = 1
    spear.connects++
  }

  function inbound(ex: number, ez: number): number {
    let sum = 0
    const hitR2 = TUNING.spear.hit * TUNING.spear.hit
    const speed = TUNING.spear.speed
    for (let n = 0; n < liveN; n++) {
      const i = live[n] ?? -1
      if (i < 0) continue
      const reach = Math.min(life[i] ?? 0, 0.35) * speed
      const sx = x[i] ?? 0
      const sz = z[i] ?? 0
      const bx = sx + ((vx[i] ?? 0) / speed) * reach
      const bz = sz + ((vz[i] ?? 0) / speed) * reach
      if (segDist2(sx, sz, bx, bz, ex, ez) <= hitR2) sum += dmg[i] ?? 0
    }
    return sum
  }

  function drop(i: number) {
    alive[i] = 0
    life[i] = 0
    forget(i)
    free.release(i)
  }

  let lastHorde: Horde | null = null

  function pickDir(px: number, pz: number, horde: Horde, windup: number, see: (x: number, z: number) => boolean): { x: number; z: number } | null {
    const speed = TUNING.spear.speed
    const range2 = TUNING.spear.range * TUNING.spear.range
    let aimD = 1e9
    let aimX = 0
    let aimZ = 0
    let aimed = false
    const boss = horde.bossAt
    if (boss) {
      const dx = boss.x - px
      const dz = boss.z - pz
      const d = Math.hypot(dx, dz)
      if (d <= TUNING.spear.range + boss.r) {
        aimX = dx
        aimZ = dz
        aimD = d
        aimed = true
      }
    }
    if (aimed && horde.bossLock) return { x: aimX, z: aimZ }
    const annex = horde.annexNear?.(px, pz, TUNING.spear.range)
    if (annex && (annex.hp ?? 1) > 0) {
      const dist = Math.hypot(annex.x - px, annex.z - pz)
      const fly = Math.max(0, dist / speed + windup - (annex.wind ?? 0))
      const ax = annex.x + (annex.vx ?? 0) * fly
      const az = annex.z + (annex.vz ?? 0) * fly
      const dx = ax - px
      const dz = az - pz
      const d = Math.hypot(dx, dz)
      if (d < aimD && d <= TUNING.spear.range && !segmentBlocked(px, pz, ax, az) && see(ax, az)) {
        aimX = dx
        aimZ = dz
        aimD = d
        aimed = true
      }
    }
    let pick = -1
    let pickD = aimD * aimD
    let seen = -1
    let seenD = aimD * aimD
    const slots = horde.x.length
    for (let s = 0; s < slots; s++) {
      if (!horde.living(s)) continue
      const ex = horde.x[s] ?? 0
      const ez = horde.z[s] ?? 0
      const rdx = ex - px
      const rdz = ez - pz
      const cur2 = rdx * rdx + rdz * rdz
      if (cur2 > range2) continue
      const clear = !segmentBlocked(px, pz, ex, ez)
      const doomed = horde.hpOf(s) <= inbound(ex, ez)
      if (clear && cur2 < pickD) {
        pick = s
        pickD = cur2
      }
      if (clear && !doomed && see(ex, ez) && cur2 < seenD) {
        seen = s
        seenD = cur2
      }
    }
    const pickNear = pick >= 0 ? Math.sqrt(pickD) : 0
    const chosen = seen >= 0 && seenD <= (pickNear + 2) * (pickNear + 2) ? seen : pick
    if (chosen < 0) return aimed ? { x: aimX, z: aimZ } : null
    const ex = horde.x[chosen] ?? 0
    const ez = horde.z[chosen] ?? 0
    let flight = Math.hypot(ex - px, ez - pz) / speed + windup
    horde.forecast(chosen, flight, lead)
    flight = Math.hypot(lead.x - px, lead.z - pz) / speed + windup
    horde.forecast(chosen, flight, lead)
    let ax = lead.x
    let az = lead.z
    if (segmentBlocked(px, pz, ax, az)) {
      ax = ex
      az = ez
    }
    return { x: ax - px, z: az - pz }
  }

  let wind: { ang: number; damage: number; pierce: number; count: number; spread: number; cap: number } | null = null
  let windAge = 0

  function launch(px: number, pz: number, ang: number, damage: number, pierceLeft: number, cap: number) {
    if (free.used >= cap) return
    const i = free.acquire()
    if (i < 0) return
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    x[i] = px
    z[i] = pz
    vx[i] = c * TUNING.spear.speed
    vz[i] = s * TUNING.spear.speed
    life[i] = TUNING.spear.life
    pierce[i] = pierceLeft
    dmg[i] = damage
    alive[i] = 1
    trailAt[i] = 0
    serial[i] = nextSerial++
    bossed[i] = 0
    gleamed[i] = 0
    linked[i] = 0
    remember(i)
    const base = i * HITN
    for (let h = 0; h < HITN; h++) hits[base + h] = -1
  }

  const spear: Sunspear = {
    cooldown: 0.35,
    used: () => free.used,
    kick(px, pz, ang, level, cap) {
      void px
      void pz
      arm(ang, level, 0, cap)
    },
    seed(n, px, pz) {
      const count = Math.max(0, Math.min(n, MAX))
      for (let i = 0; i < count; i++) launch(px, pz, (i / Math.max(1, count)) * Math.PI * 2, TUNING.spear.baseDamage, TUNING.spear.basePierce, MAX)
    },
    onFire: null,
    onWindup: null,
    release(ox, oz) {
      const armed = wind
      if (!armed) return
      wind = null
      let ang = armed.ang
      if (lastHorde) {
        const fresh = pickDir(ox, oz, lastHorde, 0, spear.see)
        if (fresh) ang = Math.atan2(fresh.z, fresh.x)
      }
      const before = liveN
      if (armed.count <= 1) launch(ox, oz, ang, armed.damage, armed.pierce, armed.cap)
      else {
        launch(ox, oz, ang - armed.spread, armed.damage, armed.pierce, armed.cap)
        launch(ox, oz, ang + armed.spread, armed.damage, armed.pierce, armed.cap)
      }
      spear.throws += liveN - before
      spear.onFire?.()
    },
    onImpact: null,
    see: () => true,
    throws: 0,
    connects: 0,
    rank: 1,
    clear() {
      alive.fill(0)
      life.fill(0)
      free.reset()
      liveN = 0
      liveAt.fill(-1)
      wind = null
      spear.cooldown = 0.35
      spear.throws = 0
      spear.connects = 0
    },
    update(dt, px, pz, horde, level, haste, might, cap, ctx) {
      lastHorde = horde
      spear.rank = level
      spear.cooldown -= dt
      if (wind) {
        windAge += dt
        if (windAge > 0.5) wind = null
      }
      if (level > 0 && spear.cooldown <= 0 && !wind) {
        const boss = horde.bossAt
        let aimX = 0
        let aimZ = 0
        let aimD = 1e9
        let aimed = false
        if (boss) {
          const dx = boss.x - px
          const dz = boss.z - pz
          const d = Math.hypot(dx, dz)
          if (d <= TUNING.spear.range + boss.r) {
            aimX = dx
            aimZ = dz
            aimD = d
            aimed = true
          }
        }
        // The Newel bow has to land while a courser stands at Sela's heel.
        // Other temples still let a nearer body take the shot.
        if (!(aimed && horde.bossLock)) {
          const solved = pickDir(px, pz, horde, RELEASE, spear.see)
          if (solved && Math.hypot(solved.x, solved.z) < aimD) {
            aimX = solved.x
            aimZ = solved.z
            aimed = true
          }
        }
        if (aimed) arm(Math.atan2(aimZ, aimX), level, haste, cap)
      }
      for (let n = 0; n < liveN; n++) {
        const i = live[n] ?? -1
        if (i < 0 || !alive[i]) continue
        const ox = x[i] ?? 0
        const oz = z[i] ?? 0
        const nx = ox + (vx[i] ?? 0) * dt
        const nz = oz + (vz[i] ?? 0) * dt
        const hitR = TUNING.spear.hit
        const hitR2 = hitR * hitR
        const seg = Math.hypot(nx - ox, nz - oz)
        const qR = seg * 0.5 + hitR > 1.4 ? seg * 0.5 + hitR : 1.4
        const found = hashQuery((ox + nx) * 0.5, (oz + nz) * 0.5, qR, QUERY)
        const base = i * HITN
        let gone = false
        for (let k = 0; k < found; k++) {
          const slot = QUERY[k] ?? -1
          if (slot < 0 || !horde.living(slot)) continue
          if (segDist2(ox, oz, nx, nz, horde.x[slot] ?? 0, horde.z[slot] ?? 0) > hitR2) continue
          let seen = false
          let open = -1
          for (let h = 0; h < HITN; h++) {
            const mark = hits[base + h]
            if (mark === slot) seen = true
            else if (mark === -1 && open < 0) open = h
          }
          if (seen) continue
          if (open >= 0) hits[base + open] = slot
          const wasLit = (horde.lit[slot] ?? 0) === 1
          const hit = horde.damage(slot, dmg[i] ?? 0, 'weapon', might)
          if (hit === 0) continue
          note(i)
          const hx = horde.x[slot] ?? nx
          const hz = horde.z[slot] ?? nz
          if (!wasLit && !gleamed[i]) {
            gleamed[i] = 1
            horde.gleamFor(slot, level >= 5 ? TUNING.gleam.timeL5 : TUNING.gleam.time, ctx.time)
          }
          spear.onImpact?.(hx, hz, wasLit)
          fx.hit(hx, hz, wasLit)
          fx.star(hx, hz)
          if (hit === 2) horde.slay(slot, ctx)
          if (!wasLit) pierce[i] = (pierce[i] ?? 1) - 1
          // A locked Newel shot keeps flying until it reaches the statue.
          // Pierce still spends on the crowd, but the crowd cannot delete it first.
          // Pierce 2 connects three times: the lance dies only after the count goes negative.
          if ((pierce[i] ?? 0) < 0 && (!horde.bossLock || bossed[i])) {
            drop(i)
            n--
            gone = true
            break
          }
        }
        if (gone) continue
        const samples = seg > 0.35 ? 2 : 1
        for (let s = samples; s >= 1 && alive[i] && !bossed[i]; s--) {
          const t = s / samples
          const sx = ox + (nx - ox) * t
          const sz = oz + (nz - oz) * t
          if (!horde.bossHit?.(sx, sz, hitR, dmg[i] ?? 0, 'weapon', might, serial[i] ?? 0)) continue
          bossed[i] = 1
          note(i)
          spear.onImpact?.(sx, sz, true)
          fx.hit(sx, sz, true)
          fx.star(sx, sz)
          pierce[i] = (pierce[i] ?? 1) - 1
          // One connection per throw. A second spear in the fan must not
          // re-open the stamp and strike again every frame.
          if (horde.bossLock || (pierce[i] ?? 0) < 0) {
            drop(i)
            n--
            gone = true
          }
        }
        if (gone) continue
        const slid = resolveCircle(nx, nz, TUNING.spear.radius)
        if (slid.x !== nx || slid.z !== nz) {
          // The plinth is solid. A locked shot that reaches the statue on the
          // frame the stone stops it still counts, once, then the spear is gone.
          if (!bossed[i] && horde.bossLock && horde.bossHit?.(nx, nz, hitR, dmg[i] ?? 0, 'weapon', might, serial[i] ?? 0)) {
            bossed[i] = 1
            note(i)
            spear.onImpact?.(nx, nz, true)
            fx.hit(nx, nz, true)
          }
          drop(i)
          n--
          continue
        }
        x[i] = nx
        z[i] = nz
        const big = level >= 5
        trailAt[i] = (trailAt[i] ?? 0) - dt
        if ((trailAt[i] ?? 0) <= 0) {
          trailAt[i] = 0.1
          const spd = Math.hypot(vx[i] ?? 0, vz[i] ?? 0) || 1
          const fxDir = (vx[i] ?? 0) / spd
          const fzDir = (vz[i] ?? 0) / spd
          const yaw = yawFromDirection(vx[i] ?? 0, vz[i] ?? 1)
          fx.ribbon(nx - fxDir * 0.7, BODY_Y - 0.15, nz - fzDir * 0.7, yaw, 2)
          fx.glint(nx + fxDir * 0.45, BODY_Y, nz + fzDir * 0.45, big ? 0.36 : 0.32)
        }
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) {
          drop(i)
          n--
        }
      }
    },
    sync() {
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const big = spear.rank >= 5
        // Local +Z is the tip. yawFromDirection points local −Z along velocity, so add half a turn.
        arsenal.add({
          kind: ARSENAL_PART.lance,
          x: x[i] ?? 0,
          y: BODY_Y,
          z: z[i] ?? 0,
          yaw: yawFromDirection(vx[i] ?? 0, vz[i] ?? 1) + Math.PI,
          scale: big ? 1.23 : 1,
          hot: 0,
          swing: 0,
        })
      }
    },
  }
  return spear

  function arm(ang: number, level: number, haste: number, cap: number) {
    const stats = spearStats(Math.max(1, level))
    const spread = (TUNING.spear.fanDeg * Math.PI) / 180
    wind = { ang, damage: stats.damage, pierce: stats.pierce, count: stats.count, spread, cap }
    windAge = 0
    spear.rank = Math.max(1, level)
    spear.cooldown = stats.cooldown * hasteMul(haste)
    spear.onWindup?.()
  }
}
