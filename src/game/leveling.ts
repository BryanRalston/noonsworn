import type { Rng } from '../core/rng'
import { TUNING } from '../data/tuning'
import { haloText } from './weapons/halo'
import { spearText } from './weapons/sunspear'

export interface Build {
  level: number
  xp: number
  pending: number
  spear: number
  halo: number
  might: number
  haste: number
  swift: number
  vitality: number
  lodestone: number
  wide: number
  flare: number
  bell: number
  longday: number
  searing: number
}

export interface Card {
  id: number
  name: string
  text: string
  from: string
  to: string
}

export const CARD = {
  spear: 0,
  halo: 1,
  might: 2,
  haste: 3,
  swift: 4,
  vitality: 5,
  lodestone: 6,
  wide: 7,
  heal: 8,
  flare: 9,
  bell: 10,
  longday: 11,
  searing: 12,
} as const

export function createBuild(): Build {
  return { level: 1, xp: 0, pending: 0, spear: 1, halo: 0, might: 0, haste: 0, swift: 0, vitality: 0, lodestone: 0, wide: 0, flare: 0, bell: 0, longday: 0, searing: 0 }
}

export function xpToNext(level: number): number {
  if (level <= 1) return TUNING.xp.early1
  if (level === 2) return TUNING.xp.early2
  if (level === 3) return TUNING.xp.early3
  return Math.round(TUNING.xp.base + TUNING.xp.lin * level + TUNING.xp.quad * level * level)
}

const pool = new Int32Array(16)

export function rollCards(build: Build, rng: Rng, out: Card[]): number {
  let n = 0
  if (build.spear < TUNING.passive.max) pool[n++] = CARD.spear
  if (build.halo < TUNING.passive.max) pool[n++] = CARD.halo
  if (build.might < TUNING.passive.max) pool[n++] = CARD.might
  if (build.haste < TUNING.passive.max) pool[n++] = CARD.haste
  if (build.swift < TUNING.passive.max) pool[n++] = CARD.swift
  if (build.vitality < TUNING.passive.max) pool[n++] = CARD.vitality
  if (build.lodestone < TUNING.passive.max) pool[n++] = CARD.lodestone
  if (build.wide < TUNING.wideMax) pool[n++] = CARD.wide
  if (build.level >= 4) {
    if (build.flare < TUNING.passive.max) pool[n++] = CARD.flare
    if (build.bell < TUNING.passive.max) pool[n++] = CARD.bell
    if (build.longday < TUNING.passive.max) pool[n++] = CARD.longday
    if (build.searing < TUNING.passive.max) pool[n++] = CARD.searing
  }
  if (n === 0) pool[n++] = CARD.heal
  for (let i = n - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = pool[i] ?? 0
    pool[i] = pool[j] ?? 0
    pool[j] = tmp
  }
  if (build.halo === 0 && build.level <= 2) {
    let found = -1
    for (let i = 0; i < n; i++) if (pool[i] === CARD.halo) found = i
    if (found > 2) {
      const tmp = pool[0] ?? 0
      pool[0] = CARD.halo
      pool[found] = tmp
    }
  }
  const take = Math.min(3, n)
  for (let i = 0; i < 3; i++) {
    const id = i < take ? (pool[i] ?? CARD.heal) : CARD.heal
    out[i] = describe(build, id)
  }
  return 3
}

function rank(level: number, max: number): string {
  return level <= 0 ? 'new' : `${level}/${max}`
}

export function describe(build: Build, id: number): Card {
  if (id === CARD.spear) {
    return { id, name: 'Sunspear', text: spearText(build.spear), from: rank(build.spear, 5), to: rank(build.spear + 1, 5) }
  }
  if (id === CARD.halo) {
    return { id, name: 'Halo Discs', text: haloText(build.halo), from: rank(build.halo, 5), to: rank(build.halo + 1, 5) }
  }
  if (id === CARD.might) {
    return { id, name: 'Might', text: '+10% damage', from: rank(build.might, 5), to: rank(build.might + 1, 5) }
  }
  if (id === CARD.haste) {
    return { id, name: 'Haste', text: '−8% cooldowns', from: rank(build.haste, 5), to: rank(build.haste + 1, 5) }
  }
  if (id === CARD.swift) {
    return { id, name: 'Swiftness', text: '+7% move speed', from: rank(build.swift, 5), to: rank(build.swift + 1, 5) }
  }
  if (id === CARD.vitality) {
    return { id, name: 'Vitality', text: '+20 max HP and heal 20', from: rank(build.vitality, 5), to: rank(build.vitality + 1, 5) }
  }
  if (id === CARD.lodestone) {
    return { id, name: 'Lodestone', text: '+25% pickup radius', from: rank(build.lodestone, 5), to: rank(build.lodestone + 1, 5) }
  }
  if (id === CARD.wide) {
    return { id, name: 'Wide Noon', text: 'the sun\'s beam gets wider', from: `${build.wide}/2`, to: `${build.wide + 1}/2` }
  }
  if (id === CARD.flare) {
    return { id, name: 'Solar Flare', text: 'A sun burst every 6s, doubled in light', from: rank(build.flare, 5), to: rank(Math.min(5, build.flare + 1), 5) }
  }
  if (id === CARD.bell) {
    return { id, name: 'Noon Bell', text: 'A toll slows nearby shade', from: rank(build.bell, 5), to: rank(Math.min(5, build.bell + 1), 5) }
  }
  if (id === CARD.longday) {
    return { id, name: 'Long Day', text: 'The sun turns 12% slower', from: rank(build.longday, 5), to: rank(Math.min(5, build.longday + 1), 5) }
  }
  if (id === CARD.searing) {
    return { id, name: 'Searing Light', text: 'Lit enemies burn for 2s', from: rank(build.searing, 5), to: rank(Math.min(5, build.searing + 1), 5) }
  }
  return { id: CARD.heal, name: 'Heal 30', text: 'Restore 30 HP', from: 'now', to: '+30' }
}

export function grantXp(build: Build, amount: number) {
  build.xp += amount
  let guard = 0
  while (build.xp >= xpToNext(build.level) && guard++ < 12) {
    build.xp -= xpToNext(build.level)
    build.level += 1
    build.pending += 1
  }
}
