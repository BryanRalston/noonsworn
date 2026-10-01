import {
  CircleGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type Material,
  type Scene,
  Vector3,
  Vector4,
} from 'three'
import type { Rng } from '../core/rng'
import { TUNING } from '../data/tuning'
import { COLOR } from '../data/palette'
import { composeShell, sealGeometry } from './arena'
import {
  BEDS,
  PILLARS,
  cellBlocked,
  closeGates,
  gateOpen,
  bedRowsBetween,
  segmentBlocked,
  setGateOpen,
  trimPillars,
  type Pillar,
} from './collision'

export type WingKind = 'mirror' | 'slab' | 'spring' | 'reliquary'

export interface TemplePlate {
  kind: 'mirror' | 'slab' | 'spring' | 'altar'
  x: number
  z: number
  side: number
  ix: number
  iz: number
  boxX: number
  boxZ: number
  wing: number
}

export interface TempleSpawn {
  kind: 0 | 1
  x: number
  z: number
}

interface PillarSpot {
  x: number
  z: number
  r: number
  broken: boolean
  side: number
}

const HALF = TUNING.arena.size / 2
const CELL = 2
const N = 44
const ORIGIN = -TUNING.temple.outer
const CELLS = N * N

const blocked = new Uint8Array(CELLS)
const distA = new Uint16Array(CELLS)
const distB = new Uint16Array(CELLS)
const dirAX = new Int8Array(CELLS)
const dirAZ = new Int8Array(CELLS)
const dirBX = new Int8Array(CELLS)
const dirBZ = new Int8Array(CELLS)
const queue = new Int32Array(CELLS)
const steer = { x: 0, z: 0 }
const spot = { x: 0, z: 0 }

let readX = dirAX
let readZ = dirAZ
let writeX = dirBX
let writeZ = dirBZ
let writeDist = distB

const KINDS: Record<WingKind, { plates: Array<{ kind: TemplePlate['kind']; d: number; l: number }>; pillars: Array<{ d: number; l: number; r: number; broken: boolean }> }> = {
  mirror: {
    plates: [
      { kind: 'mirror', d: 6, l: -3.5 },
      { kind: 'mirror', d: 6, l: 3.5 },
    ],
    pillars: [
      { d: 14, l: -8, r: 1, broken: false },
      { d: 14, l: 8, r: 1, broken: false },
    ],
  },
  slab: {
    plates: [
      { kind: 'slab', d: 5, l: -6 },
      { kind: 'slab', d: 5, l: 0 },
      { kind: 'slab', d: 5, l: 6 },
    ],
    pillars: [
      { d: 16, l: -9, r: 1.2, broken: false },
      { d: 16, l: 9, r: 1.2, broken: false },
    ],
  },
  spring: {
    plates: [
      { kind: 'spring', d: 6, l: -4 },
      { kind: 'spring', d: 6, l: 4 },
    ],
    pillars: [{ d: 15, l: 0, r: 1.4, broken: true }],
  },
  reliquary: {
    plates: [
      { kind: 'altar', d: 6, l: 0 },
      { kind: 'mirror', d: 6, l: -6 },
    ],
    pillars: [
      { d: 15, l: -8, r: 1, broken: false },
      { d: 15, l: 7, r: 1, broken: false },
    ],
  },
}

function inward(side: number): { ix: number; iz: number } {
  if (side === 0) return { ix: 1, iz: 0 }
  if (side === 1) return { ix: 0, iz: 1 }
  if (side === 2) return { ix: -1, iz: 0 }
  return { ix: 0, iz: -1 }
}

export function toWorld(side: number, depth: number, lat: number): { x: number; z: number } {
  const b = inward(side)
  const px = -b.iz
  const pz = b.ix
  spot.x = b.ix * (HALF + depth) + px * lat
  spot.z = b.iz * (HALF + depth) + pz * lat
  return spot
}

function rollOrder(rng: Rng): WingKind[] {
  const first: WingKind = rng() < 0.5 ? 'mirror' : 'slab'
  const other: WingKind = first === 'mirror' ? 'slab' : 'mirror'
  const springFirst = rng() < 0.5
  rng()
  const second: WingKind = springFirst ? 'spring' : 'reliquary'
  const third: WingKind = springFirst ? 'reliquary' : 'spring'
  return [first, second, third, other]
}

