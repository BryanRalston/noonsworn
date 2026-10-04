import { TUNING } from '../../data/tuning'
import { FreeList } from '../../core/pool'
import { yawFromDirection } from '../../core/math'
import { hashQuery } from '../spatialHash'
import { resolveCircle, segmentBlocked } from '../collision'
import { hasteMul } from '../sunClock'
import type { ShadowDir } from '../shadowDir'
import type { Horde, HordeCtx } from '../enemies/horde'
import { CARD, registerCard } from '../leveling'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import type { WeaponFx } from './fx'
import { endureMul, reachMul } from './passives'
import { probeAdd } from './probe'

const GOLD = [1.05, 0.46, 0.07]
const EDGE = [1.4, 1.05, 0.42]
const BRONZE = [0.062, 0.024, 0.008]
const QH = new Int16Array(48)
const QS = new Int16Array(48)
const QK = new Int16Array(48)
const QP = new Int16Array(32)
const PRISMS = 24
const SCARABS = 12
const STAKES = 3

function pushTri(
  pos: number[],
  col: number[],
  em: number[],
  a: number[],
  b: number[],
  c: number[],
  color: number[],
  edge: number,
) {
  pos.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0)
  col.push(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[0] ?? 0, color[1] ?? 0, color[2] ?? 0)
  em.push(edge, edge, edge)
}

function quad(pos: number[], col: number[], em: number[], a: number[], b: number[], c: number[], d: number[], color: number[], edge: number) {
  pushTri(pos, col, em, a, b, c, color, edge)
  pushTri(pos, col, em, a, c, d, color, edge)
}

function pack(pos: number[], col: number[], em: number[]): { position: Float32Array; color: Float32Array; emit: Float32Array } {
  return { position: Float32Array.from(pos), color: Float32Array.from(col), emit: Float32Array.from(em) }
}

function mirrorPart(): { position: Float32Array; color: Float32Array; emit: Float32Array } {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const n = 8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    pushTri(pos, col, em, [0, 0.04, 0], [Math.cos(a0) * 0.42, 0.04, Math.sin(a0) * 0.42], [Math.cos(a1) * 0.42, 0.04, Math.sin(a1) * 0.42], GOLD, 1)
    quad(
      pos, col, em,
      [Math.cos(a0) * 0.42, 0.04, Math.sin(a0) * 0.42],
      [Math.cos(a1) * 0.42, 0.04, Math.sin(a1) * 0.42],
      [Math.cos(a1) * 0.5, 0.02, Math.sin(a1) * 0.5],
      [Math.cos(a0) * 0.5, 0.02, Math.sin(a0) * 0.5],
      BRONZE, 0,
    )
  }
  quad(pos, col, em, [-0.28, 0, -0.2], [0.28, 0, -0.2], [0.28, 0, 0.45], [-0.28, 0, 0.45], EDGE, 1)
  return pack(pos, col, em)
}

function scarabPart(): { position: Float32Array; color: Float32Array; emit: Float32Array } {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  pushTri(pos, col, em, [0, 0.02, 0.32], [-0.16, 0.02, 0], [0.16, 0.02, 0], GOLD, 1)
  pushTri(pos, col, em, [0, 0.02, -0.32], [0.16, 0.02, 0], [-0.16, 0.02, 0], GOLD, 0.6)
  pushTri(pos, col, em, [0, 0.1, 0.05], [-0.12, 0.02, 0.16], [0.12, 0.02, 0.16], EDGE, 1)
  pushTri(pos, col, em, [0, 0.08, -0.08], [0.12, 0.02, -0.12], [-0.12, 0.02, -0.12], BRONZE, 0)
  quad(pos, col, em, [-0.16, 0.08, 0.12], [-0.42, 0.08, -0.05], [-0.36, 0.08, -0.22], [-0.12, 0.08, -0.02], BRONZE, 0)
  quad(pos, col, em, [0.16, 0.08, 0.12], [0.12, 0.08, -0.02], [0.36, 0.08, -0.22], [0.42, 0.08, -0.05], BRONZE, 0)
  quad(pos, col, em, [-0.1, 0.01, 0.2], [0.1, 0.01, 0.2], [0.08, 0.01, -0.2], [-0.08, 0.01, -0.2], GOLD, 1)
  return pack(pos, col, em)
}

function stakePart(): { position: Float32Array; color: Float32Array; emit: Float32Array } {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const s = 0.08
  quad(pos, col, em, [-s, 0, -s], [s, 0, -s], [s, 1.85, -s], [-s, 1.85, -s], BRONZE, 0)
  quad(pos, col, em, [s, 0, -s], [s, 0, s], [s, 1.85, s], [s, 1.85, -s], BRONZE, 0)
  quad(pos, col, em, [s, 0, s], [-s, 0, s], [-s, 1.85, s], [s, 1.85, s], BRONZE, 0)
  quad(pos, col, em, [-s, 0, s], [-s, 0, -s], [-s, 1.85, -s], [-s, 1.85, s], BRONZE, 0)
  quad(pos, col, em, [-0.14, 1.9, -0.14], [0.14, 1.9, -0.14], [0.14, 2.05, 0.14], [-0.14, 2.05, 0.14], GOLD, 1)
  for (let i = 0; i < 4; i++) {
    const y = 0.4 + i * 0.35
    quad(pos, col, em, [-0.12, y, 0.09], [0.12, y, 0.09], [0.12, y + 0.05, 0.09], [-0.12, y + 0.05, 0.09], EDGE, 0.4)
  }
  return pack(pos, col, em)
}

function prismPart(): { position: Float32Array; color: Float32Array; emit: Float32Array } {
  const pos: number[] = []
  const col: number[] = []
  const em: number[] = []
  const top = [0, 0.32, 0]
  const bot = [0, -0.32, 0]
  const eq = [
    [0.32, 0, 0],
    [0, 0, 0.32],
    [-0.32, 0, 0],
    [0, 0, -0.32],
  ]
  for (let i = 0; i < 4; i++) {
    const a = eq[i] ?? top
    const b = eq[(i + 1) % 4] ?? top
    pushTri(pos, col, em, top, a, b, GOLD, 0.85)
    pushTri(pos, col, em, bot, b, a, BRONZE, 0)
    quad(pos, col, em, a, b, [b[0] ?? 0, (b[1] ?? 0) + 0.02, b[2] ?? 0], [a[0] ?? 0, (a[1] ?? 0) + 0.02, a[2] ?? 0], EDGE, 1)
  }
  return pack(pos, col, em)
}

