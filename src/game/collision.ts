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

const HOME: Pillar[] = PILLARS.map((p) => ({ x: p.x, z: p.z, r: p.r, wing: -1 }))

/** Planter beds. Empty on Sundial Court, so every early-out below stays the sanctum path. */
export const BEDS: AABB[] = []
const strips: number[] = []
let stripHalf = 0

const resolved = { x: 0, z: 0 }
const focusOut = { x: 0, z: 0 }
const boxOut = { x: 0, z: 0 }
const pillOut = { x: 0, z: 0 }
const keptOut = { x: 0, z: 0 }

/** True when a segment's z span overlaps a planter row. Sundial has no beds. */
export function bedRowsBetween(z0: number, z1: number): boolean {
  if (BEDS.length === 0) return false
  const lo = z0 < z1 ? z0 : z1
  const hi = z0 < z1 ? z1 : z0
  return (lo <= -7.5 && hi >= -8.5) || (lo <= 8.5 && hi >= 7.5)
}

/** Planter walls sit on z = ±8. A step cannot cross this pad, so a circle outside it never touches a bed. */
function clearOfBeds(z: number, radius: number): boolean {
  const pad = 0.5 + radius + 0.45
  return Math.abs(z - 8) >= pad && Math.abs(z + 8) >= pad
}

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

export function resetHomePillars() {
  PILLARS.length = 4
  for (let i = 0; i < HOME.length; i++) {
    const h = HOME[i]
    const p = PILLARS[i]
    if (!h) continue
    if (p) {
      p.x = h.x
      p.z = h.z
      p.r = h.r
      p.wing = -1
    } else PILLARS[i] = { x: h.x, z: h.z, r: h.r, wing: -1 }
  }
}

export function setBeds(list: readonly AABB[]) {
  BEDS.length = 0
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    if (s) BEDS.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ })
  }
}

/** Open walks. Only the inset of a walk stays clear; the corners keep a clearance radius. */
export function setOpenStrips(at: readonly number[], half: number) {
  strips.length = 0
  for (let i = 0; i < at.length; i++) {
    const v = at[i]
    if (v !== undefined) strips.push(v)
  }
  stripHalf = half
}

function hitBeds(x: number, z: number, radius: number): boolean {
  for (let i = 0; i < BEDS.length; i++) {
    const b = BEDS[i]
    if (!b) continue
    if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) return true
  }
  return false
}

/** Body clearance so a flow center stays outside a hound's radius of the planter. */
const FLOW_CLEAR = 0.6
const bedSteer = { x: 0, z: 0 }

/** The open walk, inset so the corners beside a bed are not treated as corridor. */
function deepGap(x: number): boolean {
  const inset = stripHalf - 1.05
  if (inset <= 0.2) return false
  for (let i = 0; i < strips.length; i++) {
    if (Math.abs(x - (strips[i] ?? 0)) <= inset) return true
  }
  return false
}

/** Flow cells within FLOW_CLEAR of a planter are blocked. Gap centers stay open. */
function cellTouchesBed(x: number, z: number): boolean {
  if (deepGap(x)) return hitBeds(x, z, 0.05)
  return hitBeds(x, z, FLOW_CLEAR)
}

/**
 * Planter contact steer. Drops the component aimed into the bed. A steer that already
 * leaves the face is kept. A steer aimed through the bed slides toward the nearest open
 * walk. Returns null on Sundial (no beds) and when the circle is clear of every bed.
 * The returned object is shared; copy x/z before the next call.
 */
