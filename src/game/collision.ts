import { TUNING } from '../data/tuning'
import { segmentHitsCircle } from '../core/math'

export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface Pillar {
  x: number
  z: number
  r: number
  wing: number
}

const HALF = TUNING.arena.size / 2
const THICK = TUNING.arena.wallThick
const GATE = TUNING.temple.gate / 2
const WING = TUNING.temple.wingW / 2
const OUTER = TUNING.temple.outer
const AT = TUNING.arena.pillarAt
const PR = TUNING.arena.pillarR
const DEEP = HALF - 2.5

export const gateOpen: boolean[] = [false, false, false, false]

export const WALLS: AABB[] = []
export const SLABS: AABB[] = []
export const PILLARS: Pillar[] = [
  { x: -AT, z: -AT, r: PR, wing: -1 },
  { x: -AT, z: AT, r: PR, wing: -1 },
  { x: AT, z: -AT, r: PR, wing: -1 },
  { x: AT, z: AT, r: PR, wing: -1 },
]

const resolved = { x: 0, z: 0 }
const focusOut = { x: 0, z: 0 }

function box(minX: number, maxX: number, minZ: number, maxZ: number) {
  WALLS.push({ minX, maxX, minZ, maxZ })
}

export function rebuildWalls() {
  WALLS.length = 0
  const o = HALF + THICK
  const plug = (side: number) => !gateOpen[side]
  box(-o, -GATE, HALF, o)
  box(GATE, o, HALF, o)
  if (plug(1)) box(-GATE, GATE, HALF, o)
  box(-o, -GATE, -o, -HALF)
  box(GATE, o, -o, -HALF)
  if (plug(3)) box(-GATE, GATE, -o, -HALF)
  box(HALF, o, -HALF, -GATE)
  box(HALF, o, GATE, HALF)
  if (plug(0)) box(HALF, o, -GATE, GATE)
  box(-o, -HALF, -HALF, -GATE)
  box(-o, -HALF, GATE, HALF)
  if (plug(2)) box(-o, -HALF, -GATE, GATE)
  const far = OUTER + THICK
  const side = WING
  const sideT = WING + THICK
  box(o, far, side, sideT)
  box(o, far, -sideT, -side)
  box(OUTER, far, -sideT, sideT)
  box(-far, -o, side, sideT)
  box(-far, -o, -sideT, -side)
  box(-far, -OUTER, -sideT, sideT)
  box(side, sideT, o, far)
  box(-sideT, -side, o, far)
  box(-sideT, sideT, OUTER, far)
  box(side, sideT, -far, -o)
  box(-sideT, -side, -far, -o)
  box(-sideT, sideT, -far, -OUTER)
}

rebuildWalls()

export function setGateOpen(side: number, open: boolean) {
  if (gateOpen[side] === open) return
  gateOpen[side] = open
  rebuildWalls()
}

export function closeGates() {
  gateOpen[0] = false
  gateOpen[1] = false
  gateOpen[2] = false
  gateOpen[3] = false
  rebuildWalls()
}

export function setSlabs(list: readonly AABB[]) {
  SLABS.length = 0
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    if (s) SLABS.push(s)
  }
}

export function trimPillars() {
  PILLARS.length = 4
}

function pushPillars(cx: number, cz: number, radius: number, limit: number): { x: number; z: number } {
  let x = cx
  let z = cz
  const n = Math.min(limit, PILLARS.length)
  for (let i = 0; i < n; i++) {
    const p = PILLARS[i]
    if (!p) continue
    const dx = x - p.x
    const dz = z - p.z
    const min = radius + p.r
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min || d2 < 1e-8) continue
    const d = Math.sqrt(d2)
    const push = (min - d) / d
    x += dx * push
    z += dz * push
  }
  return { x, z }
}

function pushBoxes(cx: number, cz: number, radius: number, list: readonly AABB[]): { x: number; z: number } {
  let x = cx
  let z = cz
  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    if (!b) continue
    const minX = b.minX - radius
    const maxX = b.maxX + radius
    const minZ = b.minZ - radius
    const maxZ = b.maxZ + radius
    if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue
    const penL = x - minX
    const penR = maxX - x
    const penB = z - minZ
    const penT = maxZ - z
    const minPen = Math.min(penL, penR, penB, penT)
    if (minPen === penL) x = minX
    else if (minPen === penR) x = maxX
    else if (minPen === penB) z = minZ
    else z = maxZ
  }
  return { x, z }
}

export function resolveCircle(x0: number, z0: number, radius: number): { x: number; z: number } {
  let cx = x0
  let cz = z0
  if (Math.abs(cx) < DEEP && Math.abs(cz) < DEEP) {
    const p = pushPillars(cx, cz, radius, 4)
    resolved.x = p.x
    resolved.z = p.z
    return resolved
  }
  for (let pass = 0; pass < 2; pass++) {
    const w = pushBoxes(cx, cz, radius, WALLS)
    cx = w.x
    cz = w.z
    if (SLABS.length) {
      const s = pushBoxes(cx, cz, radius, SLABS)
      cx = s.x
      cz = s.z
    }
    const p = pushPillars(cx, cz, radius, PILLARS.length)
    cx = p.x
    cz = p.z
  }
  resolved.x = cx
  resolved.z = cz
  return resolved
}