export function appendParts(arsenal: Arsenal): void {
  const mirror = mirrorPart()
  const scarab = scarabPart()
  const stake = stakePart()
  const prism = prismPart()
  arsenal.append(ARSENAL_PART.mirror, mirror.position, mirror.color, mirror.emit)
  arsenal.append(ARSENAL_PART.scarab, scarab.position, scarab.color, scarab.emit)
  arsenal.append(ARSENAL_PART.stake, stake.position, stake.color, stake.emit)
  arsenal.append(ARSENAL_PART.prism, prism.position, prism.color, prism.emit)
}

function helioText(level: number): string {
  if (level <= 0) return 'A mirror drone. In sun it fires and stores flashes; in shade it spends them.'
  if (level === 1) return 'L2: +4 damage'
  if (level === 2) return 'L3: +2 m range, bank 4'
  if (level === 3) return 'L4: faster sun fire'
  if (level === 4) return 'L5: +6 damage, pierce 2, longer dazzle'
  return 'Heliograph is mastered'
}

function scarabText(level: number): string {
  if (level <= 0) return 'Scarabs chain through lit foes and gnaw through armour.'
  if (level === 1) return 'L2: +3 damage'
  if (level === 2) return 'L3: 4 scarabs'
  if (level === 3) return 'L4: faster swarm'
  if (level === 4) return 'L5: +3 damage, 3 hops, longer latch'
  return 'Scarablight is mastered'
}

function stakeText(level: number): string {
  if (level <= 0) return 'Plant hour-stakes. In sun their shadow is a blade.'
  if (level === 1) return 'L2: +5 blade damage, +3 ring'
  if (level === 2) return 'L3: 3 stakes'
  if (level === 3) return 'L4: faster strikes'
  if (level === 4) return 'L5: +6 blade damage, longer life, wider blade'
  return 'Hour Stakes are mastered'
}

function prismText(level: number): string {
  if (level <= 0) return 'A prism that bounces, and splits at every sun/shade edge.'
  if (level === 1) return 'L2: +3 damage'
  if (level === 2) return 'L3: 4 bounces'
  if (level === 3) return 'L4: faster throws'
  if (level === 4) return 'L5: +4 damage, 10 splits'
  return 'Prism Shards are mastered'
}

export function registerCards(): void {
  registerCard(CARD.helio, (rank) => ({ name: 'Heliograph', text: helioText(rank), max: 5 }))
  registerCard(CARD.scarab, (rank) => ({ name: 'Scarablight', text: scarabText(rank), max: 5 }))
  registerCard(CARD.stake, (rank) => ({ name: 'Hour Stakes', text: stakeText(rank), max: 5 }))
  registerCard(CARD.prism, (rank) => ({ name: 'Prism Shards', text: prismText(rank), max: 5 }))
  registerCard(CARD.multitude, () => ({ name: 'Multitude', text: '+1 projectile for the spear, scarabs, prism, and mirror', max: 2 }))
  registerCard(CARD.reach, () => ({ name: 'Reach', text: '+10% length and radius', max: 5 }))
  registerCard(CARD.endurance, () => ({ name: 'Endurance', text: '+15% lasting effects', max: 5 }))
}

export interface W2Sample {
  bank: number
  helioGap: number
  helioHits: number
  scarabWave: number
  gnawTicks: number
  latchSeen: number
  stakeLen: number
  stakeSun: number
  prismSpeed: number
  prismPeak: number
  litHz: number
  retargetHz: number
  splits: number
}

