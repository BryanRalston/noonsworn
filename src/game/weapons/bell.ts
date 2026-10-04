import { TUNING } from '../../data/tuning'
import { mulberry32 } from '../../core/rng'
import { hasteMul } from '../sunClock'
import { hashQuery } from '../spatialHash'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import { probeAdd } from './probe'
import type { Horde, HordeCtx } from '../enemies/horde'
import type { WeaponFx } from './fx'

const QUERY = new Int16Array(48)

export interface BellStats {
  cooldown: number
  tolls: number
  tollDamage: number
  tollRadius: number
  height: number
}

export function bellStats(level: number): BellStats {
  const row = TUNING.bell
  let cooldown: number = row.cooldown
  let tolls: number = row.tolls
  let tollDamage: number = row.tollDamage
  let tollRadius: number = row.tollRadius
  let height: number = row.height
  if (level >= 2) tollDamage += row.levelTollDamage
  if (level >= 3) tollRadius += row.levelTollRadius
  if (level >= 4) cooldown -= row.levelCooldown
  if (level >= 5) {
    tolls = row.tollsL5
    tollDamage += row.masterTollDamage
    height = row.heightL5
  }
  return { cooldown, tolls, tollDamage, tollRadius, height }
}

export function bellText(level: number): string {
  if (level <= 0) return 'A bell drops on the pack and tolls. Sun pulls them in; shade drives them back.'
  if (level === 1) return 'L2: +4 damage per toll'
  if (level === 2) return 'L3: wider tolls'
  if (level === 3) return 'L4: faster drops'
  if (level === 4) return 'L5: a fourth toll and a larger bell'
  return 'Noon Bell is mastered'
}

export function bellCandidates(px: number, pz: number): { x: number; z: number }[] {
  const step = TUNING.bell.sample
  const out: { x: number; z: number }[] = []
  for (let iz = -1; iz <= 1; iz++) {
    for (let ix = -1; ix <= 1; ix++) out.push({ x: px + ix * step, z: pz + iz * step })
  }
  return out
}

/** Densest of the 9 samples. An empty court targets Sela. */
export function pickBell(px: number, pz: number, countAt: (x: number, z: number) => number): { x: number; z: number } {
  const spots = bellCandidates(px, pz)
  let best = 0
  let bestD = 1e9
  let bx = px
  let bz = pz
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]
    if (!s) continue
    const n = countAt(s.x, s.z)
    const d = (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz)
    if (n > best || (n === best && n > 0 && d < bestD)) {
      best = n
      bestD = d
      bx = s.x
      bz = s.z
    }
  }
  if (best <= 0) return { x: px, z: pz }
  return { x: bx, z: bz }
}

/** Offline densest-pack check. Returns how many of 50 trials land within one sample of the brute point. */
export function bellPackHits(): number {
  const rng = mulberry32(7)
  const reach = TUNING.bell.query
  const r2 = reach * reach
  let ok = 0
  for (let trial = 0; trial < 50; trial++) {
    const pts: { x: number; z: number }[] = []
    const n = 8 + ((rng() * 16) | 0)
    for (let i = 0; i < n; i++) pts.push({ x: rng() * 18 - 9, z: rng() * 18 - 9 })
    const countAt = (x: number, z: number) => {
      let c = 0
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        if (!p) continue
        const dx = p.x - x
        const dz = p.z - z
        if (dx * dx + dz * dz <= r2) c++
      }
      return c
    }
    const pick = pickBell(0, 0, countAt)
    let best = -1
    let bx = 0
    let bz = 0
    for (let z = -9; z <= 9; z += 0.5) {
      for (let x = -9; x <= 9; x += 0.5) {
        const c = countAt(x, z)
        if (c > best) {
          best = c
          bx = x
          bz = z
        }
      }
    }
    if (Math.hypot(pick.x - bx, pick.z - bz) <= TUNING.bell.sample + 1e-3) ok++
  }
  return ok
}

export interface Bell {
  cooldown: number
  update: (
    dt: number,
    px: number,
    pz: number,
    horde: Horde,
    level: number,
    haste: number,
    might: number,
    mapLit: (x: number, z: number) => boolean,
    ctx: HordeCtx,
    onToll: () => void,
  ) => void
  sync: () => void
  clear: () => void
  show: (px: number, pz: number, level: number) => void
  pose: () => { phase: string; phaseT: number; y: number; x: number; z: number; tollsLeft: number; sun: boolean; cooldown: number }
}