function cellIndex(x: number, z: number): number {
  const ix = Math.floor((x - ORIGIN) / CELL)
  const iz = Math.floor((z - ORIGIN) / CELL)
  if (ix < 0 || iz < 0 || ix >= N || iz >= N) return -1
  return iz * N + ix
}

let blocksDirty = true

export function noteBlocks() {
  blocksDirty = true
}

export function writeFloorPillars(slots: Vector3[], n: { value: number }) {
  const count = Math.min(12, PILLARS.length)
  for (let i = 0; i < count; i++) {
    const p = PILLARS[i]
    const slot = slots[i]
    if (p && slot) slot.set(p.x, p.z, p.r)
  }
  for (let i = count; i < slots.length; i++) slots[i]?.set(0, 0, 0)
  n.value = count
}

export interface Temple {
  reset: (rng: Rng) => void
  update: (dt: number, runTime: number, sunTime: number, px: number, pz: number, frozen: boolean) => void
  mask: (out: Vector4) => void
  kinds: (out: Vector4) => void
  plates: TemplePlate[]
  takeSpawns: () => TempleSpawn[]
  guide: (x: number, z: number, px: number, pz: number) => { x: number; z: number } | null
  pickWing: (px: number, pz: number, rng: Rng, camX: number, camZ: number) => { x: number; z: number } | null
  flowMs: () => number
  arrow: () => { x: number; z: number } | null
  telegraph: () => boolean
  order: () => WingKind[]
  sides: () => number[]
  opened: () => number
  openTimes: () => number[]
  setRouting: (on: boolean) => void
  routing: () => boolean
  attach: (shell: Mesh, floor: Mesh, pillars: InstancedMesh, scene: Scene, material: Material) => void
  onRumble: (() => void) | null
}

