import { TUNING, type TierName } from '../../data/tuning'
import { detectMobile } from '../../render/quality'
import { FreeList } from '../../core/pool'
import { hashQuery } from '../spatialHash'
import { insideArena, resolveCircle } from '../collision'
import { yawFromDirection } from '../../core/math'
import { hasteMul } from '../sunClock'
import type { ShadowDir } from '../shadowDir'
import type { Horde, HordeCtx } from '../enemies/horde'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import type { WeaponFx } from './fx'
import { spearStats } from './sunspear'
import { haloStats } from './halo'
import { flareStats } from './flare'
import { bellStats } from './bell'
import { probePut, rimAt, ringLocal, ringRims, spinRims } from './probe'
import {
  addEvoCpu,
  dayburstFlash,
  evoDriving,
  evoHeal,
  evoOn,
  evoSee,
  markEvoLive,
  publishEvo,
  setEvoLights,
  type EvoRead,
} from './evoHook'

function strike(horde: Horde, index: number, amount: number, might: number, ctx: HordeCtx, hold = 0, dirX = 0, dirZ = 0): number {
  const hit = horde.damage(index, amount, 'weapon', might, false, dirX, dirZ)
  if (hit > 0 && hold > 0) horde.hold(index, hold)
  if (hit === 2) horde.slay(index, ctx)
  return hit
}

const Q = new Int16Array(160)
const STREAK_RGB: [number, number, number] = [1.033, 0.249, 0]
const DOG_X = [0, 0]
const DOG_Z = [0, 0]
const LANCE_RIM: readonly (readonly [number, number, number])[] = [
  [0.27, 0.14, 0.2], [-0.27, 0.14, 0.2], [0.27, 0.14, -0.3], [-0.27, 0.14, -0.3],
  [0.27, 0.14, -0.7], [-0.27, 0.14, -0.7], [0.27, 0.14, 0.4], [-0.27, 0.14, 0.4],
]
const LANCE_BESIDE: readonly (readonly [number, number, number])[] = [[0.42, 0, 0.2]]
const OBELISK_RIM: readonly (readonly [number, number, number])[] = [
  [0.22, 1.2, 0.22], [-0.22, 1.2, 0.22], [0.22, 1.2, -0.22], [-0.22, 1.2, -0.22],
  [0.34, 2.6, 0.34], [-0.34, 2.6, 0.34], [0.34, 2.6, -0.34], [-0.34, 2.6, -0.34],
]
const LEAD = { x: 0, z: 0 }
const SHADE: ShadowDir = { dirX: 0, dirZ: 1, length: 6 }
const ROW = TUNING.evo
const G = 16
const CELL = 4
const BUCKET = 4
const heads = new Int16Array(G * G * BUCKET)
const gcount = new Uint8Array(G * G)

interface Light {
  kind: 1 | 2 | 3
  x: number
  z: number
  x2: number
  z2: number
  r: number
  x3: number
  z3: number
}

const lights: Light[] = []
let lightN = 0

function lightReset() {
  lightN = 0
}

function pushLight(kind: Light['kind'], x: number, z: number, x2: number, z2: number, r: number, x3 = 0, z3 = 0) {
  if (lightN >= 28) return
  const at = lights[lightN]
  if (at) {
    at.kind = kind
    at.x = x
    at.z = z
    at.x2 = x2
    at.z2 = z2
    at.r = r
    at.x3 = x3
    at.z3 = z3
  } else lights.push({ kind, x, z, x2, z2, r, x3, z3 })
  lightN++
}

function cellAt(x: number, z: number): number {
  let cx = ((x + 32) / CELL) | 0
  let cz = ((z + 32) / CELL) | 0
  if (cx < 0) cx = 0
  else if (cx >= G) cx = G - 1
  if (cz < 0) cz = 0
  else if (cz >= G) cz = G - 1
  return cz * G + cx
}

function stamp(id: number, x: number, z: number) {
  const c = cellAt(x, z)
  const n = gcount[c] ?? 0
  if (n >= BUCKET) return
  heads[c * BUCKET + n] = id
  gcount[c] = n + 1
}

function rebuildGrid() {
  gcount.fill(0)
  for (let i = 0; i < lightN; i++) {
    const L = lights[i]
    if (!L) continue
    if (L.kind === 1) {
      const steps = Math.max(1, Math.ceil((L.r * 2) / CELL))
      for (let iz = -steps; iz <= steps; iz++) {
        for (let ix = -steps; ix <= steps; ix++) stamp(i, L.x + ix * CELL, L.z + iz * CELL)
      }
    } else if (L.kind === 3) {
      const minX = Math.min(L.x, L.x2, L.x3)
      const maxX = Math.max(L.x, L.x2, L.x3)
      const minZ = Math.min(L.z, L.z2, L.z3)
      const maxZ = Math.max(L.z, L.z2, L.z3)
      const x0 = Math.floor((minX + 32) / CELL) * CELL - 32
      const z0 = Math.floor((minZ + 32) / CELL) * CELL - 32
      for (let z = z0; z <= maxZ + 0.01; z += CELL) {
        for (let x = x0; x <= maxX + 0.01; x += CELL) stamp(i, x + CELL * 0.5, z + CELL * 0.5)
      }
    } else {
      const steps = 4
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        stamp(i, L.x + (L.x2 - L.x) * t, L.z + (L.z2 - L.z) * t)
      }
    }
  }
}

function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const abx = bx - ax
  const abz = bz - az
  const ab2 = abx * abx + abz * abz
  let t = 0
  if (ab2 > 1e-8) t = ((px - ax) * abx + (pz - az) * abz) / ab2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const dx = ax + (bx - ax) * t - px
  const dz = az + (bz - az) * t - pz
  return dx * dx + dz * dz
}

function triHit(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  const c1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  const c2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx)
  const c3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx)
  return (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0)
}

function lightAt(x: number, z: number): boolean {
  const c = cellAt(x, z)
  const n = gcount[c] ?? 0
  for (let i = 0; i < n; i++) {
    const id = heads[c * BUCKET + i] ?? -1
    const L = id >= 0 ? lights[id] : undefined
    if (!L) continue
    if (L.kind === 1) {
      const dx = x - L.x
      const dz = z - L.z
      if (dx * dx + dz * dz <= L.r * L.r) return true
    } else if (L.kind === 2) {
      if (segDist2(L.x, L.z, L.x2, L.z2, x, z) <= L.r * L.r) return true
    } else if (triHit(x, z, L.x, L.z, L.x2, L.z2, L.x3, L.z3)) return true
  }
  return false
}

let triAx = 0
let triAz = 0
let triBx = 0
let triBz = 0
let triCx = 0
let triCz = 0

function pushTri(pos: number[], col: number[], em: number[], a: number[], b: number[], c: number[], color: number[], edge: number) {
  pos.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0)
  col.push(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[0] ?? 0, color[1] ?? 0, color[2] ?? 0)
  em.push(edge, edge, edge)
}

function quad(pos: number[], col: number[], em: number[], a: number[], b: number[], c: number[], d: number[], color: number[], edge: number) {
  pushTri(pos, col, em, a, b, c, color, edge)
  pushTri(pos, col, em, a, c, d, color, edge)
}

function pack(pos: number[], col: number[], em: number[]) {
  return { position: new Float32Array(pos), color: new Float32Array(col), emit: new Float32Array(em) }
}

function obeliskPart() {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const gold = [1.033, 0.249, 0]
  const bronze = [0.03, 0.016, 0]
  const s = 0.22
  quad(pos, col, em, [-s, 0, -s], [s, 0, -s], [s, 2.45, -s], [-s, 2.45, -s], bronze, 0)
  quad(pos, col, em, [s, 0, -s], [s, 0, s], [s, 2.45, s], [s, 2.45, -s], bronze, 0)
  quad(pos, col, em, [s, 0, s], [-s, 0, s], [-s, 2.45, s], [s, 2.45, s], bronze, 0)
  quad(pos, col, em, [-s, 0, s], [-s, 0, -s], [-s, 2.45, -s], [-s, 2.45, s], bronze, 0)
  quad(pos, col, em, [-0.34, 2.45, -0.34], [0.34, 2.45, -0.34], [0.34, 2.8, 0.34], [-0.34, 2.8, 0.34], gold, 1)
  quad(pos, col, em, [-0.34, 0, -0.34], [0.34, 0, -0.34], [0.34, 0.12, 0.34], [-0.34, 0.12, 0.34], gold, 0.4)
  return pack(pos, col, em)
}

