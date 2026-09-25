import { InstancedMesh, MeshBasicMaterial, RingGeometry } from 'three'
import { COLOR } from '../../data/palette'
import { TUNING } from '../../data/tuning'
import { makeCrowd, writeFlat } from '../../render/instancing'
import { hashQuery } from '../spatialHash'
import type { Horde, HordeCtx } from '../enemies/horde'

const QUERY = new Int16Array(48)

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
  update: (dt: number, px: number, pz: number, horde: Horde, level: number, might: number, time: number, ctx: HordeCtx) => void
  sync: (px: number, pz: number, level: number) => void
  clear: () => void
}

export function createHalo(): Halo {
  const geo = new RingGeometry(TUNING.halo.discR * 0.62, TUNING.halo.discR, 18)
  geo.rotateX(-Math.PI / 2)
  const mesh = makeCrowd(geo, new MeshBasicMaterial({ color: COLOR.gold }), TUNING.halo.maxDiscs)
  const stamps = new Float32Array(TUNING.hordeCap * TUNING.halo.maxDiscs)
  const halo: Halo = {
    mesh,
    angle: 0,
    stamps,
    clear() {
      halo.angle = 0
      stamps.fill(0)
    },
    update(dt, px, pz, horde, level, might, time, ctx) {
      const stats = haloStats(level)
      if (!stats) return
      halo.angle += dt * ((Math.PI * 2) / TUNING.halo.period)
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
          if (hit === 2) horde.slay(slot, ctx)
        }
      }
    },
    sync(px, pz, level) {
      const stats = haloStats(level)
      if (!stats) {
        mesh.count = 0
        mesh.visible = false
        return
      }
      for (let d = 0; d < stats.count; d++) {
        const a = halo.angle + (d * Math.PI * 2) / stats.count
        writeFlat(mesh, d, px + Math.cos(a) * stats.orbit, pz + Math.sin(a) * stats.orbit, 0, 1, 1)
      }
      mesh.count = stats.count
      mesh.visible = true
      mesh.instanceMatrix.needsUpdate = true
    },
  }
  return halo
}
