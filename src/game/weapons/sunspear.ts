import { ConeGeometry, CylinderGeometry, InstancedMesh, MeshLambertMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TUNING } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { makeCrowd, writeInstance } from '../../render/instancing'
import { yawFromDirection } from '../../core/math'
import { hashQuery } from '../spatialHash'
import { resolveCircle } from '../collision'
import type { Horde, HordeCtx } from '../enemies/horde'
import { FX, type WeaponFx } from './fx'

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
  if (level <= 0) return 'Throw a piercing spear'
  if (level === 1) return 'L2: +1 pierce'
  if (level === 2) return 'L3: +6 damage'
  if (level === 3) return 'L4: a second spear, fanned'
  if (level === 4) return 'L5: +6 damage, faster throws'
  return 'Sunspear is mastered'
}

export interface Sunspear {
  mesh: InstancedMesh
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
}

function spearGeometry() {
  const shaft = new CylinderGeometry(0.035, 0.05, 0.82, 6)
  shaft.rotateX(Math.PI / 2)
  shaft.translate(0, 0, -0.05)
  const tip = new ConeGeometry(0.09, 0.32, 5)
  tip.rotateX(Math.PI / 2)
  tip.translate(0, 0, 0.5)
  const merged = mergeGeometries([shaft, tip], false)
  shaft.dispose()
  tip.dispose()
  if (!merged) throw new Error('spear geometry failed')
  return merged
}

export function createSunspear(fx: WeaponFx): Sunspear {
  const mesh = makeCrowd(
    spearGeometry(),
    new MeshLambertMaterial({ color: 0xc88820, emissive: 0x4a3010, emissiveIntensity: 0.35 }),
    MAX,
  )
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vz = new Float32Array(MAX)
  const life = new Float32Array(MAX)
  const pierce = new Int16Array(MAX)
  const dmg = new Float32Array(MAX)
  const alive = new Uint8Array(MAX)
  const hits = new Int16Array(MAX * 4)
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
    const base = i * 4
    hits[base] = -1
    hits[base + 1] = -1
    hits[base + 2] = -1
    hits[base + 3] = -1
  }

  const spear: Sunspear = {
    mesh,
    cooldown: 0.35,
    used: () => free.used,
    kick(_px, _pz, ang, level, cap) {
      arm(ang, level, 0, cap)
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
          const len = 1.4
          fx.streak(nx - fxDir * len * 0.35, 0.55, nz - fzDir * len * 0.35, yaw, len, 0.15, 0.28, FX.goldBlade)
          fx.streak(nx - fxDir * 0.85, 0.4, nz - fzDir * 0.85, yaw, 1, 0.1, 0.24, FX.gold)
          fx.glint(nx + fxDir * 0.45, 0.7, nz + fzDir * 0.45, big ? 0.36 : 0.32)
        }
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) {
          alive[i] = 0
          free.release(i)
          continue
        }
        const n = hashQuery(nx, nz, 1.4, QUERY)
        const base = i * 4
        for (let k = 0; k < n; k++) {
          const slot = QUERY[k] ?? -1
          if (slot < 0 || !horde.alive[slot]) continue
          const dx = (horde.x[slot] ?? 0) - nx
          const dz = (horde.z[slot] ?? 0) - nz
          const hitR = TUNING.spear.hit
          if (dx * dx + dz * dz > hitR * hitR) continue
          if (hits[base] === slot || hits[base + 1] === slot || hits[base + 2] === slot || hits[base + 3] === slot) continue
          if (hits[base] === -1) hits[base] = slot
          else if (hits[base + 1] === -1) hits[base + 1] = slot
          else if (hits[base + 2] === -1) hits[base + 2] = slot
          else hits[base + 3] = slot
          const hit = horde.damage(slot, dmg[i] ?? 0, 'weapon', might)
          if (hit === 0) continue
          const hx = horde.x[slot] ?? nx
          const hz = horde.z[slot] ?? nz
          spear.onImpact?.(hx, hz, ctx.isLit(hx, hz))
          fx.hit(hx, hz, ctx.isLit(hx, hz))
          if (hit === 2) horde.slay(slot, ctx)
          pierce[i] = (pierce[i] ?? 1) - 1
          // A locked Newel shot keeps flying until it reaches the statue.
          // Pierce still spends on the crowd, but the crowd cannot delete it first.
          if ((pierce[i] ?? 0) <= 0 && (!horde.bossLock || bossed[i])) {
            alive[i] = 0
            life[i] = 0
            free.release(i)
            break
          }
        }
        if (alive[i] && horde.bossHit?.(nx, nz, TUNING.spear.hit, dmg[i] ?? 0, 'weapon', might, serial[i] ?? 0)) {
          bossed[i] = 1
          spear.onImpact?.(nx, nz, true)
          fx.hit(nx, nz, true)
          pierce[i] = (pierce[i] ?? 1) - 1
          // One connection per throw. A second spear in the fan must not
          // re-open the stamp and strike again every frame.
          if (horde.bossLock || (pierce[i] ?? 0) <= 0) {
            alive[i] = 0
            life[i] = 0
            free.release(i)
          }
        }
      }
    },
    sync() {
      let n = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const big = spear.rank >= 5
        // Local +Z is the tip. yawFromDirection points local −Z along velocity, so add half a turn.
        writeInstance(mesh, n, x[i] ?? 0, 0.55, z[i] ?? 0, yawFromDirection(vx[i] ?? 0, vz[i] ?? 1) + Math.PI, big ? 1.7 : 1.45)
        n++
      }
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    },
  }
  return spear

  function arm(ang: number, level: number, haste: number, cap: number) {
    const stats = spearStats(Math.max(1, level))
    const spread = (TUNING.spear.fanDeg * Math.PI) / 180
    const hasteMul = Math.max(0.2, 1 - TUNING.passive.haste * haste)
    wind = { ang, damage: stats.damage, pierce: stats.pierce, count: stats.count, spread, cap }
    windAge = 0
    spear.rank = Math.max(1, level)
    spear.cooldown = stats.cooldown * hasteMul
    spear.onWindup?.()
  }
}