export function createTemple(): Temple {
  const plates: TemplePlate[] = []
  const pillarSpots: PillarSpot[] = []
  const spawns: TempleSpawn[] = []
  const order: WingKind[] = ['mirror', 'slab', 'spring', 'reliquary']
  const sides = [0, 1, 2, 3]
  const openTimes = [-1, -1, -1, -1]
  let opened = 0
  let routingOn = false
  let told = false
  let arrowX = 0
  let arrowZ = 0
  let arrowT = 0
  let waveSide = 0
  let waveMites = 0
  let waveHounds = 0
  let waveAcc = 0
  let waveEvery = 1
  let waveRng: Rng = () => 0
  let flowAcc = 0
  let flowPhase = 0
  let flowHead = 0
  let flowTail = 0
  let flowBuild = 0
  let flowLast = 0
  let flowAnchor = -1
  let shell: Mesh | null = null
  let wingFloor: Mesh | null = null
  let pillarMesh: InstancedMesh | null = null
  let scene: Scene | null = null
  let material: Material | null = null
  let slider: Mesh | null = null
  let slideSide = -1
  let slideT = 0
  const glowMat = new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.95, depthWrite: false })
  const glow = new Mesh(new CircleGeometry(1.4, 16), glowMat)
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 1.35
  glow.visible = false
  const dummy = new Object3D()
  const closed = [true, true, true, true]

  function gatePoint(side: number): { x: number; z: number } {
    const b = inward(side)
    spot.x = b.ix * HALF
    spot.z = b.iz * HALF
    return spot
  }

  function rebuildShell() {
    if (!shell) return
    const next = composeShell(closed)
    shell.geometry.dispose()
    shell.geometry = next
  }

  function showPillars() {
    if (!pillarMesh) return
    let n = 0
    for (let i = 0; i < pillarSpots.length; i++) {
      const p = pillarSpots[i]
      if (!p || !gateOpen[p.side]) continue
      const yScale = p.broken ? 0.55 : 1
      dummy.position.set(p.x, 2.5 * yScale, p.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(p.r, yScale, p.r)
      dummy.updateMatrix()
      pillarMesh.setMatrixAt(n, dummy.matrix)
      n++
    }
    pillarMesh.count = n
    pillarMesh.visible = n > 0
    pillarMesh.instanceMatrix.needsUpdate = true
  }

  function addWing(index: number) {
    const side = sides[index] ?? 0
    const kind = order[index] ?? 'mirror'
    const kit = KINDS[kind]
    for (let i = 0; i < kit.pillars.length; i++) {
      const src = kit.pillars[i]
      if (!src) continue
      const at = toWorld(side, src.d, src.l)
      const pillar: Pillar = { x: at.x, z: at.z, r: src.r, wing: side }
      PILLARS.push(pillar)
      pillarSpots.push({ x: at.x, z: at.z, r: src.r, broken: src.broken, side })
    }
    setGateOpen(side, true)
    closed[side] = false
    rebuildShell()
    showPillars()
    blocksDirty = true
    if (scene && material) {
      if (slider) scene.remove(slider)
      slider = new Mesh(sealGeometry(side), material)
      slider.position.y = 0
      scene.add(slider)
      slideSide = side
      slideT = 0
    }
    const gp = gatePoint(side)
    arrowX = gp.x
    arrowZ = gp.z
    arrowT = TUNING.temple.arrow
    waveSide = side
    waveMites = TUNING.temple.waveMites
    waveHounds = 1 + index
    waveAcc = 0
    waveEvery = TUNING.temple.waveTime / Math.max(1, waveMites + waveHounds)
    openTimes[index] = -2
  }

  function placePlates() {
    plates.length = 0
    pillarSpots.length = 0
    for (let wing = 0; wing < 4; wing++) {
      const side = sides[wing] ?? 0
      const kind = order[wing] ?? 'mirror'
      const kit = KINDS[kind]
      const b = inward(side)
      for (let i = 0; i < kit.plates.length; i++) {
        const src = kit.plates[i]
        if (!src) continue
        const at = toWorld(side, src.d, src.l)
        const px = at.x
        const pz = at.z
        const box = toWorld(side, src.d + 4.5, src.l)
        plates.push({
          kind: src.kind,
          x: px,
          z: pz,
          side,
          ix: b.ix,
          iz: b.iz,
          boxX: box.x,
          boxZ: box.z,
          wing,
        })
      }
    }
  }

  function rebuildBlocked() {
    for (let i = 0; i < CELLS; i++) {
      const ix = i % N
      const iz = (i / N) | 0
      const x = ORIGIN + (ix + 0.5) * CELL
      const z = ORIGIN + (iz + 0.5) * CELL
      blocked[i] = cellBlocked(x, z) ? 1 : 0
    }
    blocksDirty = false
  }

  function kickFlow(px: number, pz: number) {
    writeDist.fill(65535)
    writeX.fill(0)
    writeZ.fill(0)
    let start = cellIndex(px, pz)
    if (start < 0 || blocked[start]) {
      start = -1
      let best = 1e9
      for (let i = 0; i < CELLS; i++) {
        if (blocked[i]) continue
        const ix = i % N
        const iz = (i / N) | 0
        const dx = ORIGIN + (ix + 0.5) * CELL - px
        const dz = ORIGIN + (iz + 0.5) * CELL - pz
        const d = dx * dx + dz * dz
        if (d < best) {
          best = d
          start = i
        }
      }
    }
    if (start < 0) {
      flowPhase = 0
      return
    }
    writeDist[start] = 0
    queue[0] = start
    flowHead = 0
    flowTail = 1
    flowPhase = 1
    flowBuild = 0
  }

  function stepFlow() {
    const t0 = performance.now()
    const dist = writeDist
    const bx = writeX
    const bz = writeZ
    const wall = blocked
    let n = 0
    let head = flowHead
    let tail = flowTail
    while (head < tail && n < 4200) {
      const c = queue[head] ?? 0
      head++
      const cx = c % N
      const cz = (c / N) | 0
      const cd = dist[c] ?? 65535
      const next = cd + 1
      if (cx + 1 < N) {
        const ni = c + 1
        if (!wall[ni] && (dist[ni] ?? 65535) > next) {
          dist[ni] = next
          bx[ni] = -1
          bz[ni] = 0
          queue[tail++] = ni
        }
      }
      if (cx > 0) {
        const ni = c - 1
        if (!wall[ni] && (dist[ni] ?? 65535) > next) {
          dist[ni] = next
          bx[ni] = 1
          bz[ni] = 0
          queue[tail++] = ni
        }
      }
      if (cz + 1 < N) {
        const ni = c + N
        if (!wall[ni] && (dist[ni] ?? 65535) > next) {
          dist[ni] = next
          bx[ni] = 0
          bz[ni] = -1
          queue[tail++] = ni
        }
      }
      if (cz > 0) {
        const ni = c - N
        if (!wall[ni] && (dist[ni] ?? 65535) > next) {
          dist[ni] = next
          bx[ni] = 0
          bz[ni] = 1
          queue[tail++] = ni
        }
      }
      n++
    }
    flowHead = head
    flowTail = tail
    flowBuild += performance.now() - t0
    if (flowHead >= flowTail) {
      const sx = readX
      const sz = readZ
      readX = writeX
      readZ = writeZ
      writeX = sx
      writeZ = sz
      const sd = writeDist
      writeDist = sd === distA ? distB : distA
      flowPhase = 0
      flowLast = flowBuild
    }
  }

  function pour(dt: number) {
    if (waveMites + waveHounds <= 0) return
    waveAcc += dt
    let guard = 0
    while (waveAcc >= waveEvery && waveMites + waveHounds > 0 && guard++ < 8) {
      waveAcc -= waveEvery
      const hound = waveHounds > 0 && (waveMites === 0 || waveRng() < waveHounds / (waveMites + waveHounds))
      if (hound) waveHounds--
      else waveMites--
      const depth = 3 + waveRng() * 6
      const lat = (waveRng() * 2 - 1) * 3
      const at = toWorld(waveSide, depth, lat)
      spawns.push({ kind: hound ? 1 : 0, x: at.x, z: at.z })
    }
  }

  const temple: Temple = {
    plates,
    onRumble: null,
    attach(nextShell, floor, pillars, nextScene, mat) {
      shell = nextShell
      wingFloor = floor
      pillarMesh = pillars
      scene = nextScene
      material = mat
      floor.visible = false
      pillars.visible = false
      pillars.count = 0
      if (!glow.parent) nextScene.add(glow)
    },
    reset(rng) {
      waveRng = rng
      order[0] = 'mirror'
      order[1] = 'slab'
      order[2] = 'spring'
      order[3] = 'reliquary'
      const rolled = rollOrder(rng)
      for (let i = 0; i < 4; i++) order[i] = rolled[i] ?? 'mirror'
      sides[0] = 0
      sides[1] = 1
      sides[2] = 2
      sides[3] = 3
      for (let i = 3; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0
        const swap = sides[i] ?? 0
        sides[i] = sides[j] ?? 0
        sides[j] = swap
      }
      opened = 0
      told = false
      arrowT = 0
      waveMites = 0
      waveHounds = 0
      slideSide = -1
      slideT = 0
      flowPhase = 0
      flowAcc = 0
      flowLast = 0
      flowAnchor = -1
      openTimes[0] = -1
      openTimes[1] = -1
      openTimes[2] = -1
      openTimes[3] = -1
      closed[0] = true
      closed[1] = true
      closed[2] = true
      closed[3] = true
      trimPillars()
      closeGates()
      placePlates()
      rebuildShell()
      showPillars()
      if (wingFloor) wingFloor.visible = false
      glow.visible = false
      if (slider && scene) scene.remove(slider)
      slider = null
      spawns.length = 0
      blocksDirty = true
      readX.fill(0)
      readZ.fill(0)
    },
    update(dt, runTime, sunTime, px, pz, frozen) {
      if (slideSide >= 0 && slider) {
        slideT += dt
        const u = Math.min(1, slideT / TUNING.temple.slide)
        slider.position.y = -2.2 * u
        if (u >= 1 && scene) {
          scene.remove(slider)
          slider = null
          slideSide = -1
        }
      }
      if (!routingOn) {
      const next = opened
      if (next < 4) {
        const sunDue = (next + 1) * TUNING.daySeconds
        const cap = TUNING.temple.capReal - (3 - next) * 8
        const lead = TUNING.temple.telegraph
        const soon = (sunTime >= sunDue - lead - 1e-3 && sunTime < sunDue) || (runTime >= cap - lead - 1e-3 && runTime < cap && sunTime < sunDue)
        if (soon && !told) {
          told = true
          const gp = gatePoint(sides[next] ?? 0)
          arrowX = gp.x
          arrowZ = gp.z
          arrowT = TUNING.temple.arrow
          temple.onRumble?.()
          glow.visible = true
          glow.position.x = gp.x
          glow.position.z = gp.z
          if (wingFloor) wingFloor.visible = true
        }
        if (!soon && opened === next && sunTime < sunDue - lead - 1e-3 && runTime < cap - lead - 1e-3) told = false
        const due = sunTime >= sunDue - 1e-3 || (!frozen && runTime >= cap)
        if (due) {
          const at = runTime
          addWing(next)
          openTimes[next] = at
          opened = next + 1
          told = false
          glow.visible = false
          if (wingFloor) wingFloor.visible = true
        }
      }
      }
      if (arrowT > 0) arrowT -= dt
      pour(dt)
      if (opened === 0 && (!routingOn || BEDS.length === 0)) return
      const flowDirty = blocksDirty
      if (blocksDirty) rebuildBlocked()
      flowAcc += dt
      if (flowPhase === 0 && flowAcc >= 1 / TUNING.temple.flowHz) {
        flowAcc = 0
        const cell = cellIndex(px, pz)
        if (flowDirty || cell !== flowAnchor) {
          kickFlow(px, pz)
          flowAnchor = cell
        }
      }
      if (flowPhase === 1) stepFlow()
    },
    takeSpawns() {
      if (spawns.length === 0) return spawns
      const out = spawns.slice()
      spawns.length = 0
      return out
    },
    guide(x, z, px, pz) {
      if (opened === 0 && !routingOn) return null
      const dx = px - x
      const dz = pz - z
      const dist = Math.hypot(dx, dz)
      if (BEDS.length === 0) {
        if (dist <= TUNING.temple.flowNear) return null
        if (!segmentBlocked(x, z, px, pz)) return null
      } else {
        if (dist <= 1.25) return null
        const court = Math.abs(x) < 22 && Math.abs(px) < 22 && Math.abs(z) < 14 && Math.abs(pz) < 14
        if (court && !bedRowsBetween(z, pz)) return null
        if (!segmentBlocked(x, z, px, pz)) return null
      }
      const c = cellIndex(x, z)
      if (c < 0) return null
      const sx = readX[c] ?? 0
      const sz = readZ[c] ?? 0
      if (sx === 0 && sz === 0) return null
      steer.x = sx
      steer.z = sz
      return steer
    },
    pickWing(px, pz, rng, camX, camZ) {
      if (opened === 0) return null
      const cdx = camX - px
      const cdz = camZ - pz
      const cl = Math.hypot(cdx, cdz) || 1
      const fx = cdx / cl
      const fz = cdz / cl
      let bestX = 0
      let bestZ = 0
      let best = 1e9
      let found = false
      for (let n = 0; n < 10; n++) {
        const wing = (rng() * opened) | 0
        const side = sides[wing] ?? 0
        const depth = 2 + rng() * (TUNING.temple.wingD - 4)
        const lat = (rng() * 2 - 1) * (TUNING.temple.wingW / 2 - 2)
        const at = toWorld(side, depth, lat)
        const dx = at.x - px
        const dz = at.z - pz
        const d = Math.hypot(dx, dz)
        if (d < TUNING.spawnNear || d > TUNING.spawnFar) continue
        if (cellBlocked(at.x, at.z)) continue
        let score = 0
        const dl = d || 1
        if ((dx / dl) * fx + (dz / dl) * fz > 0.15) score += 6
        if (score < best) {
          best = score
          bestX = at.x
          bestZ = at.z
          found = true
        }
      }
      if (!found) return null
      spot.x = bestX
      spot.z = bestZ
      return spot
    },
    flowMs: () => flowLast,
    arrow: () => (arrowT > 0 ? { x: arrowX, z: arrowZ } : null),
    telegraph: () => glow.visible,
    order: () => order.slice() as WingKind[],
    sides: () => sides.slice(),
    opened: () => opened,
    openTimes: () => openTimes.slice(),
    setRouting(on: boolean) {
      routingOn = on
      blocksDirty = true
    },
    routing: () => routingOn || opened > 0,
    mask(out) {
      out.set(0, 0, 0, 0)
      for (let i = 0; i < opened; i++) {
        const side = sides[i] ?? 0
        if (side === 0) out.x = 1
        else if (side === 1) out.y = 1
        else if (side === 2) out.z = 1
        else out.w = 1
      }
      if (glow.visible && opened < 4) {
        const side = sides[opened] ?? 0
        if (side === 0) out.x = 1
        else if (side === 1) out.y = 1
        else if (side === 2) out.z = 1
        else out.w = 1
      }
    },
    kinds(out) {
      for (let i = 0; i < 4; i++) {
        const side = sides[i] ?? 0
        const name = order[i] ?? 'mirror'
        const code = name === 'slab' ? 1 : name === 'spring' ? 2 : name === 'reliquary' ? 3 : 0
        if (side === 0) out.x = code
        else if (side === 1) out.y = code
        else if (side === 2) out.z = code
        else out.w = code
      }
    },
  }

  return temple
}