function sunballPart() {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const gold = [1.033, 0.249, 0]
  const bronze = [0.03, 0.016, 0]
  const n = 8
  const r = 0.8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const x0 = Math.cos(a0) * r
    const z0 = Math.sin(a0) * r
    const x1 = Math.cos(a1) * r
    const z1 = Math.sin(a1) * r
    pushTri(pos, col, em, [0, r * 0.85, 0], [x0, 0, z0], [x1, 0, z1], gold, 1)
    pushTri(pos, col, em, [0, -r * 0.7, 0], [x1, 0, z1], [x0, 0, z0], bronze, 0)
    // Flat ring above the dome. A side lip is hidden under the gold from the pitched camera.
    const inR = 0.22
    const outR = 0.55
    const top = 0.74
    quad(
      pos, col, em,
      [Math.cos(a0) * inR, top, Math.sin(a0) * inR],
      [Math.cos(a0) * outR, top, Math.sin(a0) * outR],
      [Math.cos(a1) * outR, top, Math.sin(a1) * outR],
      [Math.cos(a1) * inR, top, Math.sin(a1) * inR],
      bronze, 0,
    )
  }
  return pack(pos, col, em)
}

function tonguePart() {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const bronze = [0.03, 0.016, 0]
  const gold = [1.033, 0.249, 0]
  const n = 8
  const inR = 1.05
  const outR = 1.55
  const y = 0.16
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    pushTri(
      pos, col, em,
      [0, 0.22, 0],
      [Math.cos(a0) * 0.7, 0.22, Math.sin(a0) * 0.7],
      [Math.cos(a1) * 0.7, 0.22, Math.sin(a1) * 0.7],
      gold, 1,
    )
  }
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    quad(
      pos, col, em,
      [Math.cos(a0) * inR, y, Math.sin(a0) * inR],
      [Math.cos(a0) * outR, y, Math.sin(a0) * outR],
      [Math.cos(a1) * outR, y, Math.sin(a1) * outR],
      [Math.cos(a1) * inR, y, Math.sin(a1) * inR],
      bronze, 0,
    )
  }
  return pack(pos, col, em)
}

function due(last: Float32Array, slot: number, time: number, gap: number): boolean {
  if (time - (last[slot] ?? -10) < gap) return false
  last[slot] = time
  return true
}

function bossTouch(horde: Horde, x: number, z: number, radius: number, base: number, might: number, scale: number, stamp: number): boolean {
  const boss = horde.bossAt
  if (!boss) return false
  const dx = boss.x - x
  const dz = boss.z - z
  if (dx * dx + dz * dz > (radius + boss.r) * (radius + boss.r)) return false
  return !!horde.bossHit?.(x, z, radius, base * scale, 'weapon', might, stamp)
}

