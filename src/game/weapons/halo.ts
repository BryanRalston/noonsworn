import { CylinderGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { TUNING } from '../../data/tuning'
import { hasteMul } from '../sunClock'
import { makeCrowd } from '../../render/instancing'
import { hashQuery } from '../spatialHash'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import { probeAdd } from './probe'
import type { Horde, HordeCtx } from '../enemies/horde'
import type { WeaponFx } from './fx'

const QUERY = new Int16Array(48)
const bossStamp = new Float64Array(TUNING.halo.maxDiscs)

export interface HaloStats {
  damage: number
  count: number
  orbit: number
}

export function haloStats(level: number): HaloStats | null {
  if (level <= 0) return null
  let damage = TUNING.halo.baseDamage
  let count = TUNING.halo.baseCount
  let orbit = TUNING.halo.baseOrbit
  if (level >= 2) count += 1
  if (level >= 3) damage += TUNING.halo.levelDamage
  if (level >= 4) count += 1
  if (level >= 5) {
    damage += TUNING.halo.levelDamage
    orbit += TUNING.halo.levelOrbit
  }
  return { damage, count, orbit }
}

export function haloText(level: number): string {
  if (level <= 0) return 'Orbiting gold discs'
  if (level === 1) return 'L2: +1 disc'
  if (level === 2) return 'L3: +4 damage'
  if (level === 3) return 'L4: +1 disc'
  if (level === 4) return 'L5: +4 damage, wider orbit'
  return 'Halo is mastered'
}

export interface Halo {
  mesh: InstancedMesh
  angle: number
  stamps: Float32Array
  pulses: number
  orbit: number
  period: number
  sun: boolean
  live: number
  update: (
    dt: number,
    px: number,
    pz: number,
    horde: Horde,
    level: number,
    might: number,
    haste: number,
    time: number,
    ctx: HordeCtx,
  ) => void
  sync: (px: number, pz: number, level: number) => void
  clear: () => void
  onImpact: ((x: number, z: number, lit: boolean) => void) | null
}

export function createHalo(fx: WeaponFx, arsenal: Arsenal, mapLit: (x: number, z: number) => boolean): Halo {
  const geo = new CylinderGeometry(0.05, 0.05, 0.02, 3)
  const mesh = makeCrowd(geo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1)
  mesh.count = 0
  mesh.visible = false
  const stamps = new Float32Array(TUNING.hordeCap * TUNING.halo.maxDiscs)
  const knockAt = new Float32Array(TUNING.hordeCap)
  knockAt.fill(-10)
  let rayAt = -1
  let footSun = false
  let footHold = 0
  let footReady = false
  let easeT = 1
  let easeOrbit: number = TUNING.halo.sunOrbit
  let easePeriod: number = TUNING.halo.sunPeriod
  let targetOrbit: number = TUNING.halo.sunOrbit
  let targetPeriod: number = TUNING.halo.sunPeriod
  let discScale = 1
  const halo: Halo = {
    mesh,
    angle: 0,
    stamps,
    pulses: 0,
    orbit: TUNING.halo.sunOrbit,
    period: TUNING.halo.sunPeriod,
    sun: true,
    live: 0,
    onImpact: null,
    clear() {
      halo.angle = 0
      halo.pulses = 0
      halo.live = 0
      rayAt = -1
      footReady = false
      footHold = 0
      stamps.fill(0)
      knockAt.fill(-10)
    },
    update(dt, px, pz, horde, level, might, haste, time, ctx) {
      const stats = haloStats(level)
      if (!stats) {
        halo.live = 0
        return
      }
      const want = mapLit(px, pz)
      if (!footReady) {
        footSun = want
        footReady = true
        footHold = 0
      } else if (want !== footSun) {
        footHold += dt
        if (footHold >= TUNING.halo.footHold) {
          footSun = want
          footHold = 0
        }
      } else footHold = 0
      const big = level >= 5
      const nextOrbit = footSun ? (big ? TUNING.halo.sunOrbitL5 : TUNING.halo.sunOrbit) : big ? TUNING.halo.shadeOrbitL5 : TUNING.halo.shadeOrbit
      const nextPeriod = (footSun ? TUNING.halo.sunPeriod : TUNING.halo.shadePeriod) * hasteMul(haste)
      if (nextOrbit !== targetOrbit || nextPeriod !== targetPeriod) {
        easeOrbit = halo.orbit
        easePeriod = halo.period
        easeT = 0
        targetOrbit = nextOrbit
        targetPeriod = nextPeriod
      }
      easeT = Math.min(1, easeT + dt / TUNING.halo.ease)
      halo.orbit = easeOrbit + (targetOrbit - easeOrbit) * easeT
      halo.period = easePeriod + (targetPeriod - easePeriod) * easeT
      halo.sun = footSun
      halo.angle += dt * ((Math.PI * 2) / Math.max(0.2, halo.period))
      discScale = (big ? TUNING.halo.discL5 : TUNING.halo.disc) / 0.5
      const damage = stats.damage * (footSun ? TUNING.halo.sunDamage : 1)
      const reach = TUNING.halo.discR + TUNING.halo.reachPad
      const knock = big ? TUNING.halo.knockL5 : TUNING.halo.knock
      if (big && time - rayAt > 0.36) {
        rayAt = time
        halo.pulses++
      } else if (!big && time - rayAt > 1) {
        rayAt = time
        halo.pulses++
      }
      const n = hashQuery(px, pz, halo.orbit + reach, QUERY)
      for (let d = 0; d < stats.count; d++) {
        const a = halo.angle + (d * Math.PI * 2) / stats.count
        const sx = px + Math.cos(a) * halo.orbit
        const sz = pz + Math.sin(a) * halo.orbit
        const tangent = a + Math.PI / 2
        fx.ray(sx, 1.05, sz, tangent, 0.9, 0.22, 0.12)
        for (let k = 0; k < n; k++) {
          const slot = QUERY[k] ?? -1
          if (slot < 0 || !horde.alive[slot]) continue
          const ex = (horde.x[slot] ?? 0) - sx
          const ez = (horde.z[slot] ?? 0) - sz
          if (ex * ex + ez * ez > reach * reach) continue
          const stampAt = slot * TUNING.halo.maxDiscs + d
          if (time - (stamps[stampAt] ?? 0) < TUNING.halo.hitEvery) continue
          stamps[stampAt] = time
          const hit = horde.damage(slot, damage, 'weapon', might)
          if (hit === 0) continue
          if (!footSun && time - (knockAt[slot] ?? -10) >= TUNING.halo.hitEvery) {
            knockAt[slot] = time
            const ox = (horde.x[slot] ?? sx) - px
            const oz = (horde.z[slot] ?? sz) - pz
            const od = Math.hypot(ox, oz) || 1
            horde.nudge(slot, (ox / od) * knock, (oz / od) * knock)
          }
          const hx = horde.x[slot] ?? sx
          const hz = horde.z[slot] ?? sz
          halo.onImpact?.(hx, hz, ctx.isLit(hx, hz))
          fx.hit(hx, hz, ctx.isLit(hx, hz))
          if (hit === 2) horde.slay(slot, ctx)
        }
        if ((bossStamp[d] ?? 0) > time) bossStamp[d] = 0
        const gate = !horde.bossLock || time - (bossStamp[d] ?? 0) >= TUNING.halo.hitEvery
        if (gate) {
          const landed = horde.bossHit?.(sx, sz, reach, damage * TUNING.halo.boss, 'weapon', might, 10 + d)
          if (landed && horde.bossLock) bossStamp[d] = time
        }
      }
      halo.live = stats.count
    },
    sync(px, pz, level) {
      const stats = haloStats(level)
      mesh.count = 0
      mesh.visible = false
      if (!stats) {
        halo.live = 0
        return
      }
      for (let d = 0; d < stats.count; d++) {
        const a = halo.angle + (d * Math.PI * 2) / stats.count
        const dx = px + Math.cos(a) * halo.orbit
        const dz = pz + Math.sin(a) * halo.orbit
        arsenal.add({
          kind: ARSENAL_PART.disc,
          x: dx,
          y: 1.05,
          z: dz,
          yaw: a,
          scale: discScale,
          hot: 0,
          swing: 0,
        })
        const rim = 0.42 * discScale
        probeAdd({
          kind: 'halo',
          level,
          x: dx,
          y: 1.08,
          z: dz,
          rimX: dx + Math.cos(a) * rim,
          rimY: 1.05,
          rimZ: dz + Math.sin(a) * rim,
          floorX: dx + Math.cos(a) * (rim + 0.2),
          floorY: 0.02,
          floorZ: dz + Math.sin(a) * (rim + 0.2),
        })
      }
      halo.live = stats.count
    },
  }
  return halo
}
