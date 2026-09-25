import { TUNING } from '../data/tuning'

export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const half = TUNING.arena.size / 2
const thick = TUNING.arena.wallThick
const outer = half + thick
const at = TUNING.arena.pillarAt
const pr = TUNING.arena.pillarR

export const WALLS: readonly AABB[] = [
  { minX: -outer, maxX: -half, minZ: -outer, maxZ: outer },
  { minX: half, maxX: outer, minZ: -outer, maxZ: outer },
  { minX: -half, maxX: half, minZ: -outer, maxZ: -half },
  { minX: -half, maxX: half, minZ: half, maxZ: outer },
]

export const PILLARS: readonly { x: number; z: number; r: number }[] = [
  { x: -at, z: -at, r: pr },
  { x: -at, z: at, r: pr },
  { x: at, z: -at, r: pr },
  { x: at, z: at, r: pr },
]

const resolved = { x: 0, z: 0 }

export function resolveCircle(x: number, z: number, radius: number): { x: number; z: number } {
  let cx = x
  let cz = z
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < WALLS.length; i++) {
      const b = WALLS[i]
      if (!b) continue
      const minX = b.minX - radius
      const maxX = b.maxX + radius
      const minZ = b.minZ - radius
      const maxZ = b.maxZ + radius
      if (cx <= minX || cx >= maxX || cz <= minZ || cz >= maxZ) continue
      const penL = cx - minX
      const penR = maxX - cx
      const penB = cz - minZ
      const penT = maxZ - cz
      const minPen = Math.min(penL, penR, penB, penT)
      if (minPen === penL) cx = minX
      else if (minPen === penR) cx = maxX
      else if (minPen === penB) cz = minZ
      else cz = maxZ
    }
    for (let i = 0; i < PILLARS.length; i++) {
      const p = PILLARS[i]
      if (!p) continue
      const dx = cx - p.x
      const dz = cz - p.z
      const min = radius + p.r
      const d2 = dx * dx + dz * dz
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2) || 0.0001
      const push = (min - d) / d
      cx += dx * push
      cz += dz * push
    }
  }
  resolved.x = cx
  resolved.z = cz
  return resolved
}

export function insideArena(x: number, z: number, radius: number): boolean {
  const limit = half - radius - 0.3
  if (Math.abs(x) > limit || Math.abs(z) > limit) return false
  for (let i = 0; i < PILLARS.length; i++) {
    const p = PILLARS[i]
    if (!p) continue
    const dx = x - p.x
    const dz = z - p.z
    const min = radius + p.r + 0.35
    if (dx * dx + dz * dz < min * min) return false
  }
  return true
}