export function steerBeds(
  x: number,
  z: number,
  radius: number,
  sx: number,
  sz: number,
  tx: number,
  tz: number,
): { x: number; z: number } | null {
  if (BEDS.length === 0) return null
  const az = Math.abs(z)
  // Beds sit on z = ±8. Outside this band the circle cannot touch one.
  if (az < 6.35 || az > 9.65) return null
  const band = 0.55
  let best = band
  let nx = 0
  let nz = 0
  let found = false
  for (let i = 0; i < BEDS.length; i++) {
    const b = BEDS[i]
    if (!b) continue
    const minX = b.minX - radius
    const maxX = b.maxX + radius
    const minZ = b.minZ - radius
    const maxZ = b.maxZ + radius
    const inside = x > minX && x < maxX && z > minZ && z < maxZ
    if (inside) {
      const penL = x - minX
      const penR = maxX - x
      const penB = z - minZ
      const penT = maxZ - z
      const minPen = Math.min(penL, penR, penB, penT)
      const score = -minPen
      if (score < best) {
        best = score
        found = true
        if (minPen === penL) {
          nx = -1
          nz = 0
        } else if (minPen === penR) {
          nx = 1
          nz = 0
        } else if (minPen === penB) {
          nx = 0
          nz = -1
        } else {
          nx = 0
          nz = 1
        }
      }
      continue
    }
    const cx = x < minX ? minX : x > maxX ? maxX : x
    const cz = z < minZ ? minZ : z > maxZ ? maxZ : z
    const dx = x - cx
    const dz = z - cz
    const d = Math.hypot(dx, dz)
    if (d < best && d > 1e-6) {
      best = d
      found = true
      nx = dx / d
      nz = dz / d
    }
  }
  if (!found) return null
  let ox = sx
  let oz = sz
  const into = ox * nx + oz * nz
  if (into < 0) {
    ox -= nx * into
    oz -= nz * into
  }
  // A steer that already leaves the bed is kept, so a player on the same side is reachable.
  // A steer aimed through the planter slides to the nearest open walk instead of the player's X,
  // which sits on the bed and only makes the circle oscillate.
  const away = ox * nx + oz * nz
  if (!(away > 0.2 && Math.hypot(ox, oz) > 0.15)) {
    if (Math.abs(nz) >= Math.abs(nx)) {
      let best = tx
      let bestD = 1e9
      if (strips.length === 0) bestD = Math.abs(tx - x)
      for (let s = 0; s < strips.length; s++) {
        const at = strips[s] ?? 0
        const d = Math.abs(at - x)
        if (d < bestD) {
          bestD = d
          best = at
        }
      }
      let dir = Math.sign(best - x)
      if (dir === 0) dir = tx >= x ? 1 : -1
      const withTravel = ox * dir > 0 ? ox * dir : 0
      ox = dir * (1.25 + withTravel)
      oz = 0
    } else {
      const dir = tz === z ? 1 : Math.sign(tz - z)
      const withTravel = oz * dir > 0 ? oz * dir : 0
      oz = dir * (1.25 + withTravel)
      ox = 0
    }
  }
  bedSteer.x = ox
  bedSteer.z = oz
  return bedSteer
}

function containCourt(x: number, z: number, radius: number): { x: number; z: number } {
  const limit = HALF - radius - 0.05
  if (Math.abs(x) <= limit && Math.abs(z) <= limit) {
    keptOut.x = x
    keptOut.z = z
    return keptOut
  }
  if ((gateOpen[0] && x > HALF) || (gateOpen[2] && x < -HALF) || (gateOpen[1] && z > HALF) || (gateOpen[3] && z < -HALF)) {
    keptOut.x = x
    keptOut.z = z
    return keptOut
  }
  keptOut.x = Math.max(-limit, Math.min(limit, x))
  keptOut.z = Math.max(-limit, Math.min(limit, z))
  return keptOut
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
  pillOut.x = x
  pillOut.z = z
  return pillOut
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
  boxOut.x = x
  boxOut.z = z
  return boxOut
}

