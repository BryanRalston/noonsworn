import {
  AnimationMixer,
  LoopOnce,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type InstancedMesh,
  type Object3D,
  type Scene,
  type SkinnedMesh,
  type WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { COLOR } from '../data/palette'
import type { Rng } from '../core/rng'
import { setStairCourt, type StairBody } from './collision'

const EDGES = [14, 4, -6, -16]
const LO = [0, 0.4, 0.8, 1.2]
const HI = [0.4, 0.8, 1.2, 1.6]
// 1.20 m leaves k2 at 76.8% (band 63–75). 1.245 m is the lowest height in
// 1.0–1.4 that lands k2 inside the band and keeps the k0–k3 strips within 0.25 m.
const OCC = 1.245
const PYLON_H = 6
const NEWEL_H = 6.1
const REACH_CAP = 48
const CAPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-20, -13, PYLON_H, 0.6],
  [-20, 11, PYLON_H, 0.6],
  [-11, -21, PYLON_H, 0.6],
  [-1, -21, PYLON_H, 0.6],
  [9, -21, PYLON_H, 0.6],
  [-1, 0, NEWEL_H, 0.9],
]
const STEPS = [
  { t0: 0, e: 38, a: 252, L: 1.28 },
  { t0: 66, e: 26, a: 256, L: 2.05 },
  { t0: 126, e: 17, a: 260, L: 3.27 },
  { t0: 186, e: 11, a: 264, L: 5.14 },
  { t0: 246, e: 6.5, a: 268, L: 8.78 },
  { t0: 276, e: 3.5, a: 270, L: 16.35 },
]
const GLIDES = [
  { t0: 60, t1: 66, from: 0, to: 1 },
  { t0: 120, t1: 126, from: 1, to: 2 },
  { t0: 180, t1: 186, from: 2, to: 3 },
  { t0: 240, t1: 246, from: 3, to: 4 },
  { t0: 270, t1: 276, from: 4, to: 5 },
]
// k0 is warm sandstone. k4 is a dusk terracotta so the light ink fill
// clears 3:1 on the canvas, and not the old neon #F58A4E.
const LIT_HEX = ['#DBAE6E', '#CCA56A', '#B8946A', '#B48C78', '#8A564C', '#7E5248']
const SHADE_HEX = ['#5A4C60', '#524658', '#4A3E50', '#443848', '#3E323C', '#382C36']
const NICHES = [
  { x: 18, z: -21.6 },
  { x: 12, z: -21.6 },
  { x: 5, z: -21.6 },
  { x: -4, z: -21.6 },
  { x: -14, z: -21.6 },
  { x: -20, z: -21.6 },
]

export interface StairHandle {
  ready: boolean
  load: () => Promise<void>
  apply: () => void
  clear: (restore: boolean) => void
  warm: (renderer: WebGLRenderer, camera: Camera) => void
  tick: (dt: number, time: number, wide: number, longday: number, px: number, pz: number, camX: number, camZ: number) => void
  place: (time: number, wide: number, longday: number) => void
  floorY: (x: number, z: number) => number
  isLit: (x: number, z: number) => boolean
  guide: (x: number, z: number, px: number, pz: number) => { x: number; z: number } | null
  plan: (time: number) => {
    darter: number
    boss: boolean
    rateMul: number
    houndFrom: number
    relocate: (x: number, z: number, rng: Rng) => { x: number; z: number }
  }
  sealAt: (x: number, z: number) => void
  sealBlock: (tile: number, seconds: number) => void
  snuffSeal: (tile: number) => void
  setSunElevation: (e: number, glideSeconds: number) => void
  hud: () => { elev: number; countdown: number }
  lightOffset: () => { x: number; y: number; z: number }
  agree: (renderer: WebGLRenderer, camera: Camera, points: ReadonlyArray<{ x: number; z: number }>, hide: Object3D[]) => { tested: number; agree: number }
  cover: () => { lit: number; n: number; reach: number; stripe: number; e: number; a: number; L: number; k: number }
  sunInfo: () => { e: number; a: number; L: number; glide: boolean; forecast: boolean; k: number; countdown: number; reach: number; stripe: number }
  mixerTicks: () => number
  tris: () => { floor: number; arch: number }
  cpu: () => { tick: number; decay: number; frames: number }
  benchLit: () => { ms: number; lit: number }
  benchDecay: () => { ms: number; n: number }
  seals: () => { n: number; uploadMax: number; decayHz: number; shadeGlideOnly: boolean; bytes: Uint8Array }
  mark: (x: number, z: number, on: boolean) => void
  maskBuilds: () => number
}

// Wide parapets (edges 0 and 2) use a 3.6 m side half. The design half is 2 m;
// the extra 1.6 m is jamb clearance so a pack can leave the square corner.
const WIDE_SIDE_HALF = 3.6

function gapOf(edge: number, g: number): { z: number; half: number } {
  if (g === 0) return { z: 0, half: 3 }
  const side = edge === 0 || edge === 2
  const mag = side ? 15 : 9
  return { z: g === 1 ? mag : -mag, half: side ? WIDE_SIDE_HALF : 2 }
}

function onSolid(edge: number, z0: number): boolean {
  if (z0 < -24 || z0 > 24) return false
  // Same gaps as gapOf, without allocating a record on the lit-test path.
  if (z0 > -3 && z0 < 3) return false
  const wide = edge === 0 || edge === 2
  const mag = wide ? 15 : 9
  const half = wide ? WIDE_SIDE_HALF : 2
  if (z0 > mag - half && z0 < mag + half) return false
  if (z0 > -mag - half && z0 < -mag + half) return false
  return true
}

export function floorY(x: number, z: number): number {
  const flat = x >= 14 ? 0 : x >= 4 ? 0.4 : x >= -6 ? 0.8 : x >= -16 ? 1.2 : 1.6
  for (let i = 0; i < 4; i++) {
    const edge = EDGES[i] ?? 0
    const dx = x - edge
    if (dx > 0.6 || dx < -0.6) continue
    if (onSolid(i, z)) continue
    const t = (0.6 - dx) / 1.2
    const lo = LO[i] ?? 0
    const hi = HI[i] ?? 0
    return lo + (hi - lo) * t
  }
  return flat
}

if (import.meta.env.DEV) {
  const east = floorY(16, 0)
  const summit = floorY(-20, 0)
  const mid = floorY(14, 0)
  if (east !== 0 || summit !== 1.6 || Math.abs(mid - 0.2) > 1e-4) {
    throw new Error(`stair floorY east ${east} summit ${summit} ramp ${mid}`)
  }
}

function solidSpans(edge: number): ReadonlyArray<readonly [number, number]> {
  // Center gaps stay inset 0.55 m. Wide side gaps add 0.2 m past the 3.6 m half
  // so a 0.5 m body clears the square jamb instead of parking on it.
  if (edge === 0 || edge === 2) return [
    [-24, -18.8],
    [-11.2, -3.55],
    [3.55, 11.2],
    [18.8, 24],
  ]
  return [
    [-24, -11.55],
    [-6.45, -3.55],
    [3.55, 6.45],
    [11.55, 24],
  ]
}

function terraceH(x: number): number {
  return x >= 14 ? 0 : x >= 4 ? 0.4 : x >= -6 ? 0.8 : x >= -16 ? 1.2 : 1.6
}

