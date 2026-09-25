import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { COLOR } from '../../data/palette'
import { TUNING } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { makeCrowd, writeInstance } from '../../render/instancing'
import { yawFromDirection } from '../../core/math'
import { hashQuery } from '../spatialHash'
import { resolveCircle } from '../collision'
import type { Horde, HordeCtx } from '../enemies/horde'

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
  used: () => number
  onFire: (() => void) | null
}

export function createSunspear(): Sunspear {
  const mesh = makeCrowd(
    new BoxGeometry(0.12, 0.12, 1.05),
    new MeshBasicMaterial({ color: COLOR.goldHot, toneMapped: false }),
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
  const free = new FreeList(MAX)

  function launch(px: number, pz: number, ang: number, damage: number, pierceLeft: number, cap: number) {
    if (free.used >= cap) return
    const i = free.acquire()
    if (i < 0) return
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    x[i] = px + c * 0.7
    z[i] = pz + s * 0.7
    vx[i] = c * TUNING.spear.speed
    vz[i] = s * TUNING.spear.speed
    life[i] = TUNING.spear.life
    pierce[i] = pierceLeft
    dmg[i] = damage
    alive[i] = 1
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
    onFire: null,
    clear() {
      alive.fill(0)
      life.fill(0)
      free.reset()
      spear.cooldown = 0.35
    },
    update(dt, px, pz, horde, level, haste, might, cap, ctx) {
      spear.cooldown -= dt
      if (level > 0 && spear.cooldown <= 0) {
        const target = horde.nearest(px, pz, TUNING.spear.range)
        if (target >= 0) {
          const stats = spearStats(level)
          const ang = Math.atan2((horde.z[target] ?? 0) - pz, (horde.x[target] ?? 0) - px)
          const spread = (TUNING.spear.fanDeg * Math.PI) / 180
          const hasteMul = Math.max(0.2, 1 - TUNING.passive.haste * haste)
          spear.cooldown = stats.cooldown * hasteMul
          if (stats.count === 1) launch(px, pz, ang, stats.damage, stats.pierce, cap)
          else {
            launch(px, pz, ang - spread, stats.damage, stats.pierce, cap)
            launch(px, pz, ang + spread, stats.damage, stats.pierce, cap)
          }
          spear.onFire?.()
        }
      }
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const nx = (x[i] ?? 0) + (vx[i] ?? 0) * dt
        const nz = (z[i] ?? 0) + (vz[i] ?? 0) * dt
        const slid = resolveCircle(nx, nz, TUNING.spear.radius)
        if (slid.x !== nx || slid.z !== nz) {
          alive[i] = 0
          life[i] = 0
          free.release(i)
          continue
        }
        x[i] = nx
        z[i] = nz
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
          if (hit === 2) horde.slay(slot, ctx)
          pierce[i] = (pierce[i] ?? 1) - 1
          if ((pierce[i] ?? 0) <= 0) {
            alive[i] = 0
            life[i] = 0
            free.release(i)
            break
          }
        }
      }
    },
    sync() {
      let n = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        writeInstance(mesh, n, x[i] ?? 0, 0.7, z[i] ?? 0, yawFromDirection(vx[i] ?? 0, vz[i] ?? 1), 1)
        n++
      }
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    },
  }
  return spear
}
