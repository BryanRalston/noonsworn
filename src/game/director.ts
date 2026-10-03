import { TUNING } from '../data/tuning'
import { waveAt } from '../data/waves'
import type { Rng } from '../core/rng'
import { insideArena } from './collision'
import type { Horde } from './enemies/horde'

const face = { x: 0, z: 0 }

export interface WingPour {
  kind: 0 | 1
  x: number
  z: number
}

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
    pour?: readonly WingPour[],
    wingPick?: (px: number, pz: number, rng: Rng, camX: number, camZ: number) => { x: number; z: number } | null,
    lattice?: {
      darter: number
      boss: boolean
      rateMul?: number
      votary?: number
      onVotary?: (x: number, z: number) => void
      relocate?: (x: number, z: number, rng: Rng) => { x: number; z: number }
      houndFrom?: number
      courser?: number
      hushmaw?: number
      onShade?: (kind: 3 | 4, x: number, z: number) => boolean
    },
  ) => void
}

/** Shade Darter share of Lattice spawns. Sundial omits the lattice argument and keeps one rng draw. */
export function latticePlan(time: number, boss: boolean): { darter: number; boss: boolean } {
  let darter = 0
  if (boss) darter = 0.35
  else if (time >= 60) darter = 0.15 * Math.min(1, (time - 60) / 120)
  return { darter, boss }
}

export function createDirector(): Director {
  let forcedHound = false
  let forcedRing = false
  const director: Director = {
    acc: 0,
    hour: 0,
    reset() {
      director.acc = 0
      director.hour = 0
      forcedHound = false
      forcedRing = false
    },
    update(dt, time, horde, px, pz, cap, rng, camX, camZ, pour, wingPick, lattice) {
      const boss = lattice?.boss === true
      if (!boss && time >= TUNING.runLength) return
      if (!boss && pour) {
        for (let i = 0; i < pour.length; i++) {
          const spot = pour[i]
          if (!spot) continue
          horde.spawn(spot.kind, spot.x, spot.z, false, cap, px, pz)
        }
      }
      const wave = waveAt(time)
      const rate = wave.rate * (lattice?.rateMul ?? 1)
      const minCount = boss ? 0 : Math.min(wave.min, TUNING.designCap)
      director.acc += rate * dt
      const hour = Math.floor(time / TUNING.packEvery)
      if (!boss && hour > director.hour && time < TUNING.runLength && wave.pack > 0) {
        director.hour = hour
        const base = rng() * Math.PI * 2
        for (let i = 0; i < wave.pack; i++) {
          const a = base + (i / wave.pack - 0.5) * TUNING.packArc
          let packX = px + Math.cos(a) * TUNING.packRadius
          let packZ = pz + Math.sin(a) * TUNING.packRadius
          if (lattice?.relocate) {
            const parked = lattice.relocate(packX, packZ, rng)
            packX = parked.x
            packZ = parked.z
          }
          horde.spawn(0, packX, packZ, false, cap, px, pz)
        }
      }
      if (!boss && !forcedHound && time >= (lattice?.houndFrom ?? 18)) {
        forcedHound = true
        const spot = pickSpawn(px, pz, TUNING.hound.radius, rng, camX, camZ)
        const parked = lattice?.relocate ? lattice.relocate(spot.x, spot.z, rng) : spot
        horde.spawn(1, parked.x, parked.z, false, cap, px, pz)
      }
      if (!boss && !forcedRing && time >= 25) {
        forcedRing = true
        const base = rng() * Math.PI * 2
        for (let i = 0; i < 12; i++) {
          const a = base + (i / 12) * Math.PI * 2
          let ringX = px + Math.cos(a) * 8
          let ringZ = pz + Math.sin(a) * 8
          if (lattice?.relocate) {
            const parked = lattice.relocate(ringX, ringZ, rng)
            ringX = parked.x
            ringZ = parked.z
          }
          horde.spawn(0, ringX, ringZ, false, cap, px, pz)
        }
      }
      let spawned = 0
      while ((director.acc >= 1 || horde.count() < minCount) && spawned < TUNING.spawnBurst && (boss || time < TUNING.runLength)) {
        if (director.acc >= 1) director.acc -= 1
        const houndChance = time < (lattice?.houndFrom ?? 0) ? 0 : wave.hound
        const darterP = lattice?.darter ?? 0
        let kind: 0 | 1 | 2 = 0
        if (boss) kind = lattice?.onVotary ? 0 : rng() < darterP ? 2 : 0
        else if (darterP > 0) {
          const roll = rng()
          if (roll < darterP) kind = 2
          else kind = rng() < houndChance ? 1 : 0
        } else kind = rng() < houndChance ? 1 : 0
        let spotX = 0
        let spotZ = 0
        let fromWing = false
        if (lattice?.relocate) {
          const parked = lattice.relocate(0, 0, rng)
          spotX = parked.x
          spotZ = parked.z
          fromWing = true
        }
        if (!fromWing && wingPick && rng() < TUNING.temple.wingSpawn) {
          const wing = wingPick(px, pz, rng, camX, camZ)
          if (wing) {
            spotX = wing.x
            spotZ = wing.z
            fromWing = true
          }
        }
        if (!fromWing) {
          const spot = pickSpawn(px, pz, kind === 1 ? TUNING.hound.radius : kind === 2 ? TUNING.darter.radius : TUNING.mite.radius, rng, camX, camZ)
          spotX = spot.x
          spotZ = spot.z
        }
        if (lattice?.onVotary) {
          const share = boss ? 0.35 : (lattice.votary ?? 0)
          if (share > 0 && rng() < share) {
            lattice.onVotary(spotX, spotZ)
            spawned++
            if (horde.count() >= minCount && director.acc < 1) break
            continue
          }
        }
        const courserP = lattice?.courser ?? 0
        const hushP = lattice?.hushmaw ?? 0
        if (lattice?.onShade && courserP + hushP > 0) {
          const roll = rng()
          const shadeKind: 3 | 4 | 0 = roll < courserP ? 3 : roll < courserP + hushP ? 4 : 0
          if (shadeKind !== 0 && lattice.onShade(shadeKind, spotX, spotZ)) {
            spawned++
            if (horde.count() >= minCount && director.acc < 1) break
            continue
          }
        }
        horde.spawn(kind, spotX, spotZ, false, cap, px, pz)
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
