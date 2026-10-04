import { TUNING } from '../../data/tuning'
import { hasteMul } from '../sunClock'
import { hashQuery } from '../spatialHash'
import type { Horde, HordeCtx } from '../enemies/horde'
import type { WeaponFx } from './fx'
import { probeAdd } from './probe'

const QUERY = new Int16Array(48)

interface Spot {
  x: number
  z: number
  r: number
  life: number
  max: number
}

export interface FlareStats {
  damage: number
  sun: number
  shade: number
  cooldown: number
  spotLife: number
  spotMax: number
}

export function flareStats(level: number): FlareStats {
  const row = TUNING.flare
  let damage: number = row.damage
  let sun: number = row.sunRadius
  let shade: number = row.shadeRadius
  let cooldown: number = row.cooldown
  let spotLife: number = row.spotLife
  let spotMax: number = row.spotMax
  if (level >= 2) damage += row.levelDamage
  if (level >= 3) {
    sun += row.levelRadius
    shade += row.levelRadius
  }
  if (level >= 4) cooldown -= row.levelCooldown
  if (level >= 5) {
    damage += row.masterDamage
    spotLife = row.spotLifeL5
    spotMax = row.spotMaxL5
  }
  return { damage, sun, shade, cooldown, spotLife, spotMax }
}

export function flareText(level: number): string {
  if (level <= 0) return 'A sun burst every 5s. In shade it leaves a Sunspot.'
  if (level === 1) return 'L2: +6 damage'
  if (level === 2) return 'L3: +0.5 m radius'
  if (level === 3) return 'L4: faster bursts'
  if (level === 4) return 'L5: +8 damage, longer Sunspots'
  return 'Solar Flare is mastered'
}

export interface Flare {
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
  ) => void
  lights: (x: number, z: number) => boolean
  spots: () => { x: number; z: number; r: number; life: number }[]
  mark: (level: number) => void
  clear: () => void
  show: (px: number, pz: number, level: number) => void
}

export function createFlare(fx: WeaponFx): Flare {
  const spots: Spot[] = []
  let stamp = 40
  const flare: Flare = {
    cooldown: TUNING.flare.cooldown,
    clear() {
      spots.length = 0
      flare.cooldown = TUNING.flare.cooldown
    },
    lights(x, z) {
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i]
        if (!s || s.life <= 0) continue
        const dx = x - s.x
        const dz = z - s.z
        if (dx * dx + dz * dz <= s.r * s.r) return true
      }
      return false
    },
    spots() {
      return spots.map((s) => ({ x: s.x, z: s.z, r: s.r, life: s.life }))
    },
    mark(level) {
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i]
        if (!s || s.life <= 0) continue
        probeAdd({
          kind: 'sunspot',
          level,
          x: s.x,
          y: 0.05,
          z: s.z,
          rimX: s.x + s.r * 0.86,
          rimY: 0.05,
          rimZ: s.z,
          floorX: s.x + s.r + 0.35,
          floorY: 0.02,
          floorZ: s.z,
        })
      }
    },
    show(px, pz, level) {
      const stats = flareStats(Math.max(1, level))
      burstVisual(px, pz, stats.sun, level >= 5)
    },
    update(dt, px, pz, horde, level, haste, might, mapLit, ctx) {
      for (let i = spots.length - 1; i >= 0; i--) {
        const s = spots[i]
        if (!s) continue
        s.life -= dt
        if (s.life <= 0) spots.splice(i, 1)
      }
      if (level <= 0) return
      flare.cooldown -= dt
      if (flare.cooldown > 0) return
      const stats = flareStats(level)
      flare.cooldown = stats.cooldown * hasteMul(haste)
      const sun = mapLit(px, pz)
      const radius = sun ? stats.sun : stats.shade
      const n = hashQuery(px, pz, radius, QUERY)
      for (let k = 0; k < n; k++) {
        const slot = QUERY[k] ?? -1
        if (slot < 0 || !horde.alive[slot]) continue
        const ex = (horde.x[slot] ?? 0) - px
        const ez = (horde.z[slot] ?? 0) - pz
        if (ex * ex + ez * ez > radius * radius) continue
        const hit = horde.damage(slot, stats.damage, 'weapon', might)
        if (hit === 0) continue
        if (sun) horde.staggerFor(slot, TUNING.flare.stagger)
        if (hit === 2) horde.slay(slot, ctx)
      }
      stamp = (stamp + 1) % 1000
      horde.bossHit?.(px, pz, radius, stats.damage * TUNING.flare.boss, 'weapon', might, 400 + stamp)
      burstVisual(px, pz, radius, level >= 5)
      if (!sun) leaveSpot(px, pz, TUNING.flare.spotRadius, stats.spotLife, stats.spotMax)
    },
  }
  return flare

  function burstVisual(px: number, pz: number, radius: number, big: boolean) {
    fx.core(px, pz, Math.max(TUNING.flare.band, radius * 0.35))
    fx.band(px, pz, radius, 0.45)
    if (big) fx.band(px, pz, radius * 0.62, 0.4)
    fx.shock(px, pz, radius * 0.85)
    const tongues = 12
    for (let i = 0; i < tongues; i++) {
      const a = (i / tongues) * Math.PI * 2
      fx.dust(px + Math.cos(a) * radius * 0.72, pz + Math.sin(a) * radius * 0.72)
    }
  }

  function leaveSpot(x: number, z: number, r: number, life: number, max: number) {
    if (spots.length >= max) {
      let old = 0
      for (let i = 1; i < spots.length; i++) {
        if ((spots[i]?.life ?? 0) < (spots[old]?.life ?? 0)) old = i
      }
      spots.splice(old, 1)
    }
    spots.push({ x, z, r, life, max: life })
    fx.sunspot(x, z, r, life)
  }
}
