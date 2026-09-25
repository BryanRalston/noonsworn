import { TUNING } from '../data/tuning'
import type { Rng } from '../core/rng'
import { insideArena } from './collision'
import type { Horde } from './enemies/horde'

const face = { x: 0, z: 0 }

export interface Director {
  acc: number
  hour: number
  reset: () => void
  update: (
    dt: number,
    time: number,
    horde: Horde,
    px: number,
    pz: number,
    cap: number,
    rng: Rng,
    camX: number,
    camZ: number,
  ) => void
}

export function createDirector(): Director {
  const director: Director = {
    acc: 0,
    hour: 0,
    reset() {
      director.acc = 0
      director.hour = 0
    },
    update(dt, time, horde, px, pz, cap, rng, camX, camZ) {
      if (time >= TUNING.runLength) return
      const u = Math.min(1, time / TUNING.runLength)
      const rate = TUNING.rateStart + (TUNING.rateEnd - TUNING.rateStart) * u
      const minCount = TUNING.minCountStart + (cap - TUNING.minCountStart) * u
      director.acc += rate * dt
      const hour = Math.floor(time / TUNING.packEvery)
      if (hour > director.hour && time < TUNING.runLength) {
        director.hour = hour
        const base = rng() * Math.PI * 2
        for (let i = 0; i < TUNING.packSize; i++) {
          const a = base + (i / TUNING.packSize - 0.5) * TUNING.packArc
          horde.spawn(0, px + Math.cos(a) * TUNING.packRadius, pz + Math.sin(a) * TUNING.packRadius, false, cap, px, pz)
        }
      }
      let spawned = 0
      while ((director.acc >= 1 || horde.count() < minCount) && spawned < TUNING.spawnBurst && time < TUNING.runLength) {
        if (director.acc >= 1) director.acc -= 1
        const houndChance = time >= TUNING.houndLate ? TUNING.houndChanceLate : time >= TUNING.houndAt ? TUNING.houndChance : 0
        const kind: 0 | 1 = rng() < houndChance ? 1 : 0
        const spot = pickSpawn(px, pz, kind === 0 ? TUNING.mite.radius : TUNING.hound.radius, rng, camX, camZ)
        horde.spawn(kind, spot.x, spot.z, false, cap, px, pz)
        spawned++
        if (horde.count() >= minCount && director.acc < 1) break
      }
    },
  }
  return director
}

function pickSpawn(px: number, pz: number, radius: number, rng: Rng, camX: number, camZ: number): { x: number; z: number } {
  let bestX = px
  let bestZ = pz + 20
  let best = 1e9
  const cdx = camX - px
  const cdz = camZ - pz
  const cl = Math.hypot(cdx, cdz) || 1
  face.x = cdx / cl
  face.z = cdz / cl
  for (let i = 0; i < 14; i++) {
    const ang = rng() * Math.PI * 2
    const dist = TUNING.spawnNear + rng() * (TUNING.spawnFar - TUNING.spawnNear)
    let x = px + Math.cos(ang) * dist
    let z = pz + Math.sin(ang) * dist
    const limit = TUNING.arena.size / 2 - 2
    if (x > limit) x = limit
    if (x < -limit) x = -limit
    if (z > limit) z = limit
    if (z < -limit) z = -limit
    let score = insideArena(x, z, radius) ? 0 : 30
    const dx = x - px
    const dz = z - pz
    const dl = Math.hypot(dx, dz) || 1
    const dot = (dx / dl) * face.x + (dz / dl) * face.z
    if (dot > 0.15) score += 6
    const d = Math.hypot(x - px, z - pz)
    if (d < TUNING.spawnNear) score += 4
    if (score < best) {
      best = score
      bestX = x
      bestZ = z
    }
  }
  return { x: bestX, z: bestZ }
}