function clearPillars(x: number, z: number, radius: number): boolean {
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

function inWing(side: number, x: number, z: number, radius: number): boolean {
  if (!gateOpen[side]) return false
  const span = WING - radius
  const far = OUTER - radius
  const near = HALF - THICK
  if (side === 0) return x >= near && x <= far && Math.abs(z) <= span
  if (side === 2) return x <= -near && x >= -far && Math.abs(z) <= span
  if (side === 1) return z >= near && z <= far && Math.abs(x) <= span
  return z <= -near && z >= -far && Math.abs(x) <= span
}

export function insideArena(x: number, z: number, radius: number): boolean {
  const limit = HALF - radius - 0.3
  if (Math.abs(x) <= limit && Math.abs(z) <= limit) return clearPillars(x, z, radius)
  for (let side = 0; side < 4; side++) {
    if (inWing(side, x, z, radius)) return clearPillars(x, z, radius) && !inSlab(x, z, radius)
  }
  return false
}

function inSlab(x: number, z: number, radius: number): boolean {
  for (let i = 0; i < SLABS.length; i++) {
    const b = SLABS[i]
    if (!b) continue
    if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) return true
  }
  return false
}

function segHitsBox(x0: number, z0: number, x1: number, z1: number, b: AABB): boolean {
  const dx = x1 - x0
  const dz = z1 - z0
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dz, dz]
  const q = [x0 - b.minX, b.maxX - x0, z0 - b.minZ, b.maxZ - z0]
  for (let i = 0; i < 4; i++) {
    const pi = p[i] ?? 0
    const qi = q[i] ?? 0
    if (Math.abs(pi) < 1e-8) {
      if (qi < 0) return false
      continue
    }
    const t = qi / pi
    if (pi < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t0 <= t1
}

export function segmentBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
  const sanctum = Math.abs(x0) < DEEP && Math.abs(z0) < DEEP && Math.abs(x1) < DEEP && Math.abs(z1) < DEEP
  if (!sanctum) {
    for (let i = 0; i < WALLS.length; i++) {
      const b = WALLS[i]
      if (b && segHitsBox(x0, z0, x1, z1, b)) return true
    }
    for (let i = 0; i < SLABS.length; i++) {
      const b = SLABS[i]
      if (b && segHitsBox(x0, z0, x1, z1, b)) return true
    }
  }
  const n = sanctum ? Math.min(4, PILLARS.length) : PILLARS.length
  for (let i = 0; i < n; i++) {
    const p = PILLARS[i]
    if (p && segmentHitsCircle(x0, z0, x1, z1, p.x, p.z, p.r)) return true
  }
  return false
}

export function cellBlocked(x: number, z: number): boolean {
  if (!insideArena(x, z, 0.2)) return true
  return inSlab(x, z, 0.05)
}

function inCorridor(x: number, z: number): boolean {
  const g = GATE + 0.8
  const band = TUNING.camera.slideBand
  if (gateOpen[0] && Math.abs(z) < g && Math.abs(x - HALF) < band) return true
  if (gateOpen[2] && Math.abs(z) < g && Math.abs(x + HALF) < band) return true
  if (gateOpen[1] && Math.abs(x) < g && Math.abs(z - HALF) < band) return true
  if (gateOpen[3] && Math.abs(x) < g && Math.abs(z + HALF) < band) return true
  return false
}

function shift(v: number, min: number, max: number): number {
  const band = TUNING.camera.slideBand
  const amount = TUNING.camera.slide
  const overMax = v - (max - band)
  if (overMax > 0) v -= Math.min(1, overMax / band) * amount
  const overMin = min + band - v
  if (overMin > 0) v += Math.min(1, overMin / band) * amount
  return v
}

function xLimits(x: number, z: number): { min: number; max: number } {
  let max = HALF
  let min = -HALF
  if (gateOpen[0] && Math.abs(z) <= WING && (x >= HALF - 1 || Math.abs(z) <= GATE)) max = OUTER
  if (gateOpen[2] && Math.abs(z) <= WING && (x <= -(HALF - 1) || Math.abs(z) <= GATE)) min = -OUTER
  return { min, max }
}

function zLimits(x: number, z: number): { min: number; max: number } {
  let max = HALF
  let min = -HALF
  if (gateOpen[1] && Math.abs(x) <= WING && (z >= HALF - 1 || Math.abs(x) <= GATE)) max = OUTER
  if (gateOpen[3] && Math.abs(x) <= WING && (z <= -(HALF - 1) || Math.abs(x) <= GATE)) min = -OUTER
  return { min, max }
}

/** Wall slide across the walkable union. Gate corridors are left alone. */
export function slideFocus(x: number, z: number): { x: number; z: number } {
  if (inCorridor(x, z)) {
    focusOut.x = x
    focusOut.z = z
    return focusOut
  }
  const xl = xLimits(x, z)
  const zl = zLimits(x, z)
  focusOut.x = shift(x, xl.min, xl.max)
  focusOut.z = shift(z, zl.min, zl.max)
  return focusOut
}
