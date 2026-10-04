import { TUNING } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { hashQuery } from '../spatialHash'
import { resolveCircle } from '../collision'
import { hasteMul } from '../sunClock'
import type { Horde, HordeCtx } from '../enemies/horde'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import { type WeaponFx } from './fx'

const HITN = 16

const MAX = TUNING.tiers.high.projectiles
const QUERY = new Int16Array(32)

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
  let nextSerial = 100000
  const free = new FreeList(MAX)

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
      if (armed.count <= 1) launch(ox, oz, armed.ang, armed.damage, armed.pierce, armed.cap)
      else {
        launch(ox, oz, armed.ang - armed.spread, armed.damage, armed.pierce, armed.cap)
        launch(ox, oz, armed.ang + armed.spread, armed.damage, armed.pierce, armed.cap)
      }
      spear.onFire?.()
    },
    onImpact: null,
    rank: 1,
    clear() {
      alive.fill(0)
      life.fill(0)
      free.reset()
      wind = null
      spear.cooldown = 0.35
    },
    update(dt, px, pz, horde, level, haste, might, cap, ctx) {
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
          const annex = horde.annexNear?.(px, pz, TUNING.spear.range)
          if (annex) {
            const dx = annex.x - px
            const dz = annex.z - pz
            const d = Math.hypot(dx, dz)
            if (d < aimD) {
              aimX = dx
              aimZ = dz
              aimD = d
              aimed = true
            }
          }
          const target = horde.nearest(px, pz, TUNING.spear.range)
          if (target >= 0) {
            const dx = (horde.x[target] ?? 0) - px
            const dz = (horde.z[target] ?? 0) - pz
            const d = Math.hypot(dx, dz)
            if (d < aimD) {
              aimX = dx
              aimZ = dz
              aimed = true
            }
          }
        }
        if (aimed) arm(Math.atan2(aimZ, aimX), level, haste, cap)
      }
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const nx = (x[i] ?? 0) + (vx[i] ?? 0) * dt
        const nz = (z[i] ?? 0) + (vz[i] ?? 0) * dt
        const slid = resolveCircle(nx, nz, TUNING.spear.radius)
        if (slid.x !== nx || slid.z !== nz) {
          // The plinth is solid. A locked shot that reaches the statue on the
          // frame the stone stops it still counts, once, then the spear is gone.
          if (!bossed[i] && horde.bossLock && horde.bossHit?.(nx, nz, TUNING.spear.hit, dmg[i] ?? 0, 'weapon', might, serial[i] ?? 0)) {
            bossed[i] = 1
            spear.onImpact?.(nx, nz, true)
            fx.hit(nx, nz, true)
          }
          alive[i] = 0
          life[i] = 0
          free.release(i)
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
          fx.ribbon(nx - fxDir * 0.7, 0.55, nz - fzDir * 0.7, yaw, 2)
          fx.glint(nx + fxDir * 0.45, 0.7, nz + fzDir * 0.45, big ? 0.36 : 0.32)
        }
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) {
          alive[i] = 0
          free.release(i)
          continue
        }
        const n = hashQuery(nx, nz, 1.4, QUERY)
        const base = i * HITN
        for (let k = 0; k < n; k++) {
          const slot = QUERY[k] ?? -1
          if (slot < 0 || !horde.alive[slot]) continue
          const dx = (horde.x[slot] ?? 0) - nx
          const dz = (horde.z[slot] ?? 0) - nz
          const hitR = TUNING.spear.hit
          if (dx * dx + dz * dz > hitR * hitR) continue
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
            alive[i] = 0
            life[i] = 0
            free.release(i)
            break
          }
        }
        // One connection per throw. Another weapon can replace the boss stamp;
        // a lance that already struck the statue must not strike it again.
        if (alive[i] && !bossed[i] && horde.bossHit?.(nx, nz, TUNING.spear.hit, dmg[i] ?? 0, 'weapon', might, serial[i] ?? 0)) {
          bossed[i] = 1
          spear.onImpact?.(nx, nz, true)
          fx.hit(nx, nz, true)
          fx.star(nx, nz)
          pierce[i] = (pierce[i] ?? 1) - 1
          // One connection per throw. A second spear in the fan must not
          // re-open the stamp and strike again every frame.
          if (horde.bossLock || (pierce[i] ?? 0) < 0) {
            alive[i] = 0
            life[i] = 0
            free.release(i)
          }
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
          y: 0.7,
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