export interface W2 {
  update: (
    dt: number,
    px: number,
    pz: number,
    horde: Horde,
    helio: number,
    scarab: number,
    stake: number,
    prism: number,
    multitude: number,
    haste: number,
    might: number,
    mapLit: (x: number, z: number) => boolean,
    shadow: (out: ShadowDir) => void,
    ctx: HordeCtx,
    time: number,
  ) => void
  mark: (mapLit: (x: number, z: number) => boolean, shadow: (out: ShadowDir) => void) => void
  sync: (px: number, pz: number, helio: number, scarab: number, stake: number, prism: number, time: number) => void
  clear: () => void
  lights: (x: number, z: number) => boolean
  cpu: () => { helio: number; scarab: number; stake: number; prism: number }
  resetCpu: () => void
  prismPeak: () => number
  sample: () => W2Sample
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

export function createW2(fx: WeaponFx, arsenal: Arsenal): W2 {
  const shade: ShadowDir = { dirX: 0, dirZ: 1, length: 5 }
  let footSun = false
  let footKnown = false
  let footHold = 0
  let helioCd = 0
  let bank = 0
  let bankAcc = 0
  let weakCd = 0
  let spendCd = 0
  let helioGap = 0
  let helioHits = 0
  let lastHelio = -1
  let mirrorX = 0
  let mirrorZ = 0
  let mirrorYaw = 0
  let shownHelio = 0
  let stampN = 7000

  const scarabFree = new FreeList(SCARABS)
  const sx = new Float32Array(SCARABS)
  const sz = new Float32Array(SCARABS)
  const svx = new Float32Array(SCARABS)
  const svz = new Float32Array(SCARABS)
  const sAlive = new Uint8Array(SCARABS)
  const sTarget = new Int16Array(SCARABS)
  const sHops = new Int8Array(SCARABS)
  const sMode = new Uint8Array(SCARABS)
  const sLatch = new Float32Array(SCARABS)
  const sGnaw = new Float32Array(SCARABS)
  const sRetarget = new Float32Array(SCARABS)
  const sTicks = new Int8Array(SCARABS)
  const sRetargets = new Int16Array(SCARABS)
  const sAge = new Float32Array(SCARABS)
  const sDust = new Float32Array(SCARABS)
  let scarabCd = 0
  let scarabWave = 0
  let gnawTicks = 0
  let latchSeen = 0
  let retargetHz = 0
  let shownScarab = 0

  const stakeFree = new FreeList(STAKES)
  const kx = new Float32Array(STAKES)
  const kz = new Float32Array(STAKES)
  const kLife = new Float32Array(STAKES)
  const kSun = new Uint8Array(STAKES)
  const kBlade = new Float32Array(STAKES)
  const kRing = new Float32Array(STAKES)
  const kDx = new Float32Array(STAKES)
  const kDz = new Float32Array(STAKES)
  const kLen = new Float32Array(STAKES)
  const kAlive = new Uint8Array(STAKES)
  let stakeCd = 0
  let stakeLen = 0
  let stakeSun = 0
  let shownStake = 0

  const prismFree = new FreeList(PRISMS)
  const pxA = new Float32Array(PRISMS)
  const pzA = new Float32Array(PRISMS)
  const pvx = new Float32Array(PRISMS)
  const pvz = new Float32Array(PRISMS)
  const pAlive = new Uint8Array(PRISMS)
  const pBounce = new Int8Array(PRISMS)
  const pLit = new Uint8Array(PRISMS)
  const pKnown = new Uint8Array(PRISMS)
  const pLitT = new Float32Array(PRISMS)
  const pVolley = new Int16Array(PRISMS)
  const pLast = new Int16Array(PRISMS)
  const pHome = new Int16Array(PRISMS)
  const pHomeT = new Float32Array(PRISMS)
  const pSerial = new Int32Array(PRISMS)
  const pChecks = new Int16Array(PRISMS)
  const pAge = new Float32Array(PRISMS)
  let prismCd = 0
  let volleyId = 1
  let prismPeakN = 0
  let prismSpeed = 0
  let litHz = 0
  let splits = 0
  let shownPrism = 0

  let cpuH = 0
  let cpuS = 0
  let cpuK = 0
  let cpuP = 0
  const ban = new Int16Array(8)
  let banN = 0

  function banned(slot: number): boolean {
    for (let i = 0; i < banN; i++) if (ban[i] === slot) return true
    return false
  }

  function bossIn(horde: Horde, x: number, z: number, range: number): boolean {
    const boss = horde.bossAt
    if (!boss || !horde.bossLock) return false
    return Math.hypot(boss.x - x, boss.z - z) <= range + boss.r
  }

  function nearest(horde: Horde, x: number, z: number, range: number, skip: number, query: Int16Array): number {
    const n = hashQuery(x, z, range, query)
    const r2 = range * range
    let best = -1
    let bestD = r2
    for (let i = 0; i < n; i++) {
      const s = query[i] ?? -1
      if (s < 0 || s === skip || banned(s) || !horde.living(s)) continue
      const dx = (horde.x[s] ?? 0) - x
      const dz = (horde.z[s] ?? 0) - z
      const d2 = dx * dx + dz * dz
      if (d2 >= bestD) continue
      bestD = d2
      best = s
    }
    return best
  }

  function hitSlot(horde: Horde, slot: number, amount: number, might: number, ctx: HordeCtx, raw = false): number {
    const hit = horde.damage(slot, amount, 'weapon', might, raw)
    if (hit === 2) horde.slay(slot, ctx)
    return hit
  }

  function rayStrike(horde: Horde, ox: number, oz: number, tx: number, tz: number, amount: number, pierce: number, might: number, ctx: HordeCtx, width: number, dazzle: number) {
    const dx = tx - ox
    const dz = tz - oz
    const len = Math.hypot(dx, dz) || 1
    const yaw = yawFromDirection(dx / len, dz / len)
    fx.helioRay((ox + tx) * 0.5, 1.2, (oz + tz) * 0.5, yaw, len, width * reachMul(), 0.16)
    fx.glow(ox, oz, 0.45)
    let hits = 0
    const want = 1 + pierce
    const n = hashQuery(ox, oz, len, QH)
    let guard = 0
    let skip = -1
    while (hits < want && guard++ < 6) {
      let best = -1
      let bestD = len * len
      for (let i = 0; i < n; i++) {
        const s = QH[i] ?? -1
        if (s < 0 || s === skip || !horde.living(s)) continue
        const ex = horde.x[s] ?? 0
        const ez = horde.z[s] ?? 0
        const along = ((ex - ox) * dx + (ez - oz) * dz) / (len * len)
        if (along < 0 || along > 1) continue
        if (segDist2(ox, oz, tx, tz, ex, ez) > 0.81) continue
        const d2 = (ex - ox) * (ex - ox) + (ez - oz) * (ez - oz)
        if (d2 >= bestD) continue
        bestD = d2
        best = s
      }
      if (best < 0) break
      const landed = hitSlot(horde, best, amount, might, ctx)
      if (landed > 0) {
        hits++
        helioHits++
        if (dazzle > 0) horde.staggerFor(best, dazzle * endureMul())
        fx.hit(horde.x[best] ?? tx, horde.z[best] ?? tz, (horde.lit[best] ?? 0) === 1)
      }
      skip = best
    }
    const boss = horde.bossAt
    if (boss && segDist2(ox, oz, tx, tz, boss.x, boss.z) <= (boss.r + 0.4) * (boss.r + 0.4)) {
      horde.bossHit?.(tx, tz, boss.r, amount * TUNING.helio.boss, 'weapon', might, stampN++)
    }
    return hits
  }

  function stepHelio(dt: number, px: number, pz: number, horde: Horde, level: number, multi: number, haste: number, might: number, mapLit: (x: number, z: number) => boolean, ctx: HordeCtx, time: number) {
    shownHelio = level
    if (level <= 0) return
    const row = TUNING.helio
    let damage: number = row.damage
    let range: number = row.range
    let period: number = row.period
    let pierce: number = row.pierce
    let bankMax: number = row.bank
    let dazzle: number = row.dazzle
    if (level >= 2) damage += row.levelDamage
    if (level >= 3) {
      range += row.rangeL3
      bankMax = row.bankL3
    }
    if (level >= 4) period = row.periodL4
    if (level >= 5) {
      damage += row.masterDamage
      pierce = row.pierceL5
      dazzle = row.dazzleL5
    }
    const want = mapLit(px, pz)
    if (!footKnown) {
      footKnown = true
      footSun = want
    } else if (want === footSun) footHold = 0
    else {
      footHold += dt
      if (footHold >= row.foot) {
        footSun = want
        footHold = 0
      }
    }
    mirrorX = px + 0.55
    mirrorZ = pz - 0.15
    const cadence = hasteMul(haste)
    if (footSun) {
      bankAcc += dt * row.bankRate
      while (bankAcc >= 1 && bank < bankMax) {
        bank++
        bankAcc -= 1
      }
      if (bankAcc >= 1) bankAcc = 1
      helioCd -= dt
      if (helioCd <= 0) {
        helioCd = period * cadence
        if (lastHelio >= 0) helioGap = time - lastHelio
        lastHelio = time
        fireHelio(px, pz, horde, damage, range, pierce, multi, might, ctx, row.width, 0)
      }
    } else {
      spendCd -= dt
      weakCd -= dt
      if (bank > 0 && spendCd <= 0) {
        spendCd = row.shadePeriod * cadence
        bank--
        if (lastHelio >= 0) helioGap = time - lastHelio
        lastHelio = time
        fireHelio(px, pz, horde, damage * row.shadeMul, range, pierce, multi, might, ctx, row.flashWidth, dazzle)
      } else if (bank <= 0 && weakCd <= 0) {
        weakCd = row.weakPeriod * cadence
        if (lastHelio >= 0) helioGap = time - lastHelio
        lastHelio = time
        fireHelio(px, pz, horde, damage, range, 0, multi, might, ctx, row.width, 0)
      }
    }
  }

  function fireHelio(px: number, pz: number, horde: Horde, amount: number, range: number, pierce: number, multi: number, might: number, ctx: HordeCtx, width: number, dazzle: number) {
    const boss = horde.bossAt
    let aimX = px + 1
    let aimZ = pz
    let skip = -1
    if (boss && bossIn(horde, px, pz, range)) {
      aimX = boss.x
      aimZ = boss.z
    } else {
      const slot = nearest(horde, px, pz, range, -1, QH)
      if (slot >= 0) {
        aimX = horde.x[slot] ?? aimX
        aimZ = horde.z[slot] ?? aimZ
        skip = slot
      }
    }
    mirrorYaw = yawFromDirection(aimX - mirrorX, aimZ - mirrorZ) + Math.PI
    rayStrike(horde, mirrorX, mirrorZ, aimX, aimZ, amount, pierce, might, ctx, width, dazzle)
    banN = 0
    if (skip >= 0) ban[banN++] = skip
    const extra = multi > 2 ? 2 : multi
    for (let i = 0; i < extra; i++) {
      const slot = nearest(horde, px, pz, range, -1, QH)
      if (slot < 0) break
      rayStrike(horde, mirrorX, mirrorZ, horde.x[slot] ?? px, horde.z[slot] ?? pz, amount, pierce, might, ctx, width, dazzle)
      if (banN < ban.length) ban[banN++] = slot
    }
    banN = 0
  }

  function stepScarabs(dt: number, px: number, pz: number, horde: Horde, level: number, multi: number, haste: number, might: number, ctx: HordeCtx) {
    shownScarab = level
    if (level <= 0) return
    const row = TUNING.scarab
    let count: number = row.count
    let cooldown: number = row.cooldown
    let damage: number = row.damage
    let hops: number = row.hop
    let latch: number = row.latch
    if (level >= 2) damage += row.levelDamage
    if (level >= 3) count = row.countL3
    if (level >= 4) cooldown = row.cooldownL4
    if (level >= 5) {
      damage += row.masterDamage
      hops = row.hopL5
      latch = row.latchL5
    }
    const extra = multi > 2 ? 2 : multi
    scarabCd -= dt
    if (scarabCd <= 0) {
      scarabCd = cooldown * hasteMul(haste)
      const wave = count + extra
      banN = 0
      for (let i = 0; i < wave; i++) {
        const id = scarabFree.acquire()
        if (id < 0) break
        const boss = horde.bossAt
        let tx = px + 1
        let tz = pz
        let target = -1
        if (i === 0 && boss && bossIn(horde, px, pz, 12)) {
          tx = boss.x
          tz = boss.z
          target = -2
        } else {
          target = nearest(horde, px, pz, 14, -1, QS)
          if (target >= 0) {
            tx = horde.x[target] ?? tx
            tz = horde.z[target] ?? tz
            if (banN < ban.length) ban[banN++] = target
          }
        }
        sAlive[id] = 1
        sx[id] = px
        sz[id] = pz
        const d = Math.hypot(tx - px, tz - pz) || 1
        svx[id] = ((tx - px) / d) * 8
        svz[id] = ((tz - pz) / d) * 8
        sTarget[id] = target
        sHops[id] = hops
        sMode[id] = target === -2 ? 2 : 0
        sLatch[id] = latch * endureMul()
        sGnaw[id] = row.gnawEvery
        sRetarget[id] = row.retarget
        sTicks[id] = 0
        sRetargets[id] = 0
        sAge[id] = 0
        sDust[id] = 0
        scarabWave = wave
      }
      banN = 0
    }
    for (let i = 0; i < SCARABS; i++) {
      if (!sAlive[i]) continue
      sAge[i] = (sAge[i] ?? 0) + dt
      sDust[i] = (sDust[i] ?? 0) - dt
      if ((sDust[i] ?? 0) <= 0) {
        sDust[i] = 0.1
        fx.scarabMote(sx[i] ?? 0, sz[i] ?? 0)
      }
      if (sMode[i] === 1) {
        const slot = sTarget[i] ?? -1
        if (slot < 0 || !horde.living(slot)) {
          releaseScarab(i)
          continue
        }
        sx[i] = horde.x[slot] ?? sx[i] ?? 0
        sz[i] = horde.z[slot] ?? sz[i] ?? 0
        sGnaw[i] = (sGnaw[i] ?? 0) + dt
        const dur = sLatch[i] ?? row.latch
        if ((sAge[i] ?? 0) >= dur || (sTicks[i] ?? 0) >= 8) {
          latchSeen = dur
          gnawTicks = sTicks[i] ?? 0
          releaseScarab(i)
          continue
        }
        while ((sGnaw[i] ?? 0) >= row.gnawEvery) {
          sGnaw[i] = (sGnaw[i] ?? 0) - row.gnawEvery
          const hit = hitSlot(horde, slot, row.gnaw, might, ctx, true)
          if (hit > 0) sTicks[i] = (sTicks[i] ?? 0) + 1
          fx.hit(sx[i] ?? 0, sz[i] ?? 0, false)
        }
        continue
      }
      sRetarget[i] = (sRetarget[i] ?? 0) - dt
      if ((sRetarget[i] ?? 0) <= 0 && sMode[i] === 0) {
        sRetarget[i] = row.retarget
        sRetargets[i] = (sRetargets[i] ?? 0) + 1
        const cur = sTarget[i] ?? -1
        if (cur < 0 || !horde.living(cur)) sTarget[i] = nearest(horde, sx[i] ?? px, sz[i] ?? pz, 14, -1, QS)
      }
      const slot = sTarget[i] ?? -1
      let tx = (sx[i] ?? 0) + (svx[i] ?? 0)
      let tz = (sz[i] ?? 0) + (svz[i] ?? 0)
      if (slot === -2 && horde.bossAt) {
        tx = horde.bossAt.x
        tz = horde.bossAt.z
      } else if (slot >= 0 && horde.living(slot)) {
        tx = horde.x[slot] ?? tx
        tz = horde.z[slot] ?? tz
      }
      const dx = tx - (sx[i] ?? 0)
      const dz = tz - (sz[i] ?? 0)
      const dist = Math.hypot(dx, dz) || 1
      svx[i] = (svx[i] ?? 0) * 0.82 + (dx / dist) * 8 * 0.18
      svz[i] = (svz[i] ?? 0) * 0.82 + (dz / dist) * 8 * 0.18
      sx[i] = (sx[i] ?? 0) + (svx[i] ?? 0) * dt
      sz[i] = (sz[i] ?? 0) + (svz[i] ?? 0) * dt
      if (slot === -2 && horde.bossAt && dist < 0.8) {
        horde.bossHit?.(horde.bossAt.x, horde.bossAt.z, 0.6, damage * TUNING.scarab.boss, 'weapon', might, stampN++)
        releaseScarab(i)
        continue
      }
      if (slot >= 0 && dist < 0.55) landScarab(i, slot, horde, damage, might, ctx)
      if ((sAge[i] ?? 0) > 4) releaseScarab(i)
      const age = sAge[i] ?? 0
      if (age >= 0.2) {
        const hz = (sRetargets[i] ?? 0) / age
        if (hz > retargetHz) retargetHz = hz
      }
    }
  }

  function landScarab(i: number, slot: number, horde: Horde, damage: number, might: number, ctx: HordeCtx) {
    const lit = (horde.lit[slot] ?? 0) === 1
    if (!lit) {
      sMode[i] = 1
      sTarget[i] = slot
      sAge[i] = 0
      sTicks[i] = 0
      sRetargets[i] = 0
      sGnaw[i] = TUNING.scarab.gnawEvery
      return
    }
    hitSlot(horde, slot, damage, might, ctx)
    fx.hit(horde.x[slot] ?? 0, horde.z[slot] ?? 0, true)
    const left = (sHops[i] ?? 0) - 1
    sHops[i] = left
    if (left < 0) {
      releaseScarab(i)
      return
    }
    const next = nearest(horde, horde.x[slot] ?? 0, horde.z[slot] ?? 0, TUNING.scarab.hopRange, slot, QS)
    if (next < 0 || (horde.lit[next] ?? 0) !== 1) {
      releaseScarab(i)
      return
    }
    sTarget[i] = next
    sMode[i] = 0
  }

  function releaseScarab(i: number) {
    if (!sAlive[i]) return
    sAlive[i] = 0
    scarabFree.release(i)
  }

  function plantStake(px: number, pz: number, horde: Horde, mapLit: (x: number, z: number) => boolean, level: number) {
    const row = TUNING.stake
    if (stakeFree.free <= 0) return
    const n = hashQuery(px, pz, row.range, QK)
    let dense = -1
    let denseC = -1
    for (let i = 0; i < n; i++) {
      const a = QK[i] ?? -1
      if (a < 0 || !horde.living(a)) continue
      let c = 0
      const ax = horde.x[a] ?? 0
      const az = horde.z[a] ?? 0
      for (let j = 0; j < n; j++) {
        const b = QK[j] ?? -1
        if (b < 0 || !horde.living(b)) continue
        const dx = (horde.x[b] ?? 0) - ax
        const dz = (horde.z[b] ?? 0) - az
        if (dx * dx + dz * dz <= 9) c++
      }
      if (c > denseC) {
        denseC = c
        dense = a
      }
    }
    if (dense < 0) return
    const packX = horde.x[dense] ?? px
    const packZ = horde.z[dense] ?? pz
    let plantX = packX
    let plantZ = packZ
    if (!mapLit(packX, packZ)) {
      let found = false
      let best = 1e9
      for (let s = 1; s <= 4; s++) {
        const t = s / 4
        const x = packX + (px - packX) * t
        const z = packZ + (pz - packZ) * t
        const dx = x - px
        const dz = z - pz
        if (dx * dx + dz * dz > row.range * row.range) continue
        if (!mapLit(x, z)) continue
        const pd = (x - packX) * (x - packX) + (z - packZ) * (z - packZ)
        if (pd < best) {
          best = pd
          plantX = x
          plantZ = z
          found = true
        }
      }
      if (!found) return
    }
    const dx = plantX - px
    const dz = plantZ - pz
    if (dx * dx + dz * dz > row.range * row.range) return
    const id = stakeFree.acquire()
    if (id < 0) return
    kAlive[id] = 1
    kx[id] = plantX
    kz[id] = plantZ
    const life = (level >= 5 ? row.lifeL5 : row.life) * endureMul()
    kLife[id] = life
    kSun[id] = mapLit(plantX, plantZ) ? 1 : 0
    kBlade[id] = 0
    kRing[id] = 0
    kLen[id] = 0
  }

  function refreshStakes(mapLit: (x: number, z: number) => boolean, shadow: (out: ShadowDir) => void) {
    for (let i = 0; i < STAKES; i++) {
      if (!kAlive[i]) continue
      const sun = mapLit(kx[i] ?? 0, kz[i] ?? 0)
      kSun[i] = sun ? 1 : 0
      if (!sun) {
        kLen[i] = 0
        continue
      }
      shadow(shade)
      const len = shade.length * reachMul()
      kDx[i] = shade.dirX
      kDz[i] = shade.dirZ
      kLen[i] = len
      stakeLen = len
      stakeSun = 1
    }
  }

  function stepStakes(dt: number, px: number, pz: number, horde: Horde, level: number, haste: number, might: number, mapLit: (x: number, z: number) => boolean, shadow: (out: ShadowDir) => void, ctx: HordeCtx) {
    shownStake = level
    if (level <= 0) return
    const row = TUNING.stake
    let blade: number = row.bladeDamage
    let ring: number = row.ringDamage
    let strike: number = row.strike
    let width: number = row.width
    const cap = level >= 3 ? row.maxL3 : row.max
    if (level >= 2) {
      blade += row.levelBlade
      ring += row.levelRing
    }
    if (level >= 4) strike = row.strikeL4
    if (level >= 5) {
      blade += row.masterDamage
      width *= row.widthL5
    }
    let alive = 0
    for (let i = 0; i < STAKES; i++) if (kAlive[i]) alive++
    stakeCd -= dt
    if (stakeCd <= 0 && alive < cap) {
      stakeCd = row.plant * hasteMul(haste)
      plantStake(px, pz, horde, mapLit, level)
    }
    refreshStakes(mapLit, shadow)
    const reach = reachMul()
    for (let i = 0; i < STAKES; i++) {
      if (!kAlive[i]) continue
      kLife[i] = (kLife[i] ?? 0) - dt
      if ((kLife[i] ?? 0) <= 0) {
        kAlive[i] = 0
        stakeFree.release(i)
        continue
      }
      if (kSun[i]) {
        kBlade[i] = (kBlade[i] ?? 0) - dt
        const len = kLen[i] ?? 0
        const x0 = kx[i] ?? 0
        const z0 = kz[i] ?? 0
        const x1 = x0 + (kDx[i] ?? 0) * len
        const z1 = z0 + (kDz[i] ?? 0) * len
        if ((kBlade[i] ?? 0) <= 0) {
          kBlade[i] = strike * hasteMul(haste)
          const n = hashQuery((x0 + x1) * 0.5, (z0 + z1) * 0.5, len * 0.5 + row.hit, QK)
          const hit2 = row.hit * row.hit
          for (let k = 0; k < n; k++) {
            const slot = QK[k] ?? -1
            if (slot < 0 || !horde.living(slot)) continue
            if (segDist2(x0, z0, x1, z1, horde.x[slot] ?? 0, horde.z[slot] ?? 0) > hit2) continue
            const hit = hitSlot(horde, slot, blade, might, ctx)
            if (hit > 0) fx.hit(horde.x[slot] ?? x0, horde.z[slot] ?? z0, true)
          }
          horde.bossHit?.((x0 + x1) * 0.5, (z0 + z1) * 0.5, row.hit, blade * row.boss, 'weapon', might, 9000 + i * 50 + ((stampN++) % 40))
        }
        const yaw = yawFromDirection(kDx[i] ?? 0, kDz[i] ?? 1)
        fx.stakeLine((x0 + x1) * 0.5, (z0 + z1) * 0.5, yaw, Math.max(0.4, len), width)
      } else {
        kRing[i] = (kRing[i] ?? 0) - dt
        if ((kRing[i] ?? 0) <= 0) {
          kRing[i] = 1.5 * hasteMul(haste)
          const radius = row.ring * reach
          const n = hashQuery(kx[i] ?? 0, kz[i] ?? 0, radius, QK)
          const r2 = radius * radius
          for (let k = 0; k < n; k++) {
            const slot = QK[k] ?? -1
            if (slot < 0 || !horde.living(slot)) continue
            const dx = (horde.x[slot] ?? 0) - (kx[i] ?? 0)
            const dz = (horde.z[slot] ?? 0) - (kz[i] ?? 0)
            if (dx * dx + dz * dz > r2) continue
            hitSlot(horde, slot, ring, might, ctx)
          }
          fx.shock(kx[i] ?? 0, kz[i] ?? 0, radius)
          horde.bossHit?.(kx[i] ?? 0, kz[i] ?? 0, radius, ring * row.boss, 'weapon', might, 9400 + i)
        }
      }
    }
  }

  function volleyAlive(id: number): number {
    let n = 0
    for (let i = 0; i < PRISMS; i++) if (pAlive[i] && pVolley[i] === id) n++
    return n
  }

  function spawnPrism(x: number, z: number, vx: number, vz: number, bounces: number, sun: boolean, volley: number, time: number): number {
    if (prismFree.used >= TUNING.prism.alive) return -1
    const id = prismFree.acquire()
    if (id < 0) return -1
    pAlive[id] = 1
    pxA[id] = x
    pzA[id] = z
    const sp = sun ? TUNING.prism.sunSpeed : TUNING.prism.shadeSpeed
    const len = Math.hypot(vx, vz) || 1
    pvx[id] = (vx / len) * sp
    pvz[id] = (vz / len) * sp
    pBounce[id] = bounces
    pLit[id] = sun ? 1 : 0
    pKnown[id] = 1
    pLitT[id] = time
    pVolley[id] = volley
    pLast[id] = -1
    pHome[id] = -1
    pHomeT[id] = 0
    pSerial[id] = stampN++
    pChecks[id] = 0
    pAge[id] = 0
    prismSpeed = sp
    const used = prismFree.used
    if (used > prismPeakN) prismPeakN = used
    return id
  }

  function dropPrism(i: number) {
    if (!pAlive[i]) return
    pAlive[i] = 0
    prismFree.release(i)
  }

  function stepPrisms(dt: number, px: number, pz: number, horde: Horde, level: number, multi: number, haste: number, might: number, mapLit: (x: number, z: number) => boolean, ctx: HordeCtx, time: number) {
    shownPrism = level
    if (level <= 0) return
    const row = TUNING.prism
    let damage: number = row.damage
    let bounces: number = row.bounces
    let cooldown: number = row.cooldown
    let cap: number = row.split
    if (level >= 2) damage += row.levelDamage
    if (level >= 3) bounces = row.bouncesL3
    if (level >= 4) cooldown = row.cooldownL4
    if (level >= 5) {
      damage += row.masterDamage
      cap = row.splitL5
    }
    const extra = multi > 2 ? 2 : multi
    prismCd -= dt
    if (prismCd <= 0) {
      prismCd = cooldown * hasteMul(haste)
      const id = volleyId++
      const boss = horde.bossAt
      const bornLit = mapLit(px, pz)
      let aimX = 1
      let aimZ = 0
      banN = 0
      if (boss && bossIn(horde, px, pz, 16)) {
        aimX = boss.x - px
        aimZ = boss.z - pz
      } else {
        const slot = nearest(horde, px, pz, 16, -1, QP)
        if (slot >= 0) {
          aimX = (horde.x[slot] ?? px) - px
          aimZ = (horde.z[slot] ?? pz) - pz
          ban[banN++] = slot
        }
      }
      spawnPrism(px, pz, aimX, aimZ, bounces, bornLit, id, time)
      for (let e = 0; e < extra; e++) {
        if (volleyAlive(id) >= cap) break
        const slot = nearest(horde, px, pz, 16, -1, QP)
        if (slot < 0) break
        spawnPrism(px, pz, (horde.x[slot] ?? px) - px, (horde.z[slot] ?? pz) - pz, bounces, bornLit, id, time)
        if (banN < ban.length) ban[banN++] = slot
      }
      banN = 0
    }
    const turn = (row.turn * Math.PI) / 180
    for (let i = 0; i < PRISMS; i++) {
      if (!pAlive[i]) continue
      pAge[i] = (pAge[i] ?? 0) + dt
      if (time - (pLitT[i] ?? 0) >= row.litStep) {
        const next = mapLit(pxA[i] ?? 0, pzA[i] ?? 0)
        pChecks[i] = (pChecks[i] ?? 0) + 1
        const was = (pLit[i] ?? 0) === 1
        if (pKnown[i] && next !== was) {
          splits++
          if (volleyAlive(pVolley[i] ?? 0) < cap) {
            const ang = Math.atan2(pvz[i] ?? 0, pvx[i] ?? 1) + 0.7
            spawnPrism(pxA[i] ?? 0, pzA[i] ?? 0, Math.cos(ang), Math.sin(ang), pBounce[i] ?? 0, next, pVolley[i] ?? 0, time)
            fx.prismFlash(pxA[i] ?? 0, pzA[i] ?? 0)
          }
        }
        pLit[i] = next ? 1 : 0
        pKnown[i] = 1
        pLitT[i] = time
        const sp = next ? row.sunSpeed : row.shadeSpeed
        const len = Math.hypot(pvx[i] ?? 0, pvz[i] ?? 0) || 1
        pvx[i] = ((pvx[i] ?? 0) / len) * sp
        pvz[i] = ((pvz[i] ?? 0) / len) * sp
        prismSpeed = sp
      }
      const age = pAge[i] ?? 0
      const hz = (pChecks[i] ?? 0) / Math.max(0.25, age)
      if (age >= 0.25 && hz > litHz) litHz = hz
      const sun = (pLit[i] ?? 0) === 1
      if (!sun) {
        pHomeT[i] = (pHomeT[i] ?? 0) - dt
        if ((pHomeT[i] ?? 0) <= 0) {
          pHomeT[i] = 0.2
          pHome[i] = nearest(horde, pxA[i] ?? 0, pzA[i] ?? 0, 10, -1, QP)
        }
        const home = pHome[i] ?? -1
        if (home >= 0 && horde.living(home)) {
          const want = Math.atan2((horde.z[home] ?? 0) - (pzA[i] ?? 0), (horde.x[home] ?? 0) - (pxA[i] ?? 0))
          let ang = Math.atan2(pvz[i] ?? 0, pvx[i] ?? 1)
          let d = want - ang
          if (d > Math.PI) d -= Math.PI * 2
          if (d < -Math.PI) d += Math.PI * 2
          const max = turn * dt
          if (d > max) d = max
          if (d < -max) d = -max
          ang += d
          const sp = row.shadeSpeed
          pvx[i] = Math.cos(ang) * sp
          pvz[i] = Math.sin(ang) * sp
        }
      }
      const ox = pxA[i] ?? 0
      const oz = pzA[i] ?? 0
      const nx = ox + (pvx[i] ?? 0) * dt
      const nz = oz + (pvz[i] ?? 0) * dt
      const last = pLast[i] ?? -1
      if (last >= 0) {
        const dx = ox - (horde.x[last] ?? ox)
        const dz = oz - (horde.z[last] ?? oz)
        if (dx * dx + dz * dz > 1.4) pLast[i] = -1
      }
      const qn = hashQuery((ox + nx) * 0.5, (oz + nz) * 0.5, 1.2, QP)
      for (let k = 0; k < qn; k++) {
        const slot = QP[k] ?? -1
        if (slot < 0 || slot === (pLast[i] ?? -2) || !horde.living(slot)) continue
        if (segDist2(ox, oz, nx, nz, horde.x[slot] ?? 0, horde.z[slot] ?? 0) > 0.36) continue
        const hit = hitSlot(horde, slot, damage, might, ctx)
        pLast[i] = slot
        if (hit > 0) fx.hit(horde.x[slot] ?? nx, horde.z[slot] ?? nz, sun)
        if (!sun) {
          const nnx = ox - (horde.x[slot] ?? ox)
          const nnz = oz - (horde.z[slot] ?? oz)
          const plen = Math.hypot(nnx, nnz) || 1
          const ux = nnx / plen
          const uz = nnz / plen
          const dot = (pvx[i] ?? 0) * ux + (pvz[i] ?? 0) * uz
          const sp = row.shadeSpeed
          const rx = (pvx[i] ?? 0) - 2 * dot * ux
          const rz = (pvz[i] ?? 0) - 2 * dot * uz
          const rl = Math.hypot(rx, rz) || 1
          pvx[i] = (rx / rl) * sp
          pvz[i] = (rz / rl) * sp
          pBounce[i] = (pBounce[i] ?? 0) - 1
          if ((pBounce[i] ?? 0) < 0) {
            dropPrism(i)
            break
          }
        }
      }
      if (!pAlive[i]) continue
      horde.bossHit?.(nx, nz, 0.45, damage * row.boss, 'weapon', might, pSerial[i] ?? 1)
      const slid = resolveCircle(nx, nz, 0.2)
      const sx0 = slid.x
      const sz0 = slid.z
      if (sx0 !== nx || sz0 !== nz || segmentBlocked(ox, oz, nx, nz)) {
        const pushX = sx0 - nx
        const pushZ = sz0 - nz
        const plen = Math.hypot(pushX, pushZ) || 1
        const ux = plen > 0.0001 ? pushX / plen : -(pvx[i] ?? 1)
        const uz = plen > 0.0001 ? pushZ / plen : -(pvz[i] ?? 0)
        const dot = (pvx[i] ?? 0) * ux + (pvz[i] ?? 0) * uz
        const sp = sun ? row.sunSpeed : row.shadeSpeed
        const rx = (pvx[i] ?? 0) - 2 * dot * ux
        const rz = (pvz[i] ?? 0) - 2 * dot * uz
        const rl = Math.hypot(rx, rz) || 1
        pvx[i] = (rx / rl) * sp
        pvz[i] = (rz / rl) * sp
        pxA[i] = sx0
        pzA[i] = sz0
        pBounce[i] = (pBounce[i] ?? 0) - 1
        if ((pBounce[i] ?? 0) < 0) dropPrism(i)
      } else {
        pxA[i] = nx
        pzA[i] = nz
      }
      if ((pAge[i] ?? 0) > 6) dropPrism(i)
    }
  }

  return {
    mark(mapLit, shadow) {
      refreshStakes(mapLit, shadow)
    },
    update(dt, px, pz, horde, helio, scarab, stake, prism, multitude, haste, might, mapLit, shadow, ctx, time) {
      const t0 = performance.now()
      stepHelio(dt, px, pz, horde, helio, multitude, haste, might, mapLit, ctx, time)
      cpuH += performance.now() - t0
      const t1 = performance.now()
      stepScarabs(dt, px, pz, horde, scarab, multitude, haste, might, ctx)
      cpuS += performance.now() - t1
      const t2 = performance.now()
      stepStakes(dt, px, pz, horde, stake, haste, might, mapLit, shadow, ctx)
      cpuK += performance.now() - t2
      const t3 = performance.now()
      stepPrisms(dt, px, pz, horde, prism, multitude, haste, might, mapLit, ctx, time)
      cpuP += performance.now() - t3
    },
    sync(px, pz, helio, scarab, stake, prism, time) {
      if (helio > 0) {
        arsenal.add({ kind: ARSENAL_PART.mirror, x: mirrorX || px + 0.55, y: 1.7, z: mirrorZ || pz, yaw: mirrorYaw, scale: reachMul(), hot: bank > 0 ? 1 : 0, swing: 0 })
        for (let i = 0; i < bank; i++) {
          const a = (i / Math.max(1, bank)) * Math.PI * 2
          fx.glint((mirrorX || px) + Math.cos(a) * 0.42, 1.75, (mirrorZ || pz) + Math.sin(a) * 0.42, 0.18)
        }
        probeAdd({
          kind: 'heliograph',
          level: shownHelio,
          x: mirrorX || px + 0.55,
          y: 1.7,
          z: mirrorZ || pz,
          rimX: (mirrorX || px) + 0.5,
          rimY: 1.7,
          rimZ: mirrorZ || pz,
          floorX: (mirrorX || px) + 0.85,
          floorY: 0.02,
          floorZ: mirrorZ || pz,
        })
      }
      if (scarab > 0) {
        for (let i = 0; i < SCARABS; i++) {
          if (!sAlive[i]) continue
          const yaw = yawFromDirection(svx[i] ?? 0, svz[i] ?? 1) + Math.PI
          arsenal.add({ kind: ARSENAL_PART.scarab, x: sx[i] ?? 0, y: 0.45, z: sz[i] ?? 0, yaw, scale: 1, hot: 0, swing: time * 14 })
          if (i === 0 || (sMode[i] ?? 0) === 0) {
            probeAdd({
              kind: 'scarablight',
              level: shownScarab,
              x: sx[i] ?? 0,
              y: 0.55,
              z: (sz[i] ?? 0) + 0.1,
              rimX: (sx[i] ?? 0) + 0.32,
              rimY: 0.45,
              rimZ: sz[i] ?? 0,
              floorX: (sx[i] ?? 0) + 0.5,
              floorY: 0.02,
              floorZ: sz[i] ?? 0,
            })
          }
        }
      }
      if (stake > 0) {
        for (let i = 0; i < STAKES; i++) {
          if (!kAlive[i]) continue
          arsenal.add({ kind: ARSENAL_PART.stake, x: kx[i] ?? 0, y: 0, z: kz[i] ?? 0, yaw: yawFromDirection(kDx[i] ?? 0, kDz[i] ?? 1), scale: 1, hot: kSun[i] ? 1 : 0, swing: 0 })
          probeAdd({
            kind: 'stakes',
            level: shownStake,
            x: kx[i] ?? 0,
            y: 1.9,
            z: kz[i] ?? 0,
            rimX: (kx[i] ?? 0) + 0.14,
            rimY: 0.4,
            rimZ: kz[i] ?? 0,
            floorX: (kx[i] ?? 0) + 0.45,
            floorY: 0.02,
            floorZ: kz[i] ?? 0,
          })
        }
      }
      if (prism > 0) {
        const scale = reachMul()
        for (let i = 0; i < PRISMS; i++) {
          if (!pAlive[i]) continue
          arsenal.add({ kind: ARSENAL_PART.prism, x: pxA[i] ?? 0, y: 0.9, z: pzA[i] ?? 0, yaw: time * 2 + i, scale, hot: 1, swing: 0 })
          probeAdd({
            kind: 'prism',
            level: shownPrism,
            x: pxA[i] ?? 0,
            y: 0.9,
            z: pzA[i] ?? 0,
            rimX: (pxA[i] ?? 0) + 0.32 * scale,
            rimY: 0.9,
            rimZ: pzA[i] ?? 0,
            floorX: (pxA[i] ?? 0) + 0.55 * scale,
            floorY: 0.02,
            floorZ: pzA[i] ?? 0,
          })
        }
      }
    },
    clear() {
      footSun = false
      footKnown = false
      footHold = 0
      helioCd = 0
      bank = 0
      bankAcc = 0
      weakCd = 0
      spendCd = 0
      helioGap = 0
      helioHits = 0
      lastHelio = -1
      scarabFree.reset()
      sAlive.fill(0)
      scarabCd = 0
      scarabWave = 0
      gnawTicks = 0
      latchSeen = 0
      retargetHz = 0
      stakeFree.reset()
      kAlive.fill(0)
      stakeCd = 0
      stakeLen = 0
      stakeSun = 0
      prismFree.reset()
      pAlive.fill(0)
      prismCd = 0
      prismPeakN = 0
      prismSpeed = 0
      litHz = 0
      splits = 0
    },
    lights(x, z) {
      for (let i = 0; i < STAKES; i++) {
        if (!kAlive[i] || !kSun[i]) continue
        const len = kLen[i] ?? 0
        if (len <= 0) continue
        const x0 = kx[i] ?? 0
        const z0 = kz[i] ?? 0
        const x1 = x0 + (kDx[i] ?? 0) * len
        const z1 = z0 + (kDz[i] ?? 0) * len
        if (segDist2(x0, z0, x1, z1, x, z) <= TUNING.stake.hit * TUNING.stake.hit) return true
      }
      return false
    },
    cpu: () => ({ helio: cpuH, scarab: cpuS, stake: cpuK, prism: cpuP }),
    resetCpu() {
      cpuH = 0
      cpuS = 0
      cpuK = 0
      cpuP = 0
    },
    prismPeak: () => prismPeakN,
    sample: () => ({
      bank,
      helioGap,
      helioHits,
      scarabWave,
      gnawTicks,
      latchSeen,
      stakeLen,
      stakeSun,
      prismSpeed,
      prismPeak: prismPeakN,
      litHz,
      retargetHz,
      splits,
    }),
  }
}
