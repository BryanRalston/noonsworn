import { CylinderGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { TUNING } from '../../data/tuning'
import { makeCrowd } from '../../render/instancing'
import { hashQuery } from '../spatialHash'
import type { Horde, HordeCtx } from '../enemies/horde'
import { type WeaponFx } from './fx'

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
  update: (dt: number, px: number, pz: number, horde: Horde, level: number, might: number, time: number, ctx: HordeCtx) => void
  sync: (px: number, pz: number, level: number) => void
  clear: () => void
  onImpact: ((x: number, z: number, lit: boolean) => void) | null
}

export function createHalo(fx: WeaponFx): Halo {
  const geo = new CylinderGeometry(TUNING.halo.discR, TUNING.halo.discR, 0.07, 6)
  geo.rotateX(0)
  const mesh = makeCrowd(geo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), TUNING.halo.maxDiscs)
  const stamps = new Float32Array(TUNING.hordeCap * TUNING.halo.maxDiscs)
  let rayAt = -1
  let arcAt = 0
  const halo: Halo = {
    mesh,
    angle: 0,
    stamps,
    pulses: 0,
    onImpact: null,
    clear() {
      halo.angle = 0
      halo.pulses = 0
      rayAt = -1
      stamps.fill(0)
    },
    update(dt, px, pz, horde, level, might, time, ctx) {
      const stats = haloStats(level)
      if (!stats) return
      halo.angle += dt * ((Math.PI * 2) / TUNING.halo.period)
      const big = level >= 5
      const blades = big ? 6 : 3
      const arc = time - arcAt > 0.12
      if (arc) arcAt = time
      for (let d = 0; d < blades; d++) {
        const a = halo.angle + (d * Math.PI * 2) / blades
        const hx = px + Math.cos(a) * stats.orbit
        const hz = pz + Math.sin(a) * stats.orbit
        fx.blade(d, hx, hz, TUNING.camera.yaw, big)
      }
      if (big && time - rayAt > 0.36) {
        rayAt = time
        halo.pulses++
        for (let r = 0; r < 10; r++) {
          const ray = (r / 10) * Math.PI * 2
          const ox = Math.cos(ray)
          const oz = Math.sin(ray)
          fx.ray(px + ox * (stats.orbit + 0.4), 1.15, pz + oz * (stats.orbit + 0.4), TUNING.camera.yaw, 1.2, 0.12, 0.4)
        }
      } else if (!big && time - rayAt > 1) {
        rayAt = time
        halo.pulses++
      }
      const n = hashQuery(px, pz, stats.orbit + 1.2, QUERY)
      for (let d = 0; d < stats.count; d++) {
        const a = halo.angle + (d * Math.PI * 2) / stats.count
        const dx = Math.cos(a) * stats.orbit
        const dz = Math.sin(a) * stats.orbit
        const sx = px + dx
        const sz = pz + dz
        for (let k = 0; k < n; k++) {
          const slot = QUERY[k] ?? -1
          if (slot < 0 || !horde.alive[slot]) continue
          const ex = (horde.x[slot] ?? 0) - sx
          const ez = (horde.z[slot] ?? 0) - sz
          const reach = TUNING.halo.discR + TUNING.halo.reachPad
          if (ex * ex + ez * ez > reach * reach) continue
          const stampAt = slot * TUNING.halo.maxDiscs + d
          if (time - (stamps[stampAt] ?? 0) < TUNING.halo.hitEvery) continue
          stamps[stampAt] = time
          const hit = horde.damage(slot, stats.damage, 'weapon', might)
          if (hit === 0) continue
          const hx = horde.x[slot] ?? sx
          const hz = horde.z[slot] ?? sz
          const lit = ctx.isLit(hx, hz)
          halo.onImpact?.(hx, hz, lit)
          fx.hit(hx, hz, lit)
          if (hit === 2) horde.slay(slot, ctx)
        }
        if ((bossStamp[d] ?? 0) > time) bossStamp[d] = 0
        const gate = !horde.bossLock || time - (bossStamp[d] ?? 0) >= TUNING.halo.hitEvery
        if (gate) {
          const landed = horde.bossHit?.(sx, sz, TUNING.halo.discR + TUNING.halo.reachPad, stats.damage, 'weapon', might, 10 + d)
          if (landed && horde.bossLock) bossStamp[d] = time
        }
      }
    },
    sync() {
      mesh.count = 0
      mesh.visible = false
    },
  }
  return halo
}