export function createStair(opts: {
  scene: Object3D
  fog: { uFogColor: { value: Color }; uFog: { value: number }; uFogNear: { value: number }; uFogFar: { value: number } }
  enemyMat: ShaderMaterial
  darter: InstancedMesh
  hide: Object3D[]
  restore: Object3D[]
}): StairHandle {
  const boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []
  const circles: { x: number; z: number; r: number }[] = []
  let parapetN = 0
  let maskBuilds = 0

  function addBox(minX: number, maxX: number, minZ: number, maxZ: number) {
    boxes.push({ minX, maxX, minZ, maxZ })
  }

  for (let i = 0; i < 4; i++) {
    const edge = EDGES[i] ?? 0
    const spans = solidSpans(i)
    for (let s = 0; s < spans.length; s++) {
      const span = spans[s]
      if (!span) continue
      addBox(edge - 0.6, edge, span[0], span[1])
    }
  }
  parapetN = boxes.length
  addBox(-24, 24, -24, -23.2)
  addBox(-24, 24, 23, 24)
  addBox(23.2, 24, -24, -3)
  addBox(23.2, 24, 3, 24)
  addBox(-24, -23.7, -24, 24)
  for (let i = 0; i < 5; i++) {
    const c = CAPS[i]
    if (c) circles.push({ x: c[0], z: c[1], r: 0.7 })
  }
  circles.push({ x: -1, z: 0, r: 1.4 })
  maskBuilds = 1

  const moved = { x: 0, z: 0 }
  const slideA = { x: 0, z: 0 }
  const slideB = { x: 0, z: 0 }
  const jambOut = { x: 0, z: 0 }

  // Mites and hounds pressed into a parapet face stall when separation cancels
  // the along-wall slide. Peel them off the stone and toward the nearest opening.
  // Player radius is 0.45 and is left alone.
  function facePeel(x0: number, z0: number, x1: number, z1: number, rad: number): { x: number; z: number } | null {
    if (rad > 0.36 && Math.abs(rad - 0.5) > 0.02) return null
    const dx = x1 - x0
    let best = 1e9
    let found = false
    for (let i = 0; i < parapetN; i++) {
      const b = boxes[i]
      if (!b) continue
      let edgeI = -1
      for (let e = 0; e < 4; e++) if (Math.abs((EDGES[e] ?? 0) - b.maxX) < 0.01) edgeI = e
      if (edgeI < 0) continue
      let inGap = false
      let gapZ = 0
      let gapHalf = 0
      for (let g = 0; g < 3; g++) {
        const gap = gapOf(edgeI, g)
        if (Math.abs(z0 - gap.z) <= gap.half - 0.15) {
          inGap = true
          gapZ = gap.z
          gapHalf = gap.half
        }
      }
      if (inGap) {
        const eastSkin = b.maxX + rad
        const westSkin = b.minX - rad
        const nearE = Math.abs(x0 - eastSkin)
        const nearW = Math.abs(x0 - westSkin)
        const dirZ = z0 >= gapZ ? -1 : 1
        const sideGap = Math.abs(gapZ) > 5
        const toLip = gapHalf - Math.abs(z0 - gapZ)
        // Side openings stall on the jamb, a metre off the wall, where the
        // east-lip peel never fires. Step into the lane before the skin tests.
        if (sideGap && toLip < 1.15 && (nearE < 2.2 || nearW < 2.2) && toLip < best) {
          best = toLip
          jambOut.x = x0 + (nearE <= nearW ? 0.6 : -0.6)
          jambOut.z = z0 + dirZ * 0.8
          found = true
        } else if (nearE < 0.7 && dx < 0.02 && nearE < best) {
          // On the east lip and not stepping out. Step off the stone and
          // toward the middle of the opening so the pack cannot lock there.
          best = nearE
          jambOut.x = eastSkin + 0.35
          jambOut.z = z0 + dirZ * (sideGap ? 0.8 : 0.45)
          found = true
        } else if (nearW < 0.7 && dx > -0.02 && dx < 0.02 && nearW < best) {
          best = nearW
          jambOut.x = westSkin - 0.35
          jambOut.z = z0 + dirZ * (sideGap ? 0.8 : 0.45)
          found = true
        } else if (nearW < 1.8 && dx > 0.04 && nearW < best) {
          best = nearW
          jambOut.x = x0 + 0.24
          jambOut.z = sideGap ? z0 + dirZ * 0.55 : z0
          found = true
        } else if (nearE < 1.8 && dx < -0.04 && nearE < best) {
          best = nearE
          jambOut.x = x0 - 0.24
          jambOut.z = sideGap ? z0 + dirZ * 0.55 : z0
          found = true
        }
        continue
      }
      for (let f = 0; f < 2; f++) {
        const face = f === 0 ? b.maxX : b.minX
        const outward = f === 0 ? 1 : -1
        const skin = face + outward * rad
        if (Math.abs(x0 - skin) > 1.8) continue
        const score = Math.abs(x0 - skin)
        if (score >= best) continue
        let dirZ = 1
        let gapD = 1e9
        for (let g = 0; g < 3; g++) {
          const gap = gapOf(edgeI, g)
          const d = Math.abs(z0 - gap.z)
          if (d < gapD) {
            gapD = d
            dirZ = Math.sign(gap.z - z0) || Math.sign(z1 - z0) || 1
          }
        }
        best = score
        jambOut.x = x0 + outward * 0.02
        jambOut.z = z0 + dirZ * 0.22
        found = true
      }
    }
    return found ? jambOut : null
  }

  function circleNudge(x0: number, z0: number, x1: number, z1: number, rad: number): { x: number; z: number } | null {
    if (rad > 0.36 && Math.abs(rad - 0.5) > 0.02) return null
    const dx = x1 - x0
    const dz = z1 - z0
    let best = 1e9
    let found = false
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i]
      if (!c) continue
      const ox = x0 - c.x
      const oz = z0 - c.z
      const d = Math.hypot(ox, oz)
      const min = rad + c.r
      if (d < 1e-4 || d > min + 0.5 || d < min - 0.08) continue
      const rx = ox / d
      const rz = oz / d
      if (dx * rx + dz * rz > 0.08) continue
      const cross = ox * (z1 - c.z) - oz * (x1 - c.x)
      const tx = cross >= 0 ? -rz : rz
      const tz = cross >= 0 ? rx : -rx
      const score = Math.abs(d - min)
      if (score >= best) continue
      best = score
      jambOut.x = x0 + rx * 0.48 + tx * 0.12
      jambOut.z = z0 + rz * 0.48 + tz * 0.12
      found = true
    }
    return found ? jambOut : null
  }

  // After the slide resolves, a body still sitting on a gap lip is pushed into
  // the lane. lipOut is not jambOut: slide copies these fields before resolveAt.
  const lipOut = { x: 0, z: 0 }
  function clearJamb(x: number, z: number, rad: number): { x: number; z: number } | null {
    if (rad > 0.36 && Math.abs(rad - 0.5) > 0.02) return null
    for (let i = 0; i < 4; i++) {
      const edge = EDGES[i] ?? 0
      if (Math.abs(x - edge) > 1.7 + rad) continue
      const spans = solidSpans(i)
      let best = 0.9
      let nz = z
      let hit = false
      for (let s = 0; s < spans.length; s++) {
        const span = spans[s]
        if (!span) continue
        for (let k = 0; k < 2; k++) {
          const lip = k === 0 ? span[0] : span[1]
          if (Math.abs(lip) > 22) continue
          const d = Math.abs(z - lip)
          if (d >= best) continue
          let gz = 0
          let gd = 1e9
          for (let g = 0; g < 3; g++) {
            const gap = gapOf(i, g)
            const dd = Math.abs(z - gap.z)
            if (dd < gd) {
              gd = dd
              gz = gap.z
            }
          }
          best = d
          nz = z + (Math.sign(gz - z) || 1) * 0.75
          hit = true
        }
      }
      if (!hit) continue
      const outward = x >= edge ? 1 : -1
      lipOut.x = edge + outward * (rad + 0.55)
      lipOut.z = nz
      return lipOut
    }
    return null
  }

  function park(x: number, z: number, rad: number): { x: number; z: number } {
    const cleared = clearJamb(x, z, rad)
    if (!cleared) {
      moved.x = x
      moved.z = z
      return moved
    }
    const cx = cleared.x
    const cz = cleared.z
    resolveAt(cx, cz, rad, slideB)
    moved.x = slideB.x
    moved.z = slideB.z
    return moved
  }

  function resolveAt(x0: number, z0: number, rad: number, dest: { x: number; z: number }) {
    let x = x0
    let z = z0
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]
        if (!b) continue
        const minX = b.minX - rad
        const maxX = b.maxX + rad
        const minZ = b.minZ - rad
        const maxZ = b.maxZ + rad
        if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue
        const penL = x - minX
        const penR = maxX - x
        const penD = z - minZ
        const penU = maxZ - z
        if (i < parapetN) {
          const penX = Math.min(penL, penR)
          const penZ = Math.min(penD, penU)
          if (penZ < penX * 0.5) {
            if (penD < penU) z = minZ
            else z = maxZ
          } else if (penL < penR) x = minX
          else x = maxX
          continue
        }
        const min = Math.min(penL, penR, penD, penU)
        if (min === penL) x = minX
        else if (min === penR) x = maxX
        else if (min === penD) z = minZ
        else z = maxZ
      }
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i]
        if (!c) continue
        const dx = x - c.x
        const dz = z - c.z
        const min = rad + c.r
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min) continue
        if (d2 < 1e-8) {
          x = c.x + min
          continue
        }
        const k = min / Math.sqrt(d2)
        x = c.x + dx * k
        z = c.z + dz * k
      }
      if (x < -24 + rad) x = -24 + rad
      if (x > 24 - rad) x = 24 - rad
      if (z < -24 + rad) z = -24 + rad
      if (z > 24 - rad) z = 24 - rad
    }
    dest.x = x
    dest.z = z
  }

  function hitsBox(x: number, z: number, rad: number): boolean {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      if (!b) continue
      if (x > b.minX - rad && x < b.maxX + rad && z > b.minZ - rad && z < b.maxZ + rad) return true
    }
    return false
  }

  function hitsCircle(x: number, z: number, rad: number): boolean {
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i]
      if (!c) continue
      const dx = x - c.x
      const dz = z - c.z
      const min = rad + c.r
      if (dx * dx + dz * dz < min * min) return true
    }
    return false
  }

  function inside(x: number, z: number, rad: number): boolean {
    if (Math.abs(x) > 24 - rad || Math.abs(z) > 24 - rad) return false
    if (hitsBox(x, z, rad) || hitsCircle(x, z, rad)) return false
    return true
  }

  function segBox(x0: number, z0: number, x1: number, z1: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
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

  function segCircle(x0: number, z0: number, x1: number, z1: number, cx: number, cz: number, r: number): boolean {
    const dx = x1 - x0
    const dz = z1 - z0
    const fx = x0 - cx
    const fz = z0 - cz
    const a = dx * dx + dz * dz
    const b = 2 * (fx * dx + fz * dz)
    const c = fx * fx + fz * fz - r * r
    if (a < 1e-8) return c <= 0
    const disc = b * b - 4 * a * c
    if (disc < 0) return false
    const s = Math.sqrt(disc)
    const inv = 1 / (2 * a)
    const tA = (-b - s) * inv
    const tB = (-b + s) * inv
    return (tA >= 0 && tA <= 1) || (tB >= 0 && tB <= 1) || (tA < 0 && tB > 1)
  }

  function lineBlocked(x0: number, z0: number, x1: number, z1: number, parapetOnly: boolean): boolean {
    const n = parapetOnly ? parapetN : boxes.length
    for (let i = 0; i < n; i++) {
      const b = boxes[i]
      if (b && segBox(x0, z0, x1, z1, b)) return true
    }
    if (parapetOnly) return false
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i]
      if (c && segCircle(x0, z0, x1, z1, c.x, c.z, c.r)) return true
    }
    return false
  }

  const body: StairBody = {
    resolve(x, z, rad) {
      resolveAt(x, z, rad, moved)
      return moved
    },
    slide(x0, z0, x1, z1, rad) {
      const nudge = facePeel(x0, z0, x1, z1, rad) ?? circleNudge(x0, z0, x1, z1, rad)
      if (nudge) {
        x1 = nudge.x
        z1 = nudge.z
      }
      resolveAt(x1, z1, rad, slideA)
      const fx = slideA.x
      const fz = slideA.z
      const want = Math.hypot(x1 - x0, z1 - z0)
      const got = Math.hypot(fx - x0, fz - z0)
      if (want < 1e-5 || got > want * 0.45) return park(fx, fz, rad)
      resolveAt(x1, z0, rad, slideA)
      const ax = slideA.x
      const az = slideA.z
      resolveAt(x0, z1, rad, slideB)
      const bx = slideB.x
      const bz = slideB.z
      if (Math.hypot(ax - x0, az - z0) >= Math.hypot(bx - x0, bz - z0)) return park(ax, az, rad)
      return park(bx, bz, rad)
    },
    inside,
    blocked(x0, z0, x1, z1) {
      return lineBlocked(x0, z0, x1, z1, false)
    },
  }

  const parts: BufferGeometry[] = []
  function stamp(geo: BufferGeometry, color: Color) {
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
  }
  function putBox(w: number, h: number, d: number, x: number, y: number, z: number, color: Color) {
    const geo = new BoxGeometry(w, h, d)
    stamp(geo, color)
    geo.translate(x, y, z)
    parts.push(geo)
  }
  function putCyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: Color, rotX = 0) {
    const geo = new CylinderGeometry(rt, rb, h, seg)
    if (rotX !== 0) geo.rotateX(rotX)
    stamp(geo, color)
    geo.translate(x, y, z)
    parts.push(geo)
  }
  function putCone(r: number, h: number, x: number, y: number, z: number, color: Color) {
    const geo = new ConeGeometry(r, h, 5)
    stamp(geo, color)
    geo.translate(x, y, z)
    parts.push(geo)
  }

  for (let i = 0; i < 4; i++) {
    const edge = EDGES[i] ?? 0
    const hi = HI[i] ?? 0
    const lo = LO[i] ?? 0
    const spans = solidSpans(i)
    for (let s = 0; s < spans.length; s++) {
      const span = spans[s]
      if (!span) continue
      const z0 = span[0]
      const z1 = span[1]
      const depth = z1 - z0
      const zc = (z0 + z1) * 0.5
      const xc = edge - 0.3
      putBox(0.6, 0.68, depth, xc, hi + 0.34, zc, COLOR.stairStone)
      putBox(0.72, 0.12, depth + 0.04, xc, hi + 0.74, zc, COLOR.stairTerracotta)
      putBox(0.66, 0.08, depth, xc, hi + 0.56, zc, COLOR.gold)
      for (let z = z0 + 0.2; z < z1 - 0.2; z += 2) {
        putBox(0.08, 0.36, 1.3, edge - 0.02, hi + 0.32, z + 0.65, COLOR.stairStoneDeep)
      }
      const ends = [z0, z1]
      for (let e = 0; e < ends.length; e++) {
        const ze = ends[e] ?? 0
        if (Math.abs(ze) > 22) {
          const uz = ze < 0 ? ze + 0.7 : ze - 0.7
          putCyl(0.28, 0.34, 0.55, 6, xc, hi + 0.28, uz, COLOR.stairTerracotta)
          putCyl(0.16, 0.2, 0.18, 6, xc, hi + 0.62, uz, COLOR.stairTerracottaDeep)
        } else {
          const inset = ze < zc ? ze + 0.28 : ze - 0.28
          putBox(0.55, 0.96, 0.55, xc, hi + 0.48, inset, COLOR.stairStoneDeep)
          putCyl(0.22, 0.18, 0.1, 6, xc, hi + 1.02, inset, COLOR.bronze)
        }
      }
      putBox(0.08, hi - lo, depth, edge + 0.04, lo + (hi - lo) * 0.5, zc, COLOR.stairStoneDeep)
    }
    for (let g = 0; g < 3; g++) {
      const gap = gapOf(i, g)
      const depth = gap.half * 2
      for (let s = 0; s < 3; s++) {
        const cx = edge + 0.4 - s * 0.4
        const top = lo + 0.13 * (s + 1)
        const h = Math.max(0.08, top - lo)
        putBox(0.4, h, depth * 0.98, cx, lo + h * 0.5, gap.z, s === 2 ? COLOR.stairStone : COLOR.stairStoneDeep)
        putBox(0.08, 0.04, depth * 0.98, cx + 0.14, top + 0.02, gap.z, COLOR.linen)
      }
    }
  }

  const terraces = [
    [14, 24, 0],
    [4, 14, 0.4],
    [-6, 4, 0.8],
    [-16, -6, 1.2],
    [-24, -16, 1.6],
  ]
  for (let t = 0; t < terraces.length; t++) {
    const row = terraces[t]
    if (!row) continue
    const x0 = row[0]
    const x1 = row[1]
    const h = row[2]
    const mid = (x0 + x1) * 0.5
    const w = x1 - x0
    putBox(w, 1.4, 0.8, mid, h + 0.7, -23.6, COLOR.stairStone)
    putBox(w, 1.3, 0.55, mid, h + 2.05, -23.9, COLOR.stairStone)
    putBox(w, 1.3, 0.4, mid, h + 3.3, -24.15, COLOR.stairStoneDeep)
    putBox(w + 0.1, 0.16, 1.15, mid, h + 3.92, -23.55, COLOR.stairTerracotta)
    putBox(w, 1.0, 1.0, mid, h + 0.5, 23.5, COLOR.stairStone)
    putBox(w + 0.04, 0.12, 1.12, mid, h + 1.06, 23.5, COLOR.stairTerracotta)
  }
  for (let i = 0; i < 8; i++) {
    const x = -21 + i * 6
    const h = terraceH(x)
    putCyl(0.6, 0.6, 0.08, 8, x, h + 1.15, -23.16, COLOR.bronze, Math.PI / 2)
    putCyl(0.18, 0.18, 0.05, 6, x, h + 1.15, -23.1, COLOR.gold, Math.PI / 2)
  }
  for (let i = 0; i < NICHES.length; i++) {
    const n = NICHES[i]
    if (!n) continue
    const h = terraceH(n.x)
    putBox(1.15, 1.5, 0.18, n.x, h + 1.0, -23.28, COLOR.stairStoneDeep)
  }
  const trees = [-16, 0, 16]
  for (let i = 0; i < trees.length; i++) {
    const x = trees[i] ?? 0
    putCone(1.15, 2.1, x, 1.05, -27, COLOR.stairCypress)
    putCone(0.85, 1.8, x, 2.3, -27, COLOR.stairCypress)
    putCone(0.5, 1.4, x, 3.4, -27, COLOR.stairCypress)
  }
  putBox(0.8, 1.0, 21, 23.6, 0.5, -13.5, COLOR.stairStone)
  putBox(0.8, 1.0, 21, 23.6, 0.5, 13.5, COLOR.stairStone)
  putBox(0.9, 0.12, 21.1, 23.6, 1.06, -13.5, COLOR.stairTerracotta)
  putBox(0.9, 0.12, 21.1, 23.6, 1.06, 13.5, COLOR.stairTerracotta)
  for (const bz of [-4.4, 4.4]) {
    putBox(0.08, 0.9, 0.08, 21.5, 0.45, bz - 0.28, COLOR.bronze)
    putBox(0.08, 0.9, 0.08, 21.5, 0.45, bz + 0.28, COLOR.bronze)
    putBox(0.08, 0.9, 0.08, 21.85, 0.45, bz, COLOR.bronze)
    putCyl(0.34, 0.28, 0.22, 6, 21.6, 1.05, bz, COLOR.bronze)
  }
  putBox(0.2, 0.2, 46, -23.85, 1.7, 0, COLOR.gold)
  putBox(2, 0.28, 1, -22.2, 1.74, 0, COLOR.stairStone)
  putBox(1.45, 0.22, 0.7, -22.2, 1.98, 0, COLOR.stairStoneDeep)
  putBox(0.9, 0.16, 0.42, -22.2, 2.16, 0, COLOR.gold)
  putBox(1.7, 0.6, 1.7, -1, 1.1, 0, COLOR.stairStone)
  const pylons = CAPS.slice(0, 5)
  for (let i = 0; i < pylons.length; i++) {
    const c = pylons[i]
    if (!c) continue
    const base = floorY(c[0], c[1])
    putCyl(0.35, 0.6, 6, 6, c[0], base + 3, c[1], COLOR.stairStone)
    putCyl(0.58, 0.58, 0.08, 6, c[0], base + 1.5, c[1], COLOR.gold)
    putCyl(0.5, 0.5, 0.08, 6, c[0], base + 3, c[1], COLOR.gold)
    putCyl(0.44, 0.44, 0.08, 6, c[0], base + 4.5, c[1], COLOR.gold)
    putCone(0.36, 0.7, c[0], base + 6.35, c[1], COLOR.gold)
  }
  const benches = [
    [16, -20],
    [8, -20],
    [-8, -20],
    [-18, -20.2],
  ]
  for (let i = 0; i < benches.length; i++) {
    const b = benches[i]
    if (!b) continue
    const h = floorY(b[0], b[1])
    putBox(1.3, 0.38, 0.42, b[0], h + 0.28, b[1], COLOR.stairStone)
    putBox(1.3, 0.08, 0.48, b[0], h + 0.5, b[1], COLOR.stairTerracotta)
  }
  const pxPav = -30
  const pzPav = -28
  putBox(4.2, 0.3, 4.2, pxPav, 0.15, pzPav, COLOR.stairStone)
  for (const ox of [-1.3, 1.3]) {
    for (const oz of [-1.3, 1.3]) {
      putCyl(0.22, 0.26, 2.4, 6, pxPav + ox, 1.5, pzPav + oz, COLOR.stairStone)
    }
  }
  putCone(2.3, 1.3, pxPav, 3.15, pzPav, COLOR.stairTerracotta)
  putCone(0.12, 0.45, pxPav, 3.9, pzPav, COLOR.gold)
  putBox(220, 0.04, 220, 0, -0.2, 0, COLOR.sandstone)

  const archGeo = mergeGeometries(parts, false)
  if (!archGeo) throw new Error('stair architecture')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  const archMat = new MeshLambertMaterial({ vertexColors: true })
  const arch = new Mesh(archGeo, archMat)
  arch.name = 'stair-arch'
  arch.frustumCulled = false
  arch.castShadow = false
  arch.receiveShadow = false
  arch.visible = false

  const floorGeo = new PlaneGeometry(48, 48, 48, 24)
  floorGeo.rotateX(-Math.PI / 2)
  const floorPos = floorGeo.getAttribute('position')
  for (let i = 0; i < floorPos.count; i++) floorPos.setY(i, floorY(floorPos.getX(i), floorPos.getZ(i)))
  floorGeo.computeVertexNormals()
  const floorN = floorGeo.getAttribute('normal')
  let floorUp = 0
  for (let i = 0; i < floorN.count; i++) floorUp += floorN.getY(i)
  if (floorUp < 0) {
    const idx = floorGeo.getIndex()
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i)
        idx.setX(i, idx.getX(i + 1))
        idx.setX(i + 1, a)
      }
      floorGeo.computeVertexNormals()
    }
  }
  const bytes = new Uint8Array(576)
  const sealTex = new DataTexture(bytes, 24, 24, RedFormat, UnsignedByteType)
  sealTex.magFilter = NearestFilter
  sealTex.minFilter = NearestFilter
  sealTex.wrapS = ClampToEdgeWrapping
  sealTex.wrapT = ClampToEdgeWrapping
  sealTex.colorSpace = NoColorSpace
  sealTex.flipY = false
  sealTex.generateMipmaps = false
  sealTex.needsUpdate = true

  const uLit = { value: new Color(LIT_HEX[0]) }
  const uShade = { value: new Color(SHADE_HEX[0]) }
  const uGrout = { value: new Color('#D2C0A4') }
  const uGold = { value: COLOR.gold.clone() }
  const uHot = { value: COLOR.goldHot.clone() }
  const uTerr = { value: COLOR.stairTerracotta.clone() }
  const uRose = { value: COLOR.rose.clone() }
  // Stair telegraph only. Global ink and warn still tint enemies and the other maps.
  // Fill stays the light warn. The outer ring is dark on lit stone and the 70% ink mix on shade.
  const uInk = { value: new Color('#FBF3E8') }
  const uWarn = { value: new Color('#FFF6EC') }
  const uEdge = { value: new Color('#1A1014') }
  const uL = { value: 1.28 }
  const uCos = { value: Math.cos((-18 * Math.PI) / 180) }
  const uSin = { value: Math.sin((-18 * Math.PI) / 180) }
  const uTan = { value: Math.tan((-18 * Math.PI) / 180) }
  const uReach = { value: 1.46 }
  let litCos = uCos.value
  let litTan = uTan.value
  let litReach = uReach.value
  const capX = new Float64Array(CAPS.length)
  const capZ = new Float64Array(CAPS.length)
  const capAx = new Float64Array(CAPS.length)
  const capAz = new Float64Array(CAPS.length)
  const capA2 = new Float64Array(CAPS.length)
  const capR2 = new Float64Array(CAPS.length)
  const capMinX = new Float64Array(CAPS.length)
  const capMaxX = new Float64Array(CAPS.length)
  const capMinZ = new Float64Array(CAPS.length)
  const capMaxZ = new Float64Array(CAPS.length)
  const uFore = { value: 0 }
  const uForeReach = { value: 1.46 }
  const uForeTan = { value: 0 }
  const uForeCos = { value: 1 }
  const uTime = { value: 0 }
  const uProbe = { value: 0 }
  const uMark = { value: new Vector3(0, 0, 0) }
  const uCaps = { value: CAPS.map((c) => new Vector4(c[0], c[1], c[2], c[3])) }
  const floorMat = new ShaderMaterial({
    uniforms: {
      uLit,
      uShade,
      uGrout,
      uGold,
      uHot,
      uTerr,
      uRose,
      uInk,
      uWarn,
      uEdge,
      uL,
      uCos,
      uSin,
      uTan,
      uReach,
      uFore,
      uForeReach,
      uForeTan,
      uForeCos,
      uTime,
      uProbe,
      uMark,
      uCaps,
      uSeal: { value: sealTex },
      uFogColor: opts.fog.uFogColor,
      uFog: opts.fog.uFog,
      uFogNear: opts.fog.uFogNear,
      uFogFar: opts.fog.uFogFar,
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      varying float vView;
      void main() {
        vWorld = position.xz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vWorld;
      varying float vView;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uGrout;
      uniform vec3 uGold;
      uniform vec3 uHot;
      uniform vec3 uTerr;
      uniform vec3 uRose;
      uniform vec3 uInk;
      uniform vec3 uWarn;
      uniform vec3 uEdge;
      uniform float uL;
      uniform float uCos;
      uniform float uSin;
      uniform float uTan;
      uniform float uReach;
      uniform float uFore;
      uniform float uForeReach;
      uniform float uForeTan;
      uniform float uForeCos;
      uniform float uTime;
      uniform float uProbe;
      uniform vec3 uMark;
      uniform vec4 uCaps[6];
      uniform sampler2D uSeal;
      uniform vec3 uFogColor;
      uniform float uFog;
      uniform float uFogNear;
      uniform float uFogFar;
      float sealAt(vec2 p) {
        vec2 tile = floor((p + 24.0) / 2.0);
        if (tile.x < 0.0 || tile.y < 0.0 || tile.x > 23.0 || tile.y > 23.0) return 0.0;
        return texture2D(uSeal, (tile + 0.5) / 24.0).r;
      }
      bool gapOpen(int i, float z0) {
        if (abs(z0) < 3.0) return true;
        float side = (i == 0 || i == 2) ? 15.0 : 9.0;
        float gapHalf = (i == 0 || i == 2) ? 3.6 : 2.0;
        return abs(z0 - side) < gapHalf || abs(z0 + side) < gapHalf;
      }
      float edgeAt(int i) {
        if (i == 1) return 4.0;
        if (i == 2) return -6.0;
        if (i == 3) return -16.0;
        return 14.0;
      }
      bool stairShade(vec2 p) {
        if (uCos > 0.0 && uReach > 0.0) {
          for (int i = 0; i < 4; i++) {
            float dx = p.x - edgeAt(i);
            if (dx <= 0.0 || dx > uReach) continue;
            float z0 = p.y - dx * uTan;
            if (z0 < -24.0 || z0 > 24.0) continue;
            if (!gapOpen(i, z0)) return true;
          }
        }
        for (int i = 0; i < 6; i++) {
          vec4 c = uCaps[i];
          vec2 a = c.xy;
          vec2 d = vec2(uCos, uSin) * (c.z * uL);
          float ab2 = dot(d, d);
          if (ab2 < 1e-6) continue;
          float t = dot(p - a, d) / ab2;
          if (t < 0.0) continue;
          if (t > 1.0) t = 1.0;
          vec2 q = a + d * t;
          if (dot(p - q, p - q) <= c.w * c.w) return true;
        }
        return false;
      }
      float stairCover(vec2 p) {
        float cover = 0.0;
        float pen = 0.15;
        if (uCos > 0.0 && uReach > 0.0) {
          for (int i = 0; i < 4; i++) {
            float dx = p.x - edgeAt(i);
            float along = smoothstep(0.0, pen, dx) * (1.0 - smoothstep(uReach - pen, uReach, dx));
            if (along <= 0.0) continue;
            float z0 = p.y - dx * uTan;
            if (z0 < -24.0 || z0 > 24.0) continue;
            float side = (i == 0 || i == 2) ? 15.0 : 9.0;
            float gapH = (i == 0 || i == 2) ? 3.6 : 2.0;
            float openC = 1.0 - smoothstep(3.0 - pen, 3.0 + pen, abs(z0));
            float dGap = min(abs(z0 - side), abs(z0 + side));
            float openS = 1.0 - smoothstep(gapH - pen, gapH + pen, dGap);
            float solid = 1.0 - max(openC, openS);
            cover = max(cover, along * solid);
          }
        }
        for (int i = 0; i < 6; i++) {
          vec4 c = uCaps[i];
          vec2 a = c.xy;
          vec2 d = vec2(uCos, uSin) * (c.z * uL);
          float ab2 = dot(d, d);
          if (ab2 < 1e-6) continue;
          float t = dot(p - a, d) / ab2;
          if (t < 0.0) continue;
          if (t > 1.0) t = 1.0;
          vec2 q = a + d * t;
          float dist = length(p - q) - c.w;
          cover = max(cover, 1.0 - smoothstep(-pen, pen, dist));
        }
        return clamp(cover, 0.0, 1.0);
      }
      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec2 p = vWorld;
        bool shade = stairShade(p);
        float seal = sealAt(p);
        bool lit = !shade || seal > 0.004;
        if (uProbe > 0.5) {
          float k = lit ? 1.0 : 0.0;
          gl_FragColor = vec4(k, k, k, 1.0);
          return;
        }
        vec2 tile = floor((p + 24.0) / 2.0);
        vec2 f = fract((p + 24.0) / 2.0);
        float grout = smoothstep(0.0, 0.045, f.x) * smoothstep(1.0, 0.955, f.x)
          * smoothstep(0.0, 0.045, f.y) * smoothstep(1.0, 0.955, f.y);
        float jitter = (hash2(tile) * 2.0 - 1.0) * 0.18 + (hash2(floor(tile * 0.5)) * 2.0 - 1.0) * 0.09;
        vec3 stone = uLit * (1.0 + jitter);
        if (f.x < 0.06) stone += vec3(0.025) * smoothstep(0.0, 0.06, grout);
        vec2 q = f - 0.5;
        float ang = atan(q.y, q.x);
        float rays = abs(fract(ang * 1.2732395) - 0.5);
        float burst = step(length(q), 0.225) * step(rays, 0.16);
        if (burst > 0.5) {
          if (seal > 0.004) {
            float pulse = seal < 0.085 ? 0.65 + 0.35 * sin(uTime * 8.0) : 1.0;
            stone = mix(stone, uHot, pulse);
          } else stone *= 0.48;
        }
        float lip = step(0.20, length(q)) * step(length(q), 0.31) * step(rays, 0.24);
        if (lip > 0.5 && seal < 0.004) stone = mix(stone, uLit * (1.0 + jitter) * 1.15, 0.85);
        if (seal > 0.02 && abs(length(q) - 0.3) < 0.035) stone = mix(stone, uGold, 0.9);
        vec3 col = mix(uGrout, stone, grout);
        if (abs(p.y) < 3.0) {
          float along = abs(fract((p.x * 0.85 + p.y * 1.7)) - 0.5);
          vec3 brick = mix(uTerr, uTerr * 0.82, step(0.18, along));
          col = mix(col, brick, 0.78);
          if (abs(abs(p.y) - 2.9) < 0.12) col = uGold;
        }
        if (p.x > 15.5 && p.x < 22.5) {
          for (int i = 0; i < 3; i++) {
            float cx = 21.0 - float(i) * 1.6;
            float dx = p.x - cx;
            float dz = abs(p.y);
            if (dx > 0.0 && dx < 0.7 && dz < 0.08 + dx * 0.55 && dz > dx * 0.28) col = uGold;
          }
        }
        if (p.x < -16.0) col = mix(col, uRose, 0.55);
        vec2 comp = p - vec2(-20.0, 0.0);
        float cr = length(comp);
        if (cr < 3.5 && cr > 3.28) col = uGold;
        if (cr < 3.4) {
          float ca = atan(comp.y, comp.x);
          float spoke = abs(fract((ca + 3.14159265) * 2.546479) - 0.5);
          float longWest = smoothstep(0.8, 0.0, abs(ca - 3.14159265));
          if (spoke < 0.06 && cr > 0.4 && cr < 3.2 + longWest * 0.15) col = uGold;
        }
        float cover = stairCover(p);
        if (seal > 0.004) cover = 0.0;
        vec3 shadeGain = uShade / max(uLit, vec3(0.045));
        if (uFore > 0.5 && uForeCos > 0.0) {
          for (int i = 0; i < 4; i++) {
            float edge = edgeAt(i);
            float dx = p.x - edge;
            float z0 = p.y - dx * uForeTan;
            if (gapOpen(i, z0)) continue;
            if (abs(dx - uForeReach) < 0.14 && fract(p.y * 0.45) > 0.45) col = mix(col, uGold, 0.9);
            if (dx > uReach && dx < uForeReach && dx > 0.0) col = mix(col, col * shadeGain, 0.6);
          }
        }
        col = mix(col, col * shadeGain, cover);
        if (uMark.z > 0.5) {
          float mr = length(p - uMark.xy);
          if (mr < 0.80) {
            if (mr > 0.66) col = cover > 0.5 ? mix(col, uInk, 0.7) : uEdge;
            else if (mr > 0.58) col = mix(col, uInk, 0.7);
            else col = uWarn;
          }
        }
        if (uFog > 0.5) {
          float fogT = clamp((vView - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
          col = mix(col, uFogColor, fogT);
        }
        gl_FragColor = vec4(col, 1.0);
        // Bloom draws this into a linear target, where the encode is a no-op, then tonemaps once.
        // On the canvas the same pair encodes a single time, matching the other floors.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const floor = new Mesh(floorGeo, floorMat)
  floor.name = 'stair-floor'
  floor.frustumCulled = false
  floor.castShadow = false
  floor.receiveShadow = false
  floor.visible = false
  floor.renderOrder = 1
  opts.scene.add(floor, arch)

  const lifted = opts.enemyMat.clone()
  const sharedTime = opts.enemyMat.uniforms.uTime
  if (sharedTime) lifted.uniforms.uTime = sharedTime
  const terraceFn = `float stairRamp(float y, float x, float z, float edge, float lo, float hi, float side) {
    float dx = x - edge;
    if (dx > 0.6 || dx < -0.6) return y;
    bool gap = abs(z) < 3.0;
    if (side > 0.5) gap = gap || abs(z - 15.0) < 3.6 || abs(z + 15.0) < 3.6;
    else gap = gap || abs(z - 9.0) < 2.0 || abs(z + 9.0) < 2.0;
    if (!gap) return y;
    float t = clamp((0.6 - dx) / 1.2, 0.0, 1.0);
    return mix(lo, hi, t);
  }
  float stairY(float z, float x) {
    float y = x >= 14.0 ? 0.0 : x >= 4.0 ? 0.4 : x >= -6.0 ? 0.8 : x >= -16.0 ? 1.2 : 1.6;
    y = stairRamp(y, x, z, 14.0, 0.0, 0.4, 1.0);
    y = stairRamp(y, x, z, 4.0, 0.4, 0.8, 0.0);
    y = stairRamp(y, x, z, -6.0, 0.8, 1.2, 1.0);
    y = stairRamp(y, x, z, -16.0, 1.2, 1.6, 0.0);
    return y;
  }
  void main() {`
  lifted.vertexShader = opts.enemyMat.vertexShader.replace('void main() {', terraceFn).replace(
    'vec4(x2 + iPose.x, y1, z2 + iPose.y, 1.0)',
    'vec4(x2 + iPose.x, y1 + stairY(iPose.y, iPose.x), z2 + iPose.y, 1.0)',
  )

  let newelRoot: Group | null = null
  let mixerTicks = 0
  let posed = false

  function dormancy(mat: MeshStandardMaterial) {
    const src = mat.emissiveMap
    const image = src?.image as CanvasImageSource | undefined
    mat.emissive.set(0xffffff)
    mat.emissiveIntensity = 0.6
    if (!src || !image) return
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const g = canvas.getContext('2d', { willReadFrequently: true })
    if (!g) return
    g.drawImage(image, 0, 0, 4, 4)
    const img = g.getImageData(0, 0, 4, 4)
    for (let y = 0; y < 4; y++) {
      const o = (y * 4 + 1) * 4
      img.data[o] = 0
      img.data[o + 1] = 0
      img.data[o + 2] = 0
      img.data[o + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const tex = new CanvasTexture(canvas)
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.flipY = false
    tex.colorSpace = NoColorSpace
    tex.needsUpdate = true
    mat.emissiveMap = tex
    mat.needsUpdate = true
  }

  async function loadNewel() {
    if (posed) return
    await MeshoptDecoder.ready
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/chars/newel_h3d_meshopt.glb`)
    const clip = gltf.animations.find((a) => a.name === 'dormant')
    if (!clip) throw new Error('newel dormant clip missing')
    let skin: SkinnedMesh | null = null
    gltf.scene.traverse((obj) => {
      obj.frustumCulled = false
      obj.castShadow = false
      obj.receiveShadow = false
      const mesh = obj as SkinnedMesh
      if (mesh.isSkinnedMesh) skin = mesh
    })
    if (!skin) throw new Error('newel mesh missing')
    const mesh: SkinnedMesh = skin
    mesh.name = 'stair-newel'
    const mat0 = mesh.material
    const srcMat = (Array.isArray(mat0) ? mat0[0] : mat0) as MeshStandardMaterial
    const mat = srcMat.clone()
    dormancy(mat)
    // Colour is on TEXCOORD_1. vertexColors would sample a missing COLOR_0 as black.
    mat.vertexColors = false
    mat.flatShading = false
    mat.color.set(0xffffff)
    if (mat.map) mat.map.channel = 1
    mesh.material = mat
    const root = new Group()
    root.name = 'stair-newel-root'
    root.add(gltf.scene)
    // Authored front is +z (newel_h3d.json). rotation.y = +π/2 sends local +z to world +x, east toward the forecourt.
    root.position.set(-1, 1.4, 0)
    root.rotation.y = Math.PI / 2
    root.scale.setScalar(1)
    root.frustumCulled = false
    root.visible = false
    const mixer = new AnimationMixer(gltf.scene)
    const action = mixer.clipAction(clip)
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    mixer.update(clip.duration)
    action.paused = true
    mixerTicks = 0
    opts.scene.add(root)
    newelRoot = root
    posed = true
  }

  const litColors = LIT_HEX.map((hex) => new Color(hex))
  const shadeColors = SHADE_HEX.map((hex) => new Color(hex))
  const seals: { ix: number; iz: number; strength: number; shade: number; born: number }[] = []
  const holdUntil = new Float32Array(576)
  let born = 1
  let sim = 0
  let dirty = false
  let lastUpload = -1
  let upWindow = 0
  let upCount = 0
  let upMax = 0
  let decayPasses = 0
  let decayMs = 0
  let shadeOutside = false
  let decayAcc = 0
  let shadeAcc = 0
  let prevT = 0
  let heldL = STEPS[0]?.L ?? 1.28
  let glideKey = -1
  let glideFrom = heldL
  let curL = heldL
  let curA = STEPS[0]?.a ?? 252
  let curE = STEPS[0]?.e ?? 38
  let curGlide = false
  let curForecast = false
  let curK = 0
  let curCount = 60
  let pin = -1
  let wantFill = false
  let forceE: number | null = null
  let forceUntil = 0
  let runT = 0
  let tickMs = 0
  let tickN = 0
  let px = 16
  let pz = 0
  let camX = 30
  let camZ = 30
  const steer = { x: 0, z: 0 }
  const spot = { x: 20, z: 0 }
  const hudOut = { elev: 38, countdown: 60 }
  const aim = { x: -12, y: 10, z: 2 }
  const pixel = new Uint8Array(4)
  const ndc = new Vector3()
  const drawSize = new Vector2()

  function stepIndex(t: number): number {
    if (t >= 276) return 5
    if (t >= 246) return 4
    if (t >= 186) return 3
    if (t >= 126) return 2
    if (t >= 66) return 1
    return 0
  }
  function glideAt(t: number): number {
    for (let i = 0; i < GLIDES.length; i++) {
      const g = GLIDES[i]
      if (g && t >= g.t0 && t < g.t1) return i
    }
    return -1
  }
  function forecastOn(t: number): boolean {
    for (let i = 0; i < GLIDES.length; i++) {
      const g = GLIDES[i]
      if (g && t >= g.t0 - 5 && t < g.t1) return true
    }
    return false
  }
  function countdownTo(t: number): number {
    for (let i = 0; i < GLIDES.length; i++) {
      const g = GLIDES[i]
      if (g && t < g.t0) return g.t0 - t
    }
    return 0
  }
  function azimuth(t: number): number {
    const g = glideAt(t)
    if (g < 0) return STEPS[stepIndex(t)]?.a ?? 252
    const glide = GLIDES[g]
    if (!glide) return 252
    const u = (t - glide.t0) / (glide.t1 - glide.t0)
    const a0 = STEPS[glide.from]?.a ?? 252
    const a1 = STEPS[glide.to]?.a ?? a0
    return a0 + (a1 - a0) * u
  }
  function stepSun(t: number, longday: number) {
    const g = glideAt(t)
    if (g >= 0) {
      const glide = GLIDES[g]
      if (!glide) return
      if (glideKey !== g) {
        glideKey = g
        glideFrom = heldL
      }
      const u = (t - glide.t0) / (glide.t1 - glide.t0)
      const L0 = STEPS[glide.from]?.L ?? heldL
      const L1 = STEPS[glide.to]?.L ?? L0
      heldL = glideFrom + (L1 - L0) * Math.pow(0.75, longday) * u
      return
    }
    if (glideKey >= 0) {
      const glide = GLIDES[glideKey]
      if (glide) {
        const L0 = STEPS[glide.from]?.L ?? heldL
        const L1 = STEPS[glide.to]?.L ?? L0
        heldL = glideFrom + (L1 - L0) * Math.pow(0.75, longday)
      }
      glideKey = -1
    }
  }
  function advanceSun(t: number, longday: number) {
    if (t < prevT - 0.02) {
      heldL = STEPS[0]?.L ?? 1.28
      glideKey = -1
      prevT = 0
    }
    let cursor = prevT
    if (t > cursor + 0.2) {
      while (cursor + 0.1 < t) {
        cursor += 0.1
        stepSun(cursor, longday)
      }
    }
    stepSun(t, longday)
    prevT = t
  }
  function publish(L: number, aDeg: number, fore: boolean, foreL: number, foreA: number) {
    const phi = ((aDeg - 270) * Math.PI) / 180
    const cosP = Math.cos(phi)
    const sinP = Math.sin(phi)
    curL = L
    curA = aDeg
    uL.value = L
    uCos.value = cosP
    uSin.value = sinP
    uTan.value = Math.abs(cosP) > 1e-4 ? sinP / cosP : 0
    uReach.value = cosP > 0 ? Math.min(REACH_CAP, OCC * L * cosP) : 0
    litCos = cosP
    litTan = uTan.value
    litReach = uReach.value
    for (let i = 0; i < CAPS.length; i++) {
      const c = CAPS[i]
      if (!c) continue
      const len = c[2] * L
      const abx = cosP * len
      const abz = sinP * len
      const r = c[3]
      capX[i] = c[0]
      capZ[i] = c[1]
      capAx[i] = abx
      capAz[i] = abz
      capA2[i] = abx * abx + abz * abz
      capR2[i] = r * r
      const x1 = c[0] + abx
      const z1 = c[1] + abz
      capMinX[i] = (c[0] < x1 ? c[0] : x1) - r
      capMaxX[i] = (c[0] > x1 ? c[0] : x1) + r
      capMinZ[i] = (c[1] < z1 ? c[1] : z1) - r
      capMaxZ[i] = (c[1] > z1 ? c[1] : z1) + r
    }
    uFore.value = fore ? 1 : 0
    const fPhi = ((foreA - 270) * Math.PI) / 180
    const fCos = Math.cos(fPhi)
    const fSin = Math.sin(fPhi)
    uForeCos.value = fCos
    uForeTan.value = Math.abs(fCos) > 1e-4 ? fSin / fCos : 0
    uForeReach.value = fCos > 0 ? Math.min(REACH_CAP, OCC * foreL * fCos) : 0
  }
  function paint(k0: number, k1: number, u: number) {
    const a = litColors[k0] ?? litColors[0]
    const b = litColors[k1] ?? a
    const c = shadeColors[k0] ?? shadeColors[0]
    const d = shadeColors[k1] ?? c
    if (a && b) uLit.value.copy(a).lerp(b, u)
    if (c && d) uShade.value.copy(c).lerp(d, u)
  }
  function syncVisual(t: number, wide: number, longday: number) {
    const wideMul = Math.pow(0.92, wide)
    if (pin >= 0) {
      const step = STEPS[pin] ?? STEPS[0]
      curK = pin
      curGlide = false
      curForecast = false
      curCount = 0
      curE = step?.e ?? 38
      const L = (step?.L ?? 1.28) * wideMul
      const a = step?.a ?? 252
      if (wide > 0) curE = (Math.atan(1 / L) * 180) / Math.PI
      publish(L, a, false, L, a)
      paint(pin, pin, 0)
      curL = L
      curA = a
      return
    }
    advanceSun(t, longday)
    const g = glideAt(t)
    curGlide = g >= 0
    curForecast = forecastOn(t)
    curCount = countdownTo(t)
    curK = g >= 0 ? (GLIDES[g]?.from ?? stepIndex(t)) : stepIndex(t)
    let base = heldL
    let a = azimuth(t)
    if (g >= 0) {
      const glide = GLIDES[g]
      const u = glide ? (t - glide.t0) / (glide.t1 - glide.t0) : 0
      paint(glide?.from ?? 0, glide?.to ?? 0, u)
    } else paint(curK, curK, 0)
    if (forceE != null && t >= forceUntil) forceE = null
    let L = base * wideMul
    curE = (Math.atan(1 / Math.max(0.05, L)) * 180) / Math.PI
    if (forceE != null) {
      curE = forceE
      L = 1 / Math.tan((forceE * Math.PI) / 180)
    }
    let foreL = L
    let foreA = a
    const fg = forecastOn(t) ? glideAt(Math.min(t + 5, 400)) : -1
    const look = fg >= 0 ? fg : g
    if (look >= 0) {
      const glide = GLIDES[look]
      if (glide) {
        const L0 = STEPS[glide.from]?.L ?? base
        const L1 = STEPS[glide.to]?.L ?? L0
        const from = glideKey === look ? glideFrom : heldL
        foreL = (from + (L1 - L0) * Math.pow(0.75, longday)) * wideMul
        foreA = STEPS[glide.to]?.a ?? a
      }
    }
    publish(L, a, curForecast, foreL, foreA)
    curL = L
    curA = a
  }
  function shadowed(x: number, z: number): boolean {
    const cosP = litCos
    const reach = litReach
    if (cosP > 0 && reach > 0) {
      for (let i = 0; i < 4; i++) {
        const dx = x - (EDGES[i] ?? 0)
        if (dx <= 0 || dx > reach) continue
        const z0 = z - dx * litTan
        if (onSolid(i, z0)) return true
      }
    }
    for (let i = 0; i < CAPS.length; i++) {
      if (x < capMinX[i]! || x > capMaxX[i]! || z < capMinZ[i]! || z > capMaxZ[i]!) continue
      const ab2 = capA2[i] ?? 0
      if (ab2 < 1e-8) continue
      const abx = capAx[i] ?? 0
      const abz = capAz[i] ?? 0
      const t = ((x - (capX[i] ?? 0)) * abx + (z - (capZ[i] ?? 0)) * abz) / ab2
      if (t < 0) continue
      const tc = t > 1 ? 1 : t
      const dx = x - ((capX[i] ?? 0) + abx * tc)
      const dz = z - ((capZ[i] ?? 0) + abz * tc)
      if (dx * dx + dz * dz <= (capR2[i] ?? 0)) return true
    }
    return false
  }
  function tileIndex(x: number, z: number): { ix: number; iz: number } | null {
    const ix = Math.floor((x + 24) / 2)
    const iz = Math.floor((z + 24) / 2)
    if (ix < 0 || iz < 0 || ix > 23 || iz > 23) return null
    return { ix, iz }
  }
  function writeByte(ix: number, iz: number, strength: number) {
    bytes[iz * 24 + ix] = Math.max(0, Math.min(255, Math.round(strength)))
    dirty = true
  }
  function findSeal(ix: number, iz: number): number {
    for (let i = 0; i < seals.length; i++) {
      const s = seals[i]
      if (s && s.ix === ix && s.iz === iz) return i
    }
    return -1
  }
  function noteUpload() {
    if (sim - lastUpload < 0.5 && lastUpload >= 0) return
    sealTex.needsUpdate = true
    dirty = false
    lastUpload = sim
    if (sim - upWindow >= 1) {
      if (upCount > upMax) upMax = upCount
      upCount = 0
      upWindow = sim
    }
    upCount++
    if (upCount > upMax) upMax = upCount
  }
  function addSeal(ix: number, iz: number) {
    const cx = -24 + ix * 2 + 1
    const cz = -24 + iz * 2 + 1
    const shade = shadowed(cx, cz) ? 1 : 0
    const at = findSeal(ix, iz)
    if (at >= 0) {
      const s = seals[at]
      if (!s) return
      s.strength = 255
      s.shade = shade
      writeByte(ix, iz, 255)
      return
    }
    if (seals.length >= 64) {
      let drop = 0
      let bestSun = 1e9
      let bestWeak = 1e9
      let weak = 0
      let sunlit = -1
      for (let i = 0; i < seals.length; i++) {
        const s = seals[i]
        if (!s) continue
        if (s.shade === 0 && s.born < bestSun) {
          bestSun = s.born
          sunlit = i
        }
        if (s.strength < bestWeak) {
          bestWeak = s.strength
          weak = i
        }
      }
      drop = sunlit >= 0 ? sunlit : weak
      const old = seals[drop]
      if (old) writeByte(old.ix, old.iz, 0)
      seals.splice(drop, 1)
    }
    seals.push({ ix, iz, strength: 255, shade, born: born++ })
    writeByte(ix, iz, 255)
  }
  function decay(dt: number) {
    decayAcc += dt
    let passes = 0
    while (decayAcc >= 0.5 && passes < 4) {
      decayAcc -= 0.5
      passes++
      decayPasses++
      const t0 = performance.now()
      for (let i = seals.length - 1; i >= 0; i--) {
        const s = seals[i]
        if (!s) continue
        const id = s.iz * 24 + s.ix
        if ((holdUntil[id] ?? 0) > sim) continue
        if (s.shade) {
          const next = s.strength - 2.125
          s.strength = next > 0 ? next : 0
          writeByte(s.ix, s.iz, s.strength)
          if (s.strength <= 0) seals.splice(i, 1)
        } else if (s.strength !== 255) {
          s.strength = 255
          writeByte(s.ix, s.iz, 255)
        }
      }
      decayMs += performance.now() - t0
    }
    if (curGlide) {
      shadeAcc += dt
      if (shadeAcc >= 0.2) {
        shadeAcc = 0
        for (let i = 0; i < seals.length; i++) {
          const s = seals[i]
          if (!s) continue
          const cx = -24 + s.ix * 2 + 1
          const cz = -24 + s.iz * 2 + 1
          s.shade = shadowed(cx, cz) ? 1 : 0
        }
      }
    } else if (shadeAcc !== 0) shadeAcc = 0
    if (dirty) noteUpload()
  }
  function fillSeals() {
    const want: { ix: number; iz: number }[] = []
    for (let i = 0; i < 4; i++) {
      const edge = EDGES[i] ?? 0
      for (let s = 1; s <= 4; s++) {
        const x = edge + s * 0.9
        for (let z = -22; z <= 22; z += 2) {
          if (!inside(x, z, 0.3)) continue
          const tile = tileIndex(x, z)
          if (tile) want.push(tile)
        }
      }
    }
    const step = Math.max(1, Math.floor(want.length / 48))
    for (let i = 0; i < want.length && seals.length < 48; i += step) {
      const tile = want[i]
      if (tile) addSeal(tile.ix, tile.iz)
    }
    for (let z = -8; z <= 8 && seals.length < 64; z += 2) {
      const tile = tileIndex(-4, z)
      if (tile && inside(-4, z, 0.3)) addSeal(tile.ix, tile.iz)
    }
    sealTex.needsUpdate = true
    dirty = false
    lastUpload = sim
    upCount = 1
    upMax = Math.max(upMax, 1)
    upWindow = sim
  }

  const planOut = {
    darter: 0,
    boss: false,
    rateMul: 1,
    houndFrom: 30,
    relocate(x: number, z: number, rng: Rng) {
      // Rings and packs inside the spear's 14 m reach get stepped out to 15.5 m.
      // A body dropped in her face is thrown away before it connects, and that
      // slowed the idle curve. The ordinary search below stays at 12 m.
      if (x !== 0 || z !== 0) {
        let sx = x
        let sz = z
        const asked = Math.hypot(sx - px, sz - pz) || 1
        if (asked < 15.5) {
          sx = px + ((x - px) / asked) * 15.5
          sz = pz + ((z - pz) / asked) * 15.5
        }
        if (Math.hypot(sx - px, sz - pz) >= 14 && Math.hypot(sx - px, sz - pz) < 48 && inside(sx, sz, 0.45)) {
          spot.x = sx
          spot.z = sz
          return spot
        }
      }
      const bias = x * 0 + z * 0
      const roll = rng()
      // Most of the early trickle stands on the open apron, just outside the
      // inner ring. The far niche was arriving one at a time, and seed 11 never
      // kept a mite in reach. The standing spear still clears a line; two sides
      // do not.
      if (roll < 0.8 && runT < 40) {
        const side = rng() < 0.5 ? 1 : -1
        const dist = 8.4 + rng() * 2.2
        let sx = px + (rng() - 0.5) * 2.4
        let sz = pz + side * dist
        if (sx > 21.6) sx = 21.6
        if (sx < -22.2) sx = -22.2
        if (sz > 22.4) sz = 22.4
        if (sz < -22.4) sz = -22.4
        if (inside(sx, sz, 0.45) && Math.hypot(sx - px, sz - pz) >= 7) {
          spot.x = sx
          spot.z = sz
          return spot
        }
      }
      for (let attempt = 0; attempt < 8; attempt++) {
        let sx = 0
        let sz = 0
        if (roll < 0.5) {
          if (rng() < 0.5) {
            sx = 18.4 + rng() * 3.2
            sz = rng() * 4 - 2
          } else {
            sx = 15.2 + rng() * 5.5
            sz = rng() < 0.5 ? -19.5 - rng() : 17 + rng() * 2.5
          }
        } else if (roll < 0.8) {
          const n = NICHES[Math.floor(rng() * NICHES.length)] ?? NICHES[0]
          sx = (n?.x ?? 18) + (rng() - 0.5)
          sz = n?.z ?? -21.6
        } else {
          sx = -22 + rng() * 44
          sz = -21 + rng() * 42
          if (Math.hypot(sx - camX, sz - camZ) < 20 && attempt < 6) continue
        }
        sx += bias
        if (Math.hypot(sx - px, sz - pz) < 12) continue
        if (!inside(sx, sz, 0.45)) continue
        spot.x = sx
        spot.z = sz
        return spot
      }
      let far = NICHES[0] ?? { x: 18, z: -21.6 }
      let best = -1
      for (let i = 0; i < NICHES.length; i++) {
        const n = NICHES[i]
        if (!n) continue
        const d = Math.hypot(n.x - px, n.z - pz)
        if (d > best && inside(n.x, n.z, 0.45)) {
          best = d
          far = n
        }
      }
      spot.x = far.x
      spot.z = far.z
      return spot
    },
  }

  function triCount(geo: BufferGeometry): number {
    if (geo.index) return geo.index.count / 3
    return geo.getAttribute('position').count / 3
  }

  const handle: StairHandle = {
    ready: false,
    async load() {
      if (handle.ready) return
      await loadNewel()
      handle.ready = true
    },
    apply() {
      pin = -1
      wantFill = false
      if (import.meta.env.DEV) {
        const q = new URLSearchParams(location.search)
        const sun = q.get('sun')
        if (sun != null && sun !== '') {
          const n = Number(sun)
          if (n >= 0 && n <= 5) pin = n
        }
        wantFill = q.get('seals') === 'fill'
      }
      for (let i = 0; i < opts.hide.length; i++) {
        const mesh = opts.hide[i]
        if (mesh) mesh.visible = false
      }
      floor.visible = true
      arch.visible = true
      if (newelRoot) newelRoot.visible = true
      opts.darter.material = lifted
      setStairCourt(true, body)
      seals.length = 0
      bytes.fill(0)
      holdUntil.fill(0)
      dirty = false
      decayAcc = 0
      shadeAcc = 0
      prevT = 0
      runT = 0
      heldL = STEPS[0]?.L ?? 1.28
      glideKey = -1
      glideFrom = heldL
      sim = 0
      lastUpload = -1
      upMax = 0
      upCount = 0
      upWindow = 0
      decayPasses = 0
      born = 1
      syncVisual(0, 0, 0)
      if (wantFill) fillSeals()
      else sealTex.needsUpdate = true
    },
    clear(restore) {
      floor.visible = false
      arch.visible = false
      if (newelRoot) newelRoot.visible = false
      opts.darter.material = opts.enemyMat
      setStairCourt(false, null)
      uMark.value.set(0, 0, 0)
      if (!restore) return
      for (let i = 0; i < opts.restore.length; i++) {
        const mesh = opts.restore[i]
        if (mesh) mesh.visible = true
      }
    },
    warm(renderer, camera) {
      const show = [floor.visible, arch.visible, newelRoot?.visible ?? false]
      floor.visible = true
      arch.visible = true
      if (newelRoot) newelRoot.visible = true
      const prev = uProbe.value
      uProbe.value = 0
      renderer.compile(floor, camera)
      renderer.compile(arch, camera)
      if (newelRoot) renderer.compile(newelRoot, camera)
      uProbe.value = 1
      renderer.compile(floor, camera)
      uProbe.value = prev
      floor.visible = show[0] ?? false
      arch.visible = show[1] ?? false
      if (newelRoot) newelRoot.visible = show[2] ?? false
    },
    tick(dt, time, wide, longday, ppx, ppz, cx, cz) {
      const t0 = performance.now()
      px = ppx
      pz = ppz
      camX = cx
      camZ = cz
      sim += dt
      runT = time
      uTime.value += dt
      syncVisual(time, wide, longday)
      decay(dt)
      tickMs += performance.now() - t0
      tickN++
    },
    place(time, wide, longday) {
      runT = time
      syncVisual(time, wide, longday)
    },
    floorY,
    isLit(x, z) {
      const ix = Math.floor((x + 24) / 2)
      const iz = Math.floor((z + 24) / 2)
      if (ix >= 0 && iz >= 0 && ix <= 23 && iz <= 23 && bytes[iz * 24 + ix]! > 0) return true
      return !shadowed(x, z)
    },
    guide(x, z, tx, tz) {
      const dx = tx - x
      const dz = tz - z
      const goal = Math.hypot(dx, dz)
      if (goal < 1.2) return null
      if (!lineBlocked(x, z, tx, tz, false)) return null
      const stepX = x + (dx / goal) * 1.3
      const stepZ = z + (dz / goal) * 1.3
      if (!lineBlocked(x, z, stepX, stepZ, false)) return null
      if (lineBlocked(x, z, tx, tz, true)) {
        let best = 1e9
        let gx = 0
        let gz = 0
        let found = false
        for (let i = 0; i < 4; i++) {
          const ex = EDGES[i] ?? 0
          // Far side is the crossing. Own side is the approach, so a body on the
          // jamb walks along the face into the opening instead of into the corner.
          // Lane sits inside the opening. gap.half - 0.55 parked the pack on the jamb.
          const throughX = x >= ex ? ex - 1.85 : ex + 1.5
          const ownX = x >= ex ? ex + 1.5 : ex - 1.85
          const nearWall = Math.abs(x - ex) < 2.3
          for (let g = 0; g < 3; g++) {
            const gap = gapOf(i, g)
            const toGoal = Math.hypot(tx - throughX, tz - gap.z)
            if (toGoal > goal - 0.4) continue
            const lane = Math.max(0.7, gap.half - 1.2)
            const aligned = Math.abs(z - gap.z) <= lane
            let destX = throughX
            let destZ = gap.z
            if (!aligned && nearWall) {
              const sign = z >= gap.z ? 1 : -1
              destX = ownX
              destZ = gap.z + sign * lane
            }
            const toMe = Math.hypot(destX - x, destZ - z)
            if (toMe < 0.2 || toMe >= best) continue
            best = toMe
            gx = destX
            gz = destZ
            found = true
          }
        }
        if (!found) return null
        steer.x = (gx - x) / best
        steer.z = (gz - z) / best
        return steer
      }
      let pick = -1
      let pickD = 1e9
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i]
        if (!c || !segCircle(x, z, tx, tz, c.x, c.z, c.r + 0.55)) continue
        const d = Math.hypot(c.x - x, c.z - z)
        if (d < pickD) {
          pickD = d
          pick = i
        }
      }
      const c = circles[pick]
      if (!c) return null
      const left = { x: -(z - c.z), z: x - c.x }
      const right = { x: z - c.z, z: -(x - c.x) }
      const use = left.x * dx + left.z * dz >= right.x * dx + right.z * dz ? left : right
      const len = Math.hypot(use.x, use.z) || 1
      steer.x = use.x / len
      steer.z = use.z / len
      return steer
    },
    plan(time) {
      planOut.darter = time < 90 ? 0 : 0.1 * Math.min(1, (time - 90) / 60)
      planOut.rateMul = time < 126 ? 1 : time < 186 ? 1.05 : time < 246 ? 1.05 ** 2 : time < 276 ? 1.05 ** 3 : 1.05 ** 4
      planOut.boss = false
      planOut.houndFrom = 30
      return planOut
    },
    sealAt(x, z) {
      if (!inside(x, z, 0.2)) return
      const tile = tileIndex(x, z)
      if (!tile) return
      const id = tile.iz * 24 + tile.ix
      if ((holdUntil[id] ?? 0) > sim) return
      addSeal(tile.ix, tile.iz)
    },
    sealBlock(tile, seconds) {
      if (tile < 0 || tile > 575) return
      holdUntil[tile] = sim + seconds
    },
    snuffSeal(tile) {
      if (tile < 0 || tile > 575) return
      const ix = tile % 24
      const iz = (tile / 24) | 0
      const at = findSeal(ix, iz)
      if (at >= 0) seals.splice(at, 1)
      writeByte(ix, iz, 0)
    },
    setSunElevation(e, glideSeconds) {
      forceE = e
      forceUntil = runT + glideSeconds
    },
    hud() {
      hudOut.elev = curE
      hudOut.countdown = curCount
      return hudOut
    },
    lightOffset() {
      const el = (curE * Math.PI) / 180
      const phi = ((curA - 270) * Math.PI) / 180
      const horiz = Math.cos(el) * 16
      aim.x = -Math.cos(phi) * horiz
      aim.y = Math.sin(el) * 16
      aim.z = -Math.sin(phi) * horiz
      return aim
    },
    agree(renderer, camera, points, hide) {
      const prevFloor = floor.visible
      const prevArch = arch.visible
      const prevNewel = newelRoot?.visible ?? false
      const prevHide = hide.map((mesh) => mesh.visible)
      floor.visible = true
      arch.visible = false
      if (newelRoot) newelRoot.visible = false
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = false
      }
      uProbe.value = 1
      camera.updateMatrixWorld()
      renderer.render(opts.scene as Scene, camera)
      const gl = renderer.getContext() as WebGL2RenderingContext
      renderer.getDrawingBufferSize(drawSize)
      let tested = 0
      let agreed = 0
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        ndc.set(point.x, floorY(point.x, point.z), point.z)
        ndc.project(camera)
        if (ndc.z < 0 || ndc.z > 1 || Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98) continue
        const sx = Math.min(drawSize.x - 1, Math.max(0, Math.floor((ndc.x * 0.5 + 0.5) * drawSize.x)))
        const sy = Math.min(drawSize.y - 1, Math.max(0, Math.floor((ndc.y * 0.5 + 0.5) * drawSize.y)))
        gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        const r = pixel[0] ?? 0
        const g = pixel[1] ?? 0
        const b = pixel[2] ?? 0
        const bright = r > 180 && g > 180 && b > 180
        const dark = r < 40 && g < 40 && b < 40
        if (!bright && !dark) continue
        tested++
        if (handle.isLit(point.x, point.z) === bright) agreed++
      }
      uProbe.value = 0
      floor.visible = prevFloor
      arch.visible = prevArch
      if (newelRoot) newelRoot.visible = prevNewel
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = prevHide[i] ?? false
      }
      return { tested, agree: agreed }
    },
    cover() {
      let n = 0
      let litN = 0
      for (let z = -23; z <= 23; z++) {
        for (let x = -23; x <= 23; x++) {
          if (!inside(x, z, 0)) continue
          n++
          if (handle.isLit(x, z)) litN++
        }
      }
      return {
        lit: n ? litN / n : 0,
        n,
        reach: uReach.value,
        stripe: PYLON_H * curL,
        e: curE,
        a: curA,
        L: curL,
        k: curK,
      }
    },
    sunInfo() {
      return {
        e: curE,
        a: curA,
        L: curL,
        glide: curGlide,
        forecast: curForecast,
        k: curK,
        countdown: curCount,
        reach: uReach.value,
        stripe: PYLON_H * curL,
      }
    },
    mixerTicks: () => mixerTicks,
    tris: () => ({ floor: triCount(floorGeo), arch: triCount(archGeo) }),
    cpu: () => ({ tick: tickN ? tickMs / tickN : 0, decay: decayPasses ? decayMs / decayPasses : 0, frames: tickN }),
    benchLit() {
      const t0 = performance.now()
      let n = 0
      for (let i = 0; i < 400; i++) {
        const x = -22 + (i % 20) * 2.2
        const z = -20 + ((i / 20) | 0) * 2.2
        if (handle.isLit(x, z)) n++
      }
      return { ms: performance.now() - t0, lit: n }
    },
    benchDecay() {
      const saved = new Float64Array(seals.length)
      for (let i = 0; i < seals.length; i++) saved[i] = seals[i]?.strength ?? 0
      const N = 200
      const t0 = performance.now()
      for (let n = 0; n < N; n++) {
        for (let i = seals.length - 1; i >= 0; i--) {
          const s = seals[i]
          if (!s) continue
          const id = s.iz * 24 + s.ix
          if ((holdUntil[id] ?? 0) > sim) continue
          if (s.shade) {
            const next = s.strength - 2.125
            s.strength = next > 0 ? next : 0
            writeByte(s.ix, s.iz, s.strength)
          } else if (s.strength !== 255) {
            s.strength = 255
            writeByte(s.ix, s.iz, 255)
          }
        }
      }
      const ms = (performance.now() - t0) / N
      for (let i = 0; i < seals.length; i++) {
        const s = seals[i]
        if (!s) continue
        s.strength = saved[i] ?? s.strength
        writeByte(s.ix, s.iz, s.strength)
      }
      return { ms, n: seals.length }
    },
    seals() {
      const hz = sim > 0.5 ? decayPasses / sim : 0
      return { n: seals.length, uploadMax: upMax, decayHz: hz, shadeGlideOnly: !shadeOutside, bytes }
    },
    mark(x, z, on) {
      uMark.value.set(x, z, on ? 1 : 0)
    },
    maskBuilds: () => maskBuilds,
  }

  syncVisual(0, 0, 0)
  return handle
}