export function createBell(fx: WeaponFx, arsenal: Arsenal): Bell {
  let phase: 'idle' | 'fall' | 'toll' | 'lift' = 'idle'
  let phaseT = 0
  let tx = 0
  let tz = 0
  let tollsLeft = 0
  let tollGap = 0
  let sun = true
  let height: number = TUNING.bell.height
  let shownLevel = 1
  let tollDamage: number = TUNING.bell.tollDamage
  let tollRadius: number = TUNING.bell.tollRadius
  let y = 0
  let swing = 0
  let stamp = 80
  const bell: Bell = {
    cooldown: TUNING.bell.cooldown,
    clear() {
      phase = 'idle'
      bell.cooldown = TUNING.bell.cooldown
      y = 0
    },
    pose() {
      return { phase, phaseT, y, x: tx, z: tz, tollsLeft, sun, cooldown: bell.cooldown }
    },
    show(px, pz, level) {
      const stats = bellStats(Math.max(1, level))
      fx.shadowDisc(px, pz, 1.6, 0.4)
      fx.shock(px, pz, stats.tollRadius)
    },
    sync() {
      if (phase === 'idle') return
      const scale = height / TUNING.bell.body
      arsenal.add({
        kind: ARSENAL_PART.bell,
        x: tx,
        y,
        z: tz,
        yaw: 0,
        scale,
        hot: 0,
        swing: 0,
      })
      arsenal.add({
        kind: ARSENAL_PART.clapper,
        x: tx,
        y,
        z: tz,
        yaw: 0,
        scale,
        hot: 0,
        swing,
      })
      const coreY = y + 0.55 * scale
      probeAdd({
        kind: 'bell',
        level: shownLevel,
        x: tx,
        y: coreY,
        z: tz + 0.22 * scale,
        rimX: tx + 0.46 * scale,
        rimY: y + 0.02 * scale,
        rimZ: tz,
        floorX: tx + 0.7 * scale,
        floorY: 0.02,
        floorZ: tz,
      })
    },
    update(dt, px, pz, horde, level, haste, might, mapLit, ctx, onToll) {
      shownLevel = level
      if (phase === 'fall') {
        phaseT += dt
        const u = Math.min(1, phaseT / TUNING.bell.fall)
        y = TUNING.bell.drop * (1 - u)
        if (u >= 1) {
          y = 0
          phase = 'toll'
          phaseT = 0
          tollGap = 0
          slam(horde, might, ctx)
        }
        return
      }
      if (phase === 'lift') {
        phaseT += dt
        y = TUNING.bell.drop * Math.min(1, phaseT / TUNING.bell.lift)
        swing *= 0.9
        if (phaseT >= TUNING.bell.lift) phase = 'idle'
        return
      }
      if (phase === 'toll') {
        swing = Math.sin(phaseT * 14) * 0.7
        phaseT += dt
        tollGap -= dt
        if (tollGap <= 0) {
          toll(horde, might, ctx, onToll)
          tollsLeft--
          tollGap = TUNING.bell.tollGap
          if (tollsLeft <= 0) {
            phase = 'lift'
            phaseT = 0
          }
        }
        return
      }
      if (level <= 0) return
      bell.cooldown -= dt
      if (bell.cooldown > 0) return
      const stats = bellStats(level)
      bell.cooldown = stats.cooldown * hasteMul(haste)
      const spot = pickBell(px, pz, (x, z) => crowd(horde, x, z))
      tx = spot.x
      tz = spot.z
      height = stats.height
      tollDamage = stats.tollDamage
      tollRadius = stats.tollRadius
      tollsLeft = stats.tolls
      sun = mapLit(tx, tz)
      phase = 'fall'
      phaseT = 0
      y = TUNING.bell.drop
      fx.shadowDisc(tx, tz, 1.6, TUNING.bell.fall)
    },
  }
  return bell

  function crowd(horde: Horde, x: number, z: number): number {
    const n = hashQuery(x, z, TUNING.bell.query, QUERY)
    let c = 0
    const r2 = TUNING.bell.query * TUNING.bell.query
    for (let k = 0; k < n; k++) {
      const slot = QUERY[k] ?? -1
      if (slot < 0 || !horde.alive[slot]) continue
      const dx = (horde.x[slot] ?? 0) - x
      const dz = (horde.z[slot] ?? 0) - z
      if (dx * dx + dz * dz <= r2) c++
    }
    return c
  }

  function hurt(horde: Horde, x: number, z: number, radius: number, amount: number, might: number, ctx: HordeCtx) {
    const n = hashQuery(x, z, radius, QUERY)
    const r2 = radius * radius
    for (let k = 0; k < n; k++) {
      const slot = QUERY[k] ?? -1
      if (slot < 0 || !horde.alive[slot]) continue
      const dx = (horde.x[slot] ?? 0) - x
      const dz = (horde.z[slot] ?? 0) - z
      if (dx * dx + dz * dz > r2) continue
      const hit = horde.damage(slot, amount, 'weapon', might)
      if (hit === 2) horde.slay(slot, ctx)
    }
    stamp = (stamp + 1) % 1000
    horde.bossHit?.(x, z, radius, amount * TUNING.bell.boss, 'weapon', might, 500 + stamp)
  }

  function slam(horde: Horde, might: number, ctx: HordeCtx) {
    hurt(horde, tx, tz, TUNING.bell.slamRadius, TUNING.bell.slam, might, ctx)
    fx.shock(tx, tz, TUNING.bell.slamRadius)
    fx.dust(tx, tz)
  }

  function toll(horde: Horde, might: number, ctx: HordeCtx, onToll: () => void) {
    hurt(horde, tx, tz, tollRadius, tollDamage, might, ctx)
    fx.shock(tx, tz, tollRadius)
    onToll()
    if (sun) horde.pullTo(tx, tz, tollRadius, TUNING.bell.pull)
    else {
      const n = hashQuery(tx, tz, tollRadius, QUERY)
      const r2 = tollRadius * tollRadius
      const hit: number[] = []
      for (let k = 0; k < n; k++) {
        const slot = QUERY[k] ?? -1
        if (slot < 0 || !horde.alive[slot]) continue
        const dx = (horde.x[slot] ?? 0) - tx
        const dz = (horde.z[slot] ?? 0) - tz
        if (dx * dx + dz * dz > r2) continue
        hit.push(slot)
      }
      for (let i = 0; i < hit.length; i++) {
        const slot = hit[i] ?? -1
        horde.staggerFor(slot, TUNING.bell.daze)
        horde.slow(horde.x[slot] ?? tx, horde.z[slot] ?? tz, 0.2, TUNING.bell.slow)
      }
      horde.knockFrom(tx, tz, tollRadius, TUNING.bell.push)
    }
  }
}