export function resolveCircle(x0: number, z0: number, radius: number): { x: number; z: number } {
  if (stairOn && stairBody) return stairBody.resolve(x0, z0, radius)
  if (cloisterOn) return resolveCloister(x0, z0, radius)
  let cx = x0
  let cz = z0
  if (Math.abs(cx) < DEEP && Math.abs(cz) < DEEP) {
    if (BEDS.length === 0) {
      const p = pushPillars(cx, cz, radius, 4)
      resolved.x = p.x
      resolved.z = p.z
      return resolved
    }
    if (clearOfBeds(cz, radius)) {
      if (Math.abs(cz) < 14) {
        const kept = containCourt(cx, cz, radius)
        resolved.x = kept.x
        resolved.z = kept.z
        return resolved
      }
      const p = pushPillars(cx, cz, radius, PILLARS.length)
      const kept = containCourt(p.x, p.z, radius)
      resolved.x = kept.x
      resolved.z = kept.z
      return resolved
    }
    for (let pass = 0; pass < 2; pass++) {
      const b = pushBoxes(cx, cz, radius, BEDS)
      cx = b.x
      cz = b.z
      const p = pushPillars(cx, cz, radius, PILLARS.length)
      cx = p.x
      cz = p.z
    }
    const kept = containCourt(cx, cz, radius)
    resolved.x = kept.x
    resolved.z = kept.z
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
  const kept = BEDS.length > 0 ? containCourt(cx, cz, radius) : { x: cx, z: cz }
  resolved.x = kept.x
  resolved.z = kept.z
  return resolved
}

/** Keeps a move that a planter would cancel by sliding along the wall toward a stair. Sundial has no beds, so it only resolves the destination. */
export function slideCircle(x0: number, z0: number, x1: number, z1: number, radius: number): { x: number; z: number } {
  if (stairOn && stairBody) return stairBody.slide(x0, z0, x1, z1, radius)
  if (cloisterOn) return slideCloister(x0, z0, x1, z1, radius)
  if (BEDS.length === 0) return resolveCircle(x1, z1, radius)
  // Open middle of the terraces has no posts and no beds, so the move is already free.
  if (Math.abs(x1) < 22 && Math.abs(z1) < 13 && clearOfBeds(z1, radius)) {
    resolved.x = x1
    resolved.z = z1
    return resolved
  }
  const full = resolveCircle(x1, z1, radius)
  const fx = full.x
  const fz = full.z
  const moved = Math.hypot(fx - x0, fz - z0)
  const want = Math.hypot(x1 - x0, z1 - z0)
  if (want < 1e-5 || moved > want * 0.45) {
    resolved.x = fx
    resolved.z = fz
    return resolved
  }
  const alongX = resolveCircle(x1, z0, radius)
  const xx = alongX.x
  const xz = alongX.z
  const alongZ = resolveCircle(x0, z1, radius)
  const zx = alongZ.x
  const zz = alongZ.z
  const mx = Math.hypot(xx - x0, xz - z0)
  const mz = Math.hypot(zx - x0, zz - z0)
  let bx = fx
  let bz = fz
  let best = moved
  if (mx > best) {
    best = mx
    bx = xx
    bz = xz
  }
  if (mz > best) {
    best = mz
    bx = zx
    bz = zz
  }
  if (best <= want * 0.45 && strips.length > 0) {
    let gap = strips[0] ?? x0
    let gapD = Math.abs(gap - x0)
    for (let i = 1; i < strips.length; i++) {
      const g = strips[i] ?? gap
      const d = Math.abs(g - x0)
      if (d < gapD) {
        gapD = d
        gap = g
      }
    }
    const dir = gap === x0 ? 1 : Math.sign(gap - x0)
    const step = Math.max(want, 0.05)
    const nudged = resolveCircle(x0 + dir * step, z0, radius)
    const nx = nudged.x
    const nz = nudged.z
    if (Math.hypot(nx - x0, nz - z0) > best) {
      bx = nx
      bz = nz
    }
  }
  resolved.x = bx
  resolved.z = bz
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
  if (stairOn && stairBody) return stairBody.inside(x, z, radius)
  if (cloisterOn) return cloisterWalk(x, z, radius)
  const limit = HALF - radius - 0.3
  if (Math.abs(x) <= limit && Math.abs(z) <= limit) {
    if (BEDS.length > 0 && hitBeds(x, z, radius)) return false
    return clearPillars(x, z, radius)
  }
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
  if (stairOn && stairBody) return stairBody.blocked(x0, z0, x1, z1)
  if (cloisterOn) return cloisterSegment(x0, z0, x1, z1)
  if (BEDS.length > 0) {
    for (let i = 0; i < BEDS.length; i++) {
      const b = BEDS[i]
      if (b && segHitsBox(x0, z0, x1, z1, b)) return true
    }
  }
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
  const n = sanctum && BEDS.length === 0 ? Math.min(4, PILLARS.length) : PILLARS.length
  for (let i = 0; i < n; i++) {
    const p = PILLARS[i]
    if (p && segmentHitsCircle(x0, z0, x1, z1, p.x, p.z, p.r)) return true
  }
  return false
}

export function cellBlocked(x: number, z: number): boolean {
  if (cloisterOn) return !cloisterWalk(x, z, 0.45)
  if (!insideArena(x, z, 0.2)) return true
  if (BEDS.length > 0 && cellTouchesBed(x, z)) return true
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

/** Cloister court. Empty until that map applies, so every path above stays the sanctum. */
let cloisterOn = false
let crest = false
let bound = 10
const COL_CAP = 32
const colX = new Float32Array(COL_CAP)
const colZ = new Float32Array(COL_CAP)
const colR = new Float32Array(COL_CAP)
let colN = 0
const COS45 = 0.7071067811865476

export function octDist(x: number, z: number): number {
  const ax = Math.abs(x)
  const az = Math.abs(z)
  const diag = (ax + az) * COS45
  return ax > az ? (ax > diag ? ax : diag) : az > diag ? az : diag
}

export function setCloisterCourt(on: boolean, circles: readonly { x: number; z: number; r: number }[]) {
  cloisterOn = on
  colN = 0
  for (let i = 0; i < circles.length && colN < COL_CAP; i++) {
    const c = circles[i]
    if (!c) continue
    colX[colN] = c.x
    colZ[colN] = c.z
    colR[colN] = c.r
    colN++
  }
  if (!on) {
    crest = false
    bound = 10
  }
}

/** Water boundary. During the surge the crest is the line bodies stand on; afterwards the rim is a wall. */
export function setCloisterBound(minOct: number, onCrest: boolean) {
  bound = minOct
  crest = onCrest
}

export function cloisterCourt(): boolean {
  return cloisterOn
}

/** Stair court. Off until that map applies, so every path above stays the sanctum or the cloister. */
export interface StairBody {
  resolve: (x: number, z: number, radius: number) => { x: number; z: number }
  slide: (x0: number, z0: number, x1: number, z1: number, radius: number) => { x: number; z: number }
  inside: (x: number, z: number, radius: number) => boolean
  blocked: (x0: number, z0: number, x1: number, z1: number) => boolean
}

let stairOn = false
let stairBody: StairBody | null = null

export function setStairCourt(on: boolean, body: StairBody | null) {
  stairOn = on
  stairBody = on ? body : null
}

export function stairCourt(): boolean {
  return stairOn
}

function cloisterLimit(radius: number): number {
  return crest ? bound : bound + radius
}

export function cloisterWalk(x: number, z: number, radius: number): boolean {
  const edge = 24 - radius - 0.05
  if (Math.abs(x) > edge || Math.abs(z) > edge) return false
  if (octDist(x, z) < cloisterLimit(radius) - 1e-3) return false
  for (let i = 0; i < colN; i++) {
    const dx = x - (colX[i] ?? 0)
    const dz = z - (colZ[i] ?? 0)
    const min = radius + (colR[i] ?? 0)
    if (dx * dx + dz * dz < min * min) return false
  }
  return true
}

function pushCloister(x: number, z: number, radius: number): { x: number; z: number } {
  let cx = x
  let cz = z
  const edge = 24 - radius - 0.05
  if (cx > edge) cx = edge
  if (cx < -edge) cx = -edge
  if (cz > edge) cz = edge
  if (cz < -edge) cz = -edge
  for (let i = 0; i < colN; i++) {
    const px = colX[i] ?? 0
    const pz = colZ[i] ?? 0
    const min = radius + (colR[i] ?? 0)
    const dx = cx - px
    const dz = cz - pz
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min || d2 < 1e-8) continue
    const d = Math.sqrt(d2)
    const push = (min - d) / d
    cx += dx * push
    cz += dz * push
  }
  const limit = cloisterLimit(radius)
  const o = octDist(cx, cz)
  if (o < limit && o > 1e-4) {
    const s = limit / o
    cx *= s
    cz *= s
  }
  resolved.x = cx
  resolved.z = cz
  return resolved
}

function resolveCloister(x0: number, z0: number, radius: number): { x: number; z: number } {
  const once = pushCloister(x0, z0, radius)
  const twice = pushCloister(once.x, once.z, radius)
  resolved.x = twice.x
  resolved.z = twice.z
  return resolved
}

function slideCloister(x0: number, z0: number, x1: number, z1: number, radius: number): { x: number; z: number } {
  const full = resolveCloister(x1, z1, radius)
  const fx = full.x
  const fz = full.z
  const moved = Math.hypot(fx - x0, fz - z0)
  const want = Math.hypot(x1 - x0, z1 - z0)
  if (want < 1e-5 || moved > want * 0.45) {
    resolved.x = fx
    resolved.z = fz
    return resolved
  }
  const alongX = resolveCloister(x1, z0, radius)
  const xx = alongX.x
  const xz = alongX.z
  const alongZ = resolveCloister(x0, z1, radius)
  const zx = alongZ.x
  const zz = alongZ.z
  const mx = Math.hypot(xx - x0, xz - z0)
  const mz = Math.hypot(zx - x0, zz - z0)
  if (mx >= mz && mx > moved) {
    resolved.x = xx
    resolved.z = xz
  } else if (mz > moved) {
    resolved.x = zx
    resolved.z = zz
  } else {
    resolved.x = fx
    resolved.z = fz
  }
  return resolved
}

function cloisterSegment(x0: number, z0: number, x1: number, z1: number): boolean {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    if (!cloisterWalk(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.35)) return true
  }
  return false
}