export function attachEvolve(fx: WeaponFx, arsenal: Arsenal) {
  const ob = obeliskPart()
  const ball = sunballPart()
  const tongue = tonguePart()
  arsenal.append(ARSENAL_PART.obelisk, ob.position, ob.color, ob.emit)
  arsenal.append(ARSENAL_PART.sunball, ball.position, ball.color, ball.emit)
  arsenal.append(ARSENAL_PART.tongue, tongue.position, tongue.color, tongue.emit)
  markEvoLive(true)
  setEvoLights(lightAt)

  const lanceN = 24
  const lfree = new FreeList(lanceN)
  const lx = new Float32Array(lanceN)
  const lz = new Float32Array(lanceN)
  const lvx = new Float32Array(lanceN)
  const lvz = new Float32Array(lanceN)
  const llife = new Float32Array(lanceN)
  const lalive = new Uint8Array(lanceN)
  const lbig = new Uint8Array(lanceN)
  const lboss = new Uint8Array(lanceN)
  const lnoted = new Uint8Array(lanceN)
  let lanceThrows = 0
  let lanceConnects = 0
  const ldmg = new Float32Array(lanceN)
  const hitStride = Math.ceil(TUNING.hordeCap / 8)
  const hitBits = new Uint8Array(lanceN * hitStride)
  let volley = 0
  let fanCount = 0
  let fanSpan = 0
  let bigCount = 0
  let spearCd = 0.2
  let stamp = 91000
  let bladeLen = 6

  let burstCd = 0
  let coronaRay = 0
  let burstCount = 0
  const coronaAt = new Float32Array(TUNING.hordeCap)
  const knockAt = new Float32Array(TUNING.hordeCap)
  coronaAt.fill(-10)
  knockAt.fill(-10)
  let coronaBoss = -10

  let novaCd = ROW.dayburst.every
  let tongueIn = -1
  let tongueCount = 0
  let novaAt = 0
  const tongueX = new Float32Array(8)
  const tongueZ = new Float32Array(8)
  const tongueLife = new Float32Array(8)
  const spotsX = new Float32Array(12)
  const spotsZ = new Float32Array(12)
  const spotsLife = new Float32Array(12)
  let spotN = 0

  let bellCd = ROW.twelvefold.every
  let tolling = false
  let tollN = 0
  let tollGap = 0
  let tollR = 2
  let dazed = 0
  let healed = 0
  const tollAt = new Float32Array(TUNING.hordeCap)
  tollAt.fill(-10)

  let chainCd = 0
  let solarBossCd = 0
  let retarget = 0
  let chainN = 0
  const chainS = new Int16Array(3)
  chainS.fill(-1)
  let bank = 0
  let bankAcc = 0
  let spendCd = 0
  const mirrorA = new Float32Array(3)

  let roll = 0
  let ballHits = 0
  const ballAt = new Float32Array(TUNING.hordeCap)
  ballAt.fill(-10)
  let ballBoss = -10
  const tailX = new Float32Array(3)
  const tailZ = new Float32Array(3)
  const tailAge = new Float32Array(3)
  tailAge.fill(10)

  const obN = 4
  const ox = new Float32Array(obN)
  const oz = new Float32Array(obN)
  const oLife = new Float32Array(obN)
  const oAng = new Float32Array(obN)
  const oAlive = new Uint8Array(obN)
  const obBoss = new Float32Array(obN)
  obBoss.fill(-10)
  let plantCd = 0.6
  let plantN = 0
  let fenceN = 0
  let pulseCd = 0.4
  const obAt = new Float32Array(TUNING.hordeCap)
  const fenceAt = new Float32Array(TUNING.hordeCap)
  obAt.fill(-10)
  fenceAt.fill(-10)

  const prismN = 32
  const pfree = new FreeList(prismN)
  const pxA = new Float32Array(prismN)
  const pzA = new Float32Array(prismN)
  const pvx = new Float32Array(prismN)
  const pvz = new Float32Array(prismN)
  const pAlive = new Uint8Array(prismN)
  const pLit = new Uint8Array(prismN)
  const pLitAt = new Float32Array(prismN)
  const pWasDog = new Uint8Array(prismN)
  const pVolley = new Int16Array(prismN)
  let prismCd = 0.2
  let runLeft = 0
  let lastPx = 0
  let lastPz = 0
  let haveFoot = false
  let volleyId = 1
  let prismMax = 0
  let dogCount = 0

  const read: EvoRead = {
    meridianVolley: 0, meridianFan: 0, meridianSpan: 0, meridianBig: 0, meridianThrows: 0, meridianConnects: 0,
    coronaR: 0, coronaBurst: 0, dayburstAt: 0, tongues: 0, spots: 0,
    tolls: 0, tollR: 0, dazed: 0, healed: 0, mirrors: 0, chain: 0,
    ballHits: 0, obelisks: 0, fences: 0, prismAlive: 0, prismMax: 0, dogs: 0,
    bossScales: {
      spear: ROW.meridian.boss, halo: ROW.corona.boss, flare: ROW.dayburst.boss, bell: ROW.twelvefold.boss,
      helio: ROW.solar.boss, scarab: ROW.sunroller.boss, stake: ROW.obelisk.boss, prism: ROW.mocksun.boss,
    },
  }

  function launch(x: number, z: number, ang: number, speed: number, life: number, damage: number, big: number) {
    const i = lfree.acquire()
    if (i < 0) return
    lalive[i] = 1
    lx[i] = x
    lz[i] = z
    lvx[i] = Math.cos(ang) * speed
    lvz[i] = Math.sin(ang) * speed
    llife[i] = life
    ldmg[i] = damage
    lbig[i] = big
    lboss[i] = 0
    lnoted[i] = 0
    lanceThrows++
    hitBits.fill(0, i * hitStride, (i + 1) * hitStride)
  }

  function seen(i: number, slot: number): boolean {
    if (slot < 0 || slot >= TUNING.hordeCap) return true
    const byte = i * hitStride + (slot >> 3)
    const mask = 1 << (slot & 7)
    if ((hitBits[byte] ?? 0) & mask) return true
    hitBits[byte] = (hitBits[byte] ?? 0) | mask
    return false
  }

  function aimFan(px: number, pz: number, horde: Horde, might: number) {
    const stats = spearStats(5)
    const boss = horde.bossAt
    let ax = 1
    let az = 0
    if (boss && (horde.bossLock || Math.hypot(boss.x - px, boss.z - pz) < 16)) {
      ax = boss.x - px
      az = boss.z - pz
    } else {
      const n = hashQuery(px, pz, 14, Q)
      let best = 1e9
      for (let k = 0; k < n; k++) {
        const s = Q[k] ?? -1
        if (s < 0 || !horde.living(s)) continue
        const dx = (horde.x[s] ?? 0) - px
        const dz = (horde.z[s] ?? 0) - pz
        const d2 = dx * dx + dz * dz
        if (d2 < best) {
          best = d2
          ax = dx
          az = dz
        }
      }
    }
    const base = Math.atan2(az, ax)
    const half = (ROW.meridian.fan * Math.PI) / 360
    const picks: number[] = []
    const found = hashQuery(px, pz, 14, Q)
    for (let k = 0; k < found && picks.length < ROW.meridian.count; k++) {
      const s = Q[k] ?? -1
      if (s < 0 || !horde.living(s) || picks.indexOf(s) >= 0) continue
      const dx = (horde.x[s] ?? 0) - px
      const dz = (horde.z[s] ?? 0) - pz
      let da = Math.atan2(dz, dx) - base
      if (da > Math.PI) da -= Math.PI * 2
      if (da < -Math.PI) da += Math.PI * 2
      if (Math.abs(da) <= half + 0.02) picks.push(s)
    }
    fanCount = ROW.meridian.count
    fanSpan = ROW.meridian.fan
    for (let i = 0; i < ROW.meridian.count; i++) {
      const slot = picks[i] ?? -1
      let ang = base + (i - 2) * ((ROW.meridian.fan * Math.PI) / 180) / 4
      if (slot >= 0) {
        const dist = Math.hypot((horde.x[slot] ?? 0) - px, (horde.z[slot] ?? 0) - pz)
        horde.forecast(slot, dist / ROW.meridian.speed, LEAD)
        ang = Math.atan2(LEAD.z - pz, LEAD.x - px)
      }
      launch(px, pz, ang, ROW.meridian.speed, ROW.meridian.life, stats.damage, 0)
    }
    volley++
    if (volley % ROW.meridian.every === 0) {
      bigCount++
      launch(px, pz, base, ROW.meridian.bigSpeed, ROW.meridian.bigLife, ROW.meridian.damage, 1)
      const midX = px + Math.cos(base) * 12
      const midZ = pz + Math.sin(base) * 12
      fx.scorch(midX, midZ, base, 28, ROW.meridian.width, ROW.meridian.seam, true)
    }
    bossTouch(horde, px, pz, 1.2, stats.damage, might, ROW.meridian.boss, stamp++)
  }

  function stepLances(dt: number, horde: Horde, might: number, time: number, ctx: HordeCtx) {
    for (let i = 0; i < lanceN; i++) {
      if (!lalive[i]) continue
      llife[i] = (llife[i] ?? 0) - dt
      if ((llife[i] ?? 0) <= 0) {
        lalive[i] = 0
        lfree.release(i)
        continue
      }
      const ox = lx[i] ?? 0
      const oz = lz[i] ?? 0
      const nx = ox + (lvx[i] ?? 0) * dt
      const nz = oz + (lvz[i] ?? 0) * dt
      lx[i] = nx
      lz[i] = nz
      const rad = lbig[i] ? ROW.meridian.width * 0.5 : 0.7
      const n = hashQuery((ox + nx) * 0.5, (oz + nz) * 0.5, rad + 1.2, Q)
      for (let k = 0; k < n; k++) {
        const s = Q[k] ?? -1
        if (s < 0 || !horde.living(s)) continue
        if (segDist2(ox, oz, nx, nz, horde.x[s] ?? 0, horde.z[s] ?? 0) > rad * rad) continue
        if (seen(i, s)) continue
        const hit = strike(horde, s, ldmg[i] ?? 0, might, ctx, lbig[i] ? 0.06 : 0.05, lvx[i] ?? 0, lvz[i] ?? 0)
        if (hit > 0) {
          if (!lnoted[i]) {
            lnoted[i] = 1
            lanceConnects++
            if (lbig[i]) {
              ctx.feel?.stop(0.04, false)
              ctx.feel?.shake(lvx[i] ?? 0, lvz[i] ?? 0, 0.06)
            }
          }
          horde.gleamFor(s, ROW.meridian.gleam, time)
          fx.hit(horde.x[s] ?? nx, horde.z[s] ?? nz, (horde.lit[s] ?? 0) === 1)
        }
      }
      if (!lboss[i] && bossTouch(horde, nx, nz, rad, ldmg[i] ?? 0, might, ROW.meridian.boss, stamp++)) lboss[i] = 1
    }
  }

  function addSpot(x: number, z: number) {
    let slot = -1
    for (let i = 0; i < ROW.dayburst.spotCap; i++) {
      if ((spotsLife[i] ?? 0) <= 0) slot = i
    }
    if (slot < 0) {
      let oldest = 0
      let age = 1e9
      for (let i = 0; i < ROW.dayburst.spotCap; i++) {
        if ((spotsLife[i] ?? 0) < age) {
          age = spotsLife[i] ?? 0
          oldest = i
        }
      }
      slot = oldest
    }
    spotsX[slot] = x
    spotsZ[slot] = z
    spotsLife[slot] = ROW.dayburst.spotLife
    spotN = Math.min(ROW.dayburst.spotCap, spotN + 1)
  }

  function alivePrisms(): number {
    let n = 0
    for (let i = 0; i < prismN; i++) if (pAlive[i]) n++
    if (n > prismMax) prismMax = n
    return n
  }

  function launchPrism(x: number, z: number, ang: number, volleyKey: number, mapLit: (x: number, z: number) => boolean) {
    if (alivePrisms() >= ROW.mocksun.alive) return false
    const i = pfree.acquire()
    if (i < 0) return false
    const sun = mapLit(x, z)
    const sp = sun ? TUNING.prism.sunSpeed : TUNING.prism.shadeSpeed
    pAlive[i] = 1
    pxA[i] = x
    pzA[i] = z
    pvx[i] = Math.cos(ang) * sp
    pvz[i] = Math.sin(ang) * sp
    pLit[i] = sun ? 1 : 0
    pLitAt[i] = 0
    pWasDog[i] = 0
    pVolley[i] = volleyKey
    return true
  }

  function trySplit(i: number, mapLit: (x: number, z: number) => boolean) {
    const key = pVolley[i] ?? 0
    let made = 0
    for (let p = 0; p < prismN; p++) if (pAlive[p] && pVolley[p] === key) made++
    if (made + 2 > ROW.mocksun.volley) return
    const ang = Math.atan2(pvz[i] ?? 0, pvx[i] ?? 1)
    launchPrism(pxA[i] ?? 0, pzA[i] ?? 0, ang + 0.45, key, mapLit)
    launchPrism(pxA[i] ?? 0, pzA[i] ?? 0, ang - 0.45, key, mapLit)
  }

  function publish() {
    let spots = 0
    for (let i = 0; i < 12; i++) if ((spotsLife[i] ?? 0) > 0) spots++
    let obs = 0
    for (let i = 0; i < obN; i++) if (oAlive[i]) obs++
    read.meridianVolley = volley
    read.meridianFan = fanCount
    read.meridianSpan = fanSpan
    read.meridianBig = bigCount
    read.meridianThrows = lanceThrows
    read.meridianConnects = lanceConnects
    read.coronaBurst = burstCount
    read.dayburstAt = novaAt
    read.tongues = tongueCount
    read.spots = spots
    read.tolls = tollN
    read.tollR = tollR
    read.dazed = dazed
    read.healed = healed
    read.chain = chainN
    read.ballHits = ballHits
    read.obelisks = obs
    read.fences = fenceN
    read.prismAlive = alivePrisms()
    read.prismMax = prismMax
    read.dogs = dogCount
    publishEvo(read)
  }

  return {
    mark() {
      rebuildGrid()
    },
    lights: lightAt,
    clear() {
      lfree.reset()
      lalive.fill(0)
      volley = 0
      fanCount = 0
      fanSpan = 0
      bigCount = 0
      lanceThrows = 0
      lanceConnects = 0
      lnoted.fill(0)
      spearCd = 0.2
      burstCd = 0
      burstCount = 0
      coronaAt.fill(-10)
      knockAt.fill(-10)
      coronaBoss = -10
      novaCd = ROW.dayburst.every
      tongueIn = -1
      tongueCount = 0
      novaAt = 0
      tongueLife.fill(0)
      spotsLife.fill(0)
      spotN = 0
      bellCd = ROW.twelvefold.every
      tolling = false
      tollN = 0
      tollGap = 0
      tollR = 2
      dazed = 0
      healed = 0
      tollAt.fill(-10)
      chainCd = 0
      solarBossCd = 0
      retarget = 0
      chainN = 0
      bank = 0
      bankAcc = 0
      spendCd = 0
      roll = 0
      ballHits = 0
      ballAt.fill(-10)
      ballBoss = -10
      tailAge.fill(10)
      plantCd = 0.6
      plantN = 0
      fenceN = 0
      pulseCd = 0.4
      obAt.fill(-10)
      fenceAt.fill(-10)
      obBoss.fill(-10)
      oAlive.fill(0)
      prismCd = 0.2
      runLeft = 0
      volleyId = 1
      pfree.reset()
      pAlive.fill(0)
      prismMax = 0
      dogCount = 0
      haveFoot = false
      lightReset()
    },
    update(dt: number, px: number, pz: number, horde: Horde, might: number, haste: number, mapLit: (x: number, z: number) => boolean, shadow: (out: ShadowDir) => void, ctx: HordeCtx, time: number, tier: TierName) {
      void ctx.dt
      lightReset()
      const t0 = performance.now()
      if (evoOn('spear')) {
        spearCd -= dt
        if (spearCd <= 0) {
          spearCd = spearStats(5).cooldown * hasteMul(haste)
          aimFan(px, pz, horde, might)
        }
        stepLances(dt, horde, might, time, ctx)
      }
      addEvoCpu('meridian', performance.now() - t0)

      const t1 = performance.now()
      if (evoOn('halo')) {
        const sun = mapLit(px, pz)
        const radius = sun ? ROW.corona.sun : ROW.corona.shade
        read.coronaR = radius
        coronaRay -= dt
        if (coronaRay <= 0) {
          coronaRay = 0.1
          const rays = tier === 'low' ? 0 : 6
          for (let i = 0; i < rays; i++) {
            const a = time * 0.5 + (i / 6) * Math.PI * 2
            fx.ray(px + Math.cos(a) * radius, 0.12, pz + Math.sin(a) * radius, a, sun ? 1.6 : 2.2, 0.22, 0.08)
          }
        }
        const inner = radius - ROW.corona.band * 0.5
        const outer = radius + ROW.corona.band * 0.5
        const n = hashQuery(px, pz, outer + 0.4, Q)
        for (let k = 0; k < n; k++) {
          const s = Q[k] ?? -1
          if (s < 0 || !horde.living(s)) continue
          const dx = (horde.x[s] ?? 0) - px
          const dz = (horde.z[s] ?? 0) - pz
          const d = Math.hypot(dx, dz)
          if (d < inner || d > outer) continue
          horde.washFor(s, ROW.corona.wash)
          if (due(coronaAt, s, time, ROW.corona.tick)) {
            const stats = haloStats(5)
            strike(horde, s, stats?.damage ?? 18, might, ctx)
          }
          if (!sun && due(knockAt, s, time, ROW.corona.knockGap) && d > 0.2) {
            horde.nudge(s, (dx / d) * ROW.corona.knock, (dz / d) * ROW.corona.knock)
          }
        }
        if (time - coronaBoss >= ROW.corona.tick) {
          coronaBoss = time
          bossTouch(horde, px, pz, outer, haloStats(5)?.damage ?? 18, might, ROW.corona.boss, stamp++)
        }
        if (!sun) {
          burstCd -= dt
          if (burstCd <= 0) {
            burstCd = ROW.corona.burst
            burstCount++
            const stats = haloStats(5)
            for (let i = 0; i < ROW.corona.rays; i++) {
              const a = (i / ROW.corona.rays) * Math.PI * 2
              const hx = px + Math.cos(a) * ROW.corona.burstRange
              const hz = pz + Math.sin(a) * ROW.corona.burstRange
              const hit = hashQuery(hx, hz, 1.1, Q)
              for (let k = 0; k < hit; k++) {
                const s = Q[k] ?? -1
                if (s < 0 || !horde.living(s)) continue
                strike(horde, s, stats?.damage ?? 18, might, ctx)
              }
              bossTouch(horde, hx, hz, 1.1, stats?.damage ?? 18, might, ROW.corona.boss, stamp++)
              fx.ray(px, 0.15, pz, a, ROW.corona.burstRange, 0.35, 0.12)
            }
          }
        }
      }
      addEvoCpu('corona', performance.now() - t1)

      const t2 = performance.now()
      if (evoOn('flare')) {
        const stats = flareStats(5)
        novaCd -= dt
        if (novaCd <= 0) {
          novaCd = ROW.dayburst.every
          novaAt = time
          tongueIn = ROW.dayburst.tongueDelay
          tongueCount = 0
          dayburstFlash(time)
          fx.band(px, pz, stats.sun, 0.35)
          fx.core(px, pz, stats.sun * 0.45)
          ctx.feel?.rank(1)
          ctx.feel?.stop(0.04, false)
          ctx.feel?.shake(0, 0, 0.1)
          ctx.feel?.burst(0.015, 8)
          ctx.feel?.beginArea()
          const n = hashQuery(px, pz, stats.sun, Q)
          for (let k = 0; k < n; k++) {
            const s = Q[k] ?? -1
            if (s < 0 || !horde.living(s)) continue
            const dx = (horde.x[s] ?? 0) - px
            const dz = (horde.z[s] ?? 0) - pz
            if (dx * dx + dz * dz > stats.sun * stats.sun) continue
            strike(horde, s, stats.damage, might, ctx, 0.04, dx, dz)
          }
          bossTouch(horde, px, pz, stats.sun, stats.damage, might, ROW.dayburst.boss, stamp++)
          ctx.feel?.endArea(px, pz)
          ctx.feel?.rank(0)
        }
        if (tongueIn >= 0) {
          tongueIn -= dt
          if (tongueIn <= 0) {
            tongueIn = -1
            const shade = !mapLit(px, pz)
            for (let i = 0; i < ROW.dayburst.tongues; i++) {
              const a = (i / ROW.dayburst.tongues) * Math.PI * 2
              const dist = ROW.dayburst.tongueNear + (i / Math.max(1, ROW.dayburst.tongues - 1)) * (ROW.dayburst.tongueFar - ROW.dayburst.tongueNear)
              const hx = px + Math.cos(a) * dist
              const hz = pz + Math.sin(a) * dist
              tongueCount++
              tongueX[i] = hx
              tongueZ[i] = hz
              tongueLife[i] = 0.55
              const dmg = stats.damage * ROW.dayburst.tongueMul
              const n = hashQuery(hx, hz, ROW.dayburst.tongueR, Q)
              for (let k = 0; k < n; k++) {
                const s = Q[k] ?? -1
                if (s < 0 || !horde.living(s)) continue
                const dx = (horde.x[s] ?? 0) - hx
                const dz = (horde.z[s] ?? 0) - hz
                strike(horde, s, dmg, might, ctx, 0.03, dx, dz)
              }
              bossTouch(horde, hx, hz, ROW.dayburst.tongueR, dmg, might, ROW.dayburst.boss, stamp++)
              if (shade) addSpot(hx, hz)
            }
          }
        }
        for (let i = 0; i < tongueLife.length; i++) {
          if ((tongueLife[i] ?? 0) <= 0) continue
          tongueLife[i] = (tongueLife[i] ?? 0) - dt
        }
        for (let i = 0; i < ROW.dayburst.spotCap; i++) {
          if ((spotsLife[i] ?? 0) <= 0) continue
          spotsLife[i] = (spotsLife[i] ?? 0) - dt
          if ((spotsLife[i] ?? 0) <= 0) continue
          pushLight(1, spotsX[i] ?? 0, spotsZ[i] ?? 0, 0, 0, ROW.dayburst.spotR)
          const n = hashQuery(spotsX[i] ?? 0, spotsZ[i] ?? 0, ROW.dayburst.spotR, Q)
          for (let k = 0; k < n; k++) {
            const s = Q[k] ?? -1
            if (s < 0 || !horde.living(s)) continue
            const dx = (horde.x[s] ?? 0) - (spotsX[i] ?? 0)
            const dz = (horde.z[s] ?? 0) - (spotsZ[i] ?? 0)
            if (dx * dx + dz * dz <= ROW.dayburst.spotR * ROW.dayburst.spotR) horde.washFor(s, 0.3)
          }
        }
      }
      addEvoCpu('dayburst', performance.now() - t2)

      const t3 = performance.now()
      if (evoOn('bell')) {
        const stats = bellStats(5)
        const tollDmg = stats.tollDamage * ROW.twelvefold.mul
        if (!tolling) {
          bellCd -= dt
          if (bellCd <= 0) {
            bellCd = ROW.twelvefold.every
            tolling = true
            tollN = 0
            tollGap = 0
          }
        } else {
          tollGap -= dt
          const gap = ROW.twelvefold.window / ROW.twelvefold.tolls
          if (tollGap <= 0) {
            tollGap = gap
            tollN++
            const u = (tollN - 1) / Math.max(1, ROW.twelvefold.tolls - 1)
            tollR = ROW.twelvefold.r0 + (ROW.twelvefold.r1 - ROW.twelvefold.r0) * u
            const sun = mapLit(px, pz)
            const finalToll = tollN === ROW.twelvefold.tolls
            if (finalToll) ctx.feel?.rank(1)
            ctx.feel?.beginArea()
            const n = hashQuery(px, pz, tollR, Q)
            let hits = 0
            for (let k = 0; k < n; k++) {
              const s = Q[k] ?? -1
              if (s < 0 || !horde.living(s)) continue
              const dx = (horde.x[s] ?? 0) - px
              const dz = (horde.z[s] ?? 0) - pz
              const d = Math.hypot(dx, dz)
              if (d > tollR) continue
              if (due(tollAt, s, time, gap * 0.6)) strike(horde, s, tollDmg, might, ctx, 0.02, dx, dz)
              if (d > 0.15) {
                const sgn = sun ? -1 : 1
                horde.nudge(s, (dx / d) * ROW.twelvefold.shove * sgn, (dz / d) * ROW.twelvefold.shove * sgn)
              }
              hits++
              if (tollN === ROW.twelvefold.tolls && evoSee(horde.x[s] ?? 0, horde.z[s] ?? 0)) {
                horde.staggerFor(s, ROW.twelvefold.daze, true)
                dazed++
              }
            }
            bossTouch(horde, px, pz, tollR, tollDmg, might, ROW.twelvefold.boss, stamp++)
            fx.shock(px, pz, tollR)
            ctx.feel?.endArea(px, pz)
            if (finalToll) {
              ctx.feel?.shake(0, 0, 0.08)
              ctx.feel?.rank(0)
              const heal = hits > ROW.twelvefold.healCap ? ROW.twelvefold.healCap : hits
              healed += heal
              evoHeal(heal)
              tolling = false
            } else {
              const face = TUNING.camera.yaw
              ctx.feel?.shake(Math.sin(face), Math.cos(face), 0.025)
            }
          }
        }
      }
      addEvoCpu('twelvefold', performance.now() - t3)

      const t4 = performance.now()
      if (evoOn('helio')) {
        const helioDmg = (TUNING.helio.damage + TUNING.helio.levelDamage + TUNING.helio.masterDamage) * ROW.solar.mul
        const sun = mapLit(px, pz)
        read.mirrors = 3
        for (let i = 0; i < 3; i++) mirrorA[i] = time * 0.7 + (i * Math.PI * 2) / 3
        if (sun) {
          retarget -= dt
          chainCd -= dt
          if (retarget <= 0) {
            retarget = ROW.solar.retarget
            chainN = 0
            const n = hashQuery(px, pz, 12, Q)
            for (let k = 0; k < n && chainN < ROW.solar.chain; k++) {
              const s = Q[k] ?? -1
              if (s < 0 || !horde.living(s)) continue
              let used = false
              for (let c = 0; c < chainN; c++) if (chainS[c] === s) used = true
              if (used) continue
              chainS[chainN] = s
              chainN++
            }
          }
          if (chainCd <= 0) {
            chainCd = ROW.solar.tick
            let prevX = px + Math.cos(mirrorA[0] ?? 0) * ROW.solar.radius
            let prevZ = pz + Math.sin(mirrorA[0] ?? 0) * ROW.solar.radius
            for (let c = 0; c < chainN; c++) {
              const s = chainS[c] ?? -1
              if (s < 0 || !horde.living(s)) continue
              const nx = horde.x[s] ?? prevX
              const nz = horde.z[s] ?? prevZ
              strike(horde, s, helioDmg, might, ctx, c === 0 ? 0.015 : 0, nx - prevX, nz - prevZ)
              const hx = horde.x[s] ?? prevX
              const hz = horde.z[s] ?? prevZ
              fx.helioRay((prevX + hx) * 0.5, 1.2, (prevZ + hz) * 0.5, Math.atan2(hz - prevZ, hx - prevX), Math.hypot(hx - prevX, hz - prevZ), 0.28, 0.16)
              prevX = hx
              prevZ = hz
            }
          }
        } else {
          triAx = px + Math.cos(mirrorA[0] ?? 0) * ROW.solar.radius
          triAz = pz + Math.sin(mirrorA[0] ?? 0) * ROW.solar.radius
          triBx = px + Math.cos(mirrorA[1] ?? 0) * ROW.solar.radius
          triBz = pz + Math.sin(mirrorA[1] ?? 0) * ROW.solar.radius
          triCx = px + Math.cos(mirrorA[2] ?? 0) * ROW.solar.radius
          triCz = pz + Math.sin(mirrorA[2] ?? 0) * ROW.solar.radius
          pushLight(3, triAx, triAz, triBx, triBz, 0, triCx, triCz)
          bankAcc += dt
          if (bankAcc >= 1 && bank < 3) {
            bankAcc -= 1
            bank++
          }
          spendCd -= dt
          if (spendCd <= 0 && bank > 0) {
            spendCd = 0.6
            bank--
            const n = hashQuery(px, pz, 12, Q)
            let target = -1
            for (let k = 0; k < n; k++) {
              const s = Q[k] ?? -1
              if (s >= 0 && horde.living(s)) {
                target = s
                break
              }
            }
            for (let m = 0; m < 3; m++) {
              const mx = px + Math.cos(mirrorA[m] ?? 0) * ROW.solar.radius
              const mz = pz + Math.sin(mirrorA[m] ?? 0) * ROW.solar.radius
              if (target >= 0) {
                strike(horde, target, helioDmg, might, ctx, 0.015, (horde.x[target] ?? mx) - mx, (horde.z[target] ?? mz) - mz)
                const hx = horde.x[target] ?? mx
                const hz = horde.z[target] ?? mz
                fx.helioRay((mx + hx) * 0.5, 1.3, (mz + hz) * 0.5, Math.atan2(hz - mz, hx - mx), Math.hypot(hx - mx, hz - mz), 0.42, 0.18)
              }
            }
          }
        }
        // Same 12 m pulse in shade. A ring hold spends most of the fight off the sun patch.
        solarBossCd -= dt
        if (solarBossCd <= 0) {
          solarBossCd = ROW.solar.tick
          const sunBoss = horde.bossAt
          if (sunBoss && (sunBoss.x - px) * (sunBoss.x - px) + (sunBoss.z - pz) * (sunBoss.z - pz) <= 144) {
            bossTouch(horde, sunBoss.x, sunBoss.z, 0, helioDmg, might, ROW.solar.boss, stamp++)
          }
        }
      }
      addEvoCpu('solar', performance.now() - t4)

      const t5 = performance.now()
      if (evoOn('scarab')) {
        roll += dt
        const radius = (ROW.sunroller.near + ROW.sunroller.far) * 0.5 + Math.sin(roll * 0.7) * (ROW.sunroller.far - ROW.sunroller.near) * 0.5
        const ang = roll * 1.3
        const bx = px + Math.cos(ang) * radius
        const bz = pz + Math.sin(ang) * radius
        tailAge[2] = tailAge[1] ?? 0
        tailX[2] = tailX[1] ?? bx
        tailZ[2] = tailZ[1] ?? bz
        tailAge[1] = tailAge[0] ?? 0
        tailX[1] = tailX[0] ?? bx
        tailZ[1] = tailZ[0] ?? bz
        tailX[0] = bx
        tailZ[0] = bz
        tailAge[0] = 0
        for (let i = 0; i < 3; i++) tailAge[i] = (tailAge[i] ?? 0) + dt
        pushLight(1, bx, bz, 0, 0, ROW.sunroller.light)
        for (let i = 1; i < 3; i++) {
          if ((tailAge[i] ?? 10) <= ROW.sunroller.tail) pushLight(1, tailX[i] ?? bx, tailZ[i] ?? bz, 0, 0, ROW.sunroller.light * (1 - i * 0.25))
        }
        const n = hashQuery(bx, bz, ROW.sunroller.light, Q)
        for (let k = 0; k < n; k++) {
          const s = Q[k] ?? -1
          if (s < 0 || !horde.living(s)) continue
          const dx = (horde.x[s] ?? 0) - bx
          const dz = (horde.z[s] ?? 0) - bz
          const d = Math.hypot(dx, dz)
          if (d > ROW.sunroller.ball * 0.5 + 0.45) {
            if (d <= ROW.sunroller.light) horde.washFor(s, 0.25)
            continue
          }
          horde.washFor(s, 0.25)
          if (!due(ballAt, s, time, ROW.sunroller.gap)) continue
          ballHits++
          strike(horde, s, ROW.sunroller.damage, might, ctx)
          if (d > 0.05) horde.nudge(s, (dx / d) * ROW.sunroller.knock, (dz / d) * ROW.sunroller.knock)
        }
        if (time - ballBoss >= ROW.sunroller.gap && bossTouch(horde, bx, bz, ROW.sunroller.ball * 0.5, ROW.sunroller.damage, might, ROW.sunroller.boss, stamp++)) ballBoss = time
      }
      addEvoCpu('sunroller', performance.now() - t5)

      const t6 = performance.now()
      if (evoOn('stake')) {
        shadow(SHADE)
        let len = SHADE.length
        if (len < 5) len = 5
        if (len > 10) len = 10
        bladeLen = len
        plantCd -= dt
        let alive = 0
        for (let i = 0; i < obN; i++) if (oAlive[i]) alive++
        if (plantCd <= 0 && alive < ROW.obelisk.max) {
          plantCd = ROW.obelisk.plant
          for (let k = 0; k < 10; k++) {
            const a = plantN * 0.9 + k * 1.257
            const dist = 4.5 + (k % 3)
            const x = px + Math.cos(a) * dist
            const z = pz + Math.sin(a) * dist
            if (!mapLit(x, z) || !insideArena(x, z, 0.4)) continue
            const resolved = resolveCircle(x, z, 0.4)
            const i = oAlive.indexOf(0)
            if (i < 0) break
            oAlive[i] = 1
            ox[i] = resolved.x
            oz[i] = resolved.z
            oLife[i] = ROW.obelisk.life
            oAng[i] = a
            plantN++
            break
          }
        }
        fenceN = 0
        for (let i = 0; i < obN; i++) {
          if (!oAlive[i]) continue
          oLife[i] = (oLife[i] ?? 0) - dt
          if ((oLife[i] ?? 0) <= 0) {
            oAlive[i] = 0
            continue
          }
          oAng[i] = (oAng[i] ?? 0) + (ROW.obelisk.sweep * Math.PI) / 180 * dt
          const x1 = (ox[i] ?? 0) + Math.cos(oAng[i] ?? 0) * len
          const z1 = (oz[i] ?? 0) + Math.sin(oAng[i] ?? 0) * len
          if (mapLit(ox[i] ?? 0, oz[i] ?? 0)) {
            const n = hashQuery(((ox[i] ?? 0) + x1) * 0.5, ((oz[i] ?? 0) + z1) * 0.5, len * 0.5 + 1, Q)
            for (let k = 0; k < n; k++) {
              const s = Q[k] ?? -1
              if (s < 0 || !horde.living(s)) continue
              if (segDist2(ox[i] ?? 0, oz[i] ?? 0, x1, z1, horde.x[s] ?? 0, horde.z[s] ?? 0) > 0.35 * 0.35) continue
              if (!due(obAt, s, time, ROW.obelisk.gap)) continue
              strike(horde, s, ROW.obelisk.damage, might, ctx, 0.04, x1 - (ox[i] ?? 0), z1 - (oz[i] ?? 0))
            }
          }
          if (time - (obBoss[i] ?? -10) >= ROW.obelisk.gap) {
            const beamBoss = horde.bossAt
            const beamNear = !!beamBoss && segDist2(ox[i] ?? 0, oz[i] ?? 0, x1, z1, beamBoss.x, beamBoss.z) <= (0.6 + beamBoss.r) * (0.6 + beamBoss.r)
            if (beamNear && bossTouch(horde, beamBoss.x, beamBoss.z, 0, ROW.obelisk.damage, might, ROW.obelisk.boss, stamp++)) obBoss[i] = time
          }
        }
        for (let i = 0; i < obN; i++) {
          if (!oAlive[i]) continue
          for (let j = i + 1; j < obN; j++) {
            if (!oAlive[j]) continue
            const dx = (ox[j] ?? 0) - (ox[i] ?? 0)
            const dz = (oz[j] ?? 0) - (oz[i] ?? 0)
            if (dx * dx + dz * dz > ROW.obelisk.fence * ROW.obelisk.fence) continue
            fenceN++
            pushLight(2, ox[i] ?? 0, oz[i] ?? 0, ox[j] ?? 0, oz[j] ?? 0, ROW.obelisk.fenceW * 0.5)
            const n = hashQuery(((ox[i] ?? 0) + (ox[j] ?? 0)) * 0.5, ((oz[i] ?? 0) + (oz[j] ?? 0)) * 0.5, ROW.obelisk.fence * 0.5, Q)
            for (let k = 0; k < n; k++) {
              const s = Q[k] ?? -1
              if (s < 0 || !horde.living(s)) continue
              if (segDist2(ox[i] ?? 0, oz[i] ?? 0, ox[j] ?? 0, oz[j] ?? 0, horde.x[s] ?? 0, horde.z[s] ?? 0) > 0.5) continue
              horde.washFor(s, 0.3)
              if (!due(fenceAt, s, time, ROW.obelisk.fenceGap)) continue
              strike(horde, s, ROW.obelisk.fenceDmg, might, ctx)
            }
          }
        }
        if (!mapLit(px, pz)) {
          pulseCd -= dt
          if (pulseCd <= 0) {
            pulseCd = 1.5
            const ring = TUNING.stake.ringDamage + TUNING.stake.levelRing
            const n = hashQuery(px, pz, 2.6, Q)
            for (let k = 0; k < n; k++) {
              const s = Q[k] ?? -1
              if (s < 0 || !horde.living(s)) continue
              const dx = (horde.x[s] ?? 0) - px
              const dz = (horde.z[s] ?? 0) - pz
              if (dx * dx + dz * dz > 2.6 * 2.6) continue
              strike(horde, s, ring, might, ctx, 0.04, dx, dz)
            }
            fx.shock(px, pz, 2.6)
          }
        }
      }
      addEvoCpu('obelisk', performance.now() - t6)

      const t7 = performance.now()
      if (evoOn('prism')) {
        if (!haveFoot) {
          haveFoot = true
          lastPx = px
          lastPz = pz
        }
        const step = Math.hypot(px - lastPx, pz - lastPz)
        lastPx = px
        lastPz = pz
        runLeft += step
        if (runLeft >= ROW.mocksun.run) {
          runLeft -= ROW.mocksun.run
          volleyId++
          launchPrism(px, pz, time * 1.7, volleyId, mapLit)
        }
        prismCd -= dt
        if (prismCd <= 0) {
          prismCd = TUNING.prism.cooldownL4 * hasteMul(haste)
          volleyId++
          launchPrism(px, pz, time * 0.8, volleyId, mapLit)
        }
        const dogA = (time / ROW.mocksun.period) * Math.PI * 2
        const orbit = ROW.mocksun.orbit
        DOG_X[0] = px + Math.cos(dogA) * orbit
        DOG_Z[0] = pz + Math.sin(dogA) * orbit
        DOG_X[1] = px + Math.cos(dogA + Math.PI) * orbit
        DOG_Z[1] = pz + Math.sin(dogA + Math.PI) * orbit
        dogCount = 2
        const dmg = TUNING.prism.damage + TUNING.prism.levelDamage + TUNING.prism.masterDamage
        for (let i = 0; i < prismN; i++) {
          if (!pAlive[i]) continue
          if (time - (pLitAt[i] ?? 0) >= ROW.mocksun.litStep) {
            pLitAt[i] = time
            pLit[i] = mapLit(pxA[i] ?? 0, pzA[i] ?? 0) ? 1 : 0
            const sp = pLit[i] ? TUNING.prism.sunSpeed : TUNING.prism.shadeSpeed
            const mag = Math.hypot(pvx[i] ?? 0, pvz[i] ?? 0) || 1
            pvx[i] = ((pvx[i] ?? 0) / mag) * sp
            pvz[i] = ((pvz[i] ?? 0) / mag) * sp
          }
          pxA[i] = (pxA[i] ?? 0) + (pvx[i] ?? 0) * dt
          pzA[i] = (pzA[i] ?? 0) + (pvz[i] ?? 0) * dt
          let near = false
          for (let d = 0; d < 2; d++) {
            const dx = (pxA[i] ?? 0) - (DOG_X[d] ?? 0)
            const dz = (pzA[i] ?? 0) - (DOG_Z[d] ?? 0)
            if (dx * dx + dz * dz < 0.49) near = true
          }
          if (near && !pWasDog[i]) trySplit(i, mapLit)
          pWasDog[i] = near ? 1 : 0
          const n = hashQuery(pxA[i] ?? 0, pzA[i] ?? 0, 0.8, Q)
          for (let k = 0; k < n; k++) {
            const s = Q[k] ?? -1
            if (s < 0 || !horde.living(s)) continue
            const dx = (horde.x[s] ?? 0) - (pxA[i] ?? 0)
            const dz = (horde.z[s] ?? 0) - (pzA[i] ?? 0)
            if (dx * dx + dz * dz > 0.36) continue
            strike(horde, s, dmg, might, ctx, 0.02, (pvx[i] ?? dx), (pvz[i] ?? dz))
            trySplit(i, mapLit)
            pAlive[i] = 0
            pfree.release(i)
            break
          }
          if (pAlive[i] && bossTouch(horde, pxA[i] ?? 0, pzA[i] ?? 0, 0.45, dmg, might, ROW.mocksun.boss, stamp++)) {
            pAlive[i] = 0
            pfree.release(i)
            continue
          }
          if ((pxA[i] ?? 0) * (pxA[i] ?? 0) + (pzA[i] ?? 0) * (pzA[i] ?? 0) > 80 * 80 && pAlive[i]) {
            pAlive[i] = 0
            pfree.release(i)
          }
        }
      }
      addEvoCpu('mocksun', performance.now() - t7)
      publish()
    },
    sync(px: number, pz: number, time: number, mapLit: (x: number, z: number) => boolean) {
      if (evoDriving('spear')) {
        for (let i = 0; i < lanceN; i++) {
          if (!lalive[i]) continue
          const big = lbig[i] === 1
          const scale = big ? 6.8 : 2.6
          // 24 m along the flight line so a broadside still covers 70% of 1280 px.
          // Phone caps the Meridian stretch at 9 so the opaque lance does not cover Sela.
          const stretch = big ? (detectMobile() ? 9 : 12) : scale
          const ang = yawFromDirection(lvx[i] ?? 0, lvz[i] ?? 1) + Math.PI
          const ly = big ? 1.2 : 0.9
          arsenal.place(ARSENAL_PART.lance, lx[i] ?? 0, ly, lz[i] ?? 0, ang, scale, big ? 1 : 0.4, 0, undefined, stretch)
          const rims = spinRims(lx[i] ?? 0, ly, lz[i] ?? 0, ang, scale, LANCE_RIM, scale, stretch)
          const rim = rimAt(rims, 0, lx[i] ?? 0, 1, lz[i] ?? 0)
          const beside = spinRims(lx[i] ?? 0, 0.02, lz[i] ?? 0, ang, scale, LANCE_BESIDE, scale, stretch)
          const floorPt = rimAt(beside, 0, (lx[i] ?? 0) + 1.2, 0.02, lz[i] ?? 0)
          probePut(big ? 'meridian' : 'sunspear', 5, lx[i] ?? 0, ly, lz[i] ?? 0, rim.x, rim.y, rim.z, floorPt.x, 0.02, floorPt.z, rims)
          if (big) fx.streak(lx[i] ?? 0, 0.4, lz[i] ?? 0, ang, 40, ROW.meridian.width, 0.12, STREAK_RGB)
        }
      }
      if (evoDriving('halo')) {
        const sun = mapLit(px, pz)
        const radius = sun ? ROW.corona.sun : ROW.corona.shade
        const scale = radius / ROW.corona.sun
        arsenal.place(ARSENAL_PART.corona, px, 0.05, pz, 0, scale, 1, 0)
        const rims = spinRims(px, 0.05, pz, 0, scale, ringLocal(3.2, 0))
        const rim = rimAt(rims, 0, px + radius, 0.05, pz)
        probePut('corona', 5, px, 0.05, pz, rim.x, rim.y, rim.z, px + radius + 0.4, 0.02, pz, rims)
      }
      if (evoDriving('bell') && tolling) {
        const sy = (ROW.twelvefold.height / 1.15) * 0.6
        const yaw = TUNING.camera.yaw
        const bx = px - Math.sin(yaw) * 1.2
        const bz = pz - Math.cos(yaw) * 1.2
        arsenal.place(ARSENAL_PART.bell, bx, 0, bz, 0, sy * 0.72, 0.8, 0, sy)
        const rims = spinRims(bx, 0, bz, 0, sy * 0.72, ringLocal(0.25, 0.85), sy)
        const rim = rimAt(rims, 0, bx, 2, bz)
        probePut('twelvefold', 5, bx, ROW.twelvefold.height * 0.5 * 0.6, bz, rim.x, rim.y, rim.z, bx + 1.4, 0.02, bz, rims)
      }
      if (evoDriving('helio')) {
        for (let i = 0; i < 3; i++) {
          const a = mirrorA[i] ?? 0
          const mx = px + Math.cos(a) * ROW.solar.radius
          const mz = pz + Math.sin(a) * ROW.solar.radius
          arsenal.place(ARSENAL_PART.mirror, mx, 1.7, mz, a, 2.1, 1, 0)
          const rims = spinRims(mx, 1.7, mz, a, 2.1, ringLocal(0.52, 0.03))
          const rim = rimAt(rims, 0, mx, 1.7, mz)
          probePut('solar', 5, mx, 1.7, mz, rim.x, rim.y, rim.z, mx + 0.8, 0.02, mz, rims)
        }
      }
      if (evoDriving('scarab')) {
        const radius = (ROW.sunroller.near + ROW.sunroller.far) * 0.5 + Math.sin(roll * 0.7) * (ROW.sunroller.far - ROW.sunroller.near) * 0.5
        const ang = roll * 1.3
        const bx = px + Math.cos(ang) * radius
        const bz = pz + Math.sin(ang) * radius
        const scarabScale = ROW.sunroller.scarab / 0.64
        arsenal.place(ARSENAL_PART.scarab, bx + Math.cos(ang) * 0.9, 0.45, bz + Math.sin(ang) * 0.9, ang, scarabScale, 1, time * 8)
        const ballScale = ROW.sunroller.ball / 1.6
        arsenal.place(ARSENAL_PART.sunball, bx, 0.9, bz, ang, ballScale, 1, 0)
        const rims = ringRims(bx, 0.9 + 0.74 * ballScale, bz, 0.38 * ballScale)
        const rim = rimAt(rims, 0, bx, 0.9, bz)
        probePut('sunroller', 5, bx, 0.9, bz, rim.x, rim.y, rim.z, bx + 1.4, 0.02, bz, rims)
      }
      if (evoDriving('stake')) {
        const len = bladeLen
        for (let i = 0; i < obN; i++) {
          if (!oAlive[i]) continue
          arsenal.place(ARSENAL_PART.obelisk, ox[i] ?? 0, 0, oz[i] ?? 0, oAng[i] ?? 0, 1, 0.6, 0)
          const rims = spinRims(ox[i] ?? 0, 0, oz[i] ?? 0, oAng[i] ?? 0, 1, OBELISK_RIM)
          const rim = rimAt(rims, 4, ox[i] ?? 0, 2.6, oz[i] ?? 0)
          probePut('obelisk', 5, ox[i] ?? 0, 1.4, oz[i] ?? 0, rim.x, rim.y, rim.z, (ox[i] ?? 0) + 1.2, 0.02, oz[i] ?? 0, rims)
          const x1 = (ox[i] ?? 0) + Math.cos(oAng[i] ?? 0) * len
          const z1 = (oz[i] ?? 0) + Math.sin(oAng[i] ?? 0) * len
          fx.stakeLine(((ox[i] ?? 0) + x1) * 0.5, ((oz[i] ?? 0) + z1) * 0.5, oAng[i] ?? 0, len, 0.35)
        }
        for (let i = 0; i < obN; i++) {
          if (!oAlive[i]) continue
          for (let j = i + 1; j < obN; j++) {
            if (!oAlive[j]) continue
            const dx = (ox[j] ?? 0) - (ox[i] ?? 0)
            const dz = (oz[j] ?? 0) - (oz[i] ?? 0)
            if (dx * dx + dz * dz > ROW.obelisk.fence * ROW.obelisk.fence) continue
            const mx = ((ox[i] ?? 0) + (ox[j] ?? 0)) * 0.5
            const mz = ((oz[i] ?? 0) + (oz[j] ?? 0)) * 0.5
            fx.fence(mx, mz, Math.atan2(dz, dx), Math.hypot(dx, dz), ROW.obelisk.fenceW)
          }
        }
      }
      if (evoDriving('prism')) {
        const dogA = (time / ROW.mocksun.period) * Math.PI * 2
        for (let d = 0; d < 2; d++) {
          const a = dogA + d * Math.PI
          const x = px + Math.cos(a) * ROW.mocksun.orbit
          const z = pz + Math.sin(a) * ROW.mocksun.orbit
          arsenal.place(ARSENAL_PART.prism, x, 1.4, z, a, 3.4, 0, 0)
          const rims = spinRims(x, 1.4, z, a, 3.4, ringLocal(0.14, 0.42))
          const rim = rimAt(rims, 0, x, 1.4, z)
          probePut('mocksun', 5, x, 1.4, z, rim.x, rim.y, rim.z, x + 1.3, 0.02, z, rims)
        }
        for (let i = 0; i < prismN; i++) {
          if (!pAlive[i]) continue
          const scale = 1.8
          const yaw = Math.atan2(pvz[i] ?? 0, pvx[i] ?? 1)
          arsenal.place(ARSENAL_PART.prism, pxA[i] ?? 0, 0.9, pzA[i] ?? 0, yaw, scale, 1, 0)
        }
      }
      if (evoDriving('flare')) {
        for (let i = 0; i < tongueLife.length; i++) {
          if ((tongueLife[i] ?? 0) <= 0) continue
          arsenal.place(ARSENAL_PART.tongue, tongueX[i] ?? 0, 0, tongueZ[i] ?? 0, 0, 1, 0, 0)
          const rims = ringRims(tongueX[i] ?? 0, 0.16, tongueZ[i] ?? 0, 1.3)
          const rim = rimAt(rims, 0, tongueX[i] ?? 0, 0.16, tongueZ[i] ?? 0)
          probePut('dayburst', 5, tongueX[i] ?? 0, 0.22, tongueZ[i] ?? 0, rim.x, rim.y, rim.z, (tongueX[i] ?? 0) + 1.9, 0.02, tongueZ[i] ?? 0, rims)
        }
        for (let i = 0; i < ROW.dayburst.spotCap; i++) {
          if ((spotsLife[i] ?? 0) <= 0) continue
          fx.sunspot(spotsX[i] ?? 0, spotsZ[i] ?? 0, ROW.dayburst.spotR, 0.16)
          const rims = ringRims(spotsX[i] ?? 0, 0.08, spotsZ[i] ?? 0, ROW.dayburst.spotR * 0.92)
          const rim = rimAt(rims, 0, spotsX[i] ?? 0, 0.08, spotsZ[i] ?? 0)
          probePut('sunspot', 5, spotsX[i] ?? 0, 0.08, spotsZ[i] ?? 0, rim.x, rim.y, rim.z, (spotsX[i] ?? 0) + ROW.dayburst.spotR + 0.3, 0.02, spotsZ[i] ?? 0, rims)
        }
      }
    },
  }
}

