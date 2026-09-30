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
  mirage: number
  spearJump: number
  haloJump: number
  flareJump: number
  bellJump: number
}

export interface Card {
  id: number
  name: string
  text: string
  from: string
  to: string
  rank: number
  max: number
  next: number
}

/** No Seer's Eye and no Banisher meta in this build, so a run starts with neither. */
export const REROLLS = 0
export const BANISHES = 0

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
  mirage: 13,
} as const

export function createBuild(): Build {
  return {
    level: 1, xp: 0, pending: 0, spear: 1, halo: 0, might: 0, haste: 0, swift: 0, vitality: 0,
    lodestone: 0, wide: 0, flare: 0, bell: 0, longday: 0, searing: 0, mirage: 0, spearJump: 0, haloJump: 0, flareJump: 0, bellJump: 0,
  }
}

export function xpToNext(level: number): number {
  if (level <= 1) return TUNING.xp.early1
  if (level === 2) return TUNING.xp.early2
  if (level === 3) return TUNING.xp.early3
  if (level === 4) return TUNING.xp.early4
  if (level === 5) return TUNING.xp.early5
  return Math.round(TUNING.xp.base + TUNING.xp.lin * level + TUNING.xp.quad * level * level)
}

export function isSunBoon(id: number): boolean {
  return id === CARD.wide || id === CARD.longday || id === CARD.searing
}

function isWeapon(id: number): boolean {
  return id === CARD.spear || id === CARD.halo || id === CARD.flare || id === CARD.bell
}

export function rankOf(build: Build, id: number): number {
  if (id === CARD.spear) return build.spear
  if (id === CARD.halo) return build.halo
  if (id === CARD.might) return build.might
  if (id === CARD.haste) return build.haste
  if (id === CARD.swift) return build.swift
  if (id === CARD.vitality) return build.vitality
  if (id === CARD.lodestone) return build.lodestone
  if (id === CARD.wide) return build.wide
  if (id === CARD.flare) return build.flare
  if (id === CARD.bell) return build.bell
  if (id === CARD.longday) return build.longday
  if (id === CARD.searing) return build.searing
  if (id === CARD.mirage) return build.mirage
  return 0
}

function jumpUsed(build: Build, id: number): number {
  if (id === CARD.spear) return build.spearJump
  if (id === CARD.halo) return build.haloJump
  if (id === CARD.flare) return build.flareJump
  if (id === CARD.bell) return build.bellJump
  return 2
}

/** First two picks of a weapon the player already owns grant two levels. */
export function cardStep(build: Build, id: number): number {
  if (!isWeapon(id) || rankOf(build, id) <= 0 || jumpUsed(build, id) >= 2) return 1
  return 2
}

export function noteJump(build: Build, id: number, step: number) {
  if (step < 2) return
  if (id === CARD.spear) build.spearJump++
  else if (id === CARD.halo) build.haloJump++
  else if (id === CARD.flare) build.flareJump++
  else if (id === CARD.bell) build.bellJump++
}

const restPool: number[] = []
const boonPool: number[] = []

function shuffle(list: number[], rng: Rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = list[i] ?? 0
    list[i] = list[j] ?? 0
    list[j] = tmp
  }
}

/** Seeded offer. At most one Sun boon. Halo is forced into the first two levels. */
export function rollCards(build: Build, rng: Rng, out: Card[], count = 3): number {
  restPool.length = 0
  boonPool.length = 0
  const cap = TUNING.passive.max
  const add = (id: number, room: boolean) => {
    if (!room) return
    if (isSunBoon(id)) boonPool.push(id)
    else restPool.push(id)
  }
  add(CARD.spear, build.spear < cap)
  add(CARD.halo, build.halo < cap)
  add(CARD.might, build.might < cap)
  add(CARD.haste, build.haste < cap)
  add(CARD.swift, build.swift < cap)
  add(CARD.vitality, build.vitality < cap)
  add(CARD.lodestone, build.lodestone < cap)
  add(CARD.wide, build.wide < TUNING.wideMax)
  if (build.level >= 4) {
    add(CARD.flare, build.flare < cap)
    add(CARD.bell, build.bell < cap)
    add(CARD.longday, build.longday < cap)
    add(CARD.searing, build.searing < cap)
  }
  if (build.level >= TUNING.temple.cardLevel && build.mirage === 0) add(CARD.mirage, true)
  if (restPool.length + boonPool.length === 0) restPool.push(CARD.heal)
  shuffle(restPool, rng)
  shuffle(boonPool, rng)
  const wantHalo = build.halo === 0 && build.level <= 2
  if (wantHalo) {
    const at = restPool.indexOf(CARD.halo)
    if (at > 0) {
      restPool[at] = restPool[0] ?? CARD.halo
      restPool[0] = CARD.halo
    }
  }
  const need = count < 1 ? 1 : count
  const takeBoon = boonPool.length > 0 ? 1 : 0
  const ids: number[] = []
  const restTake = Math.max(0, need - takeBoon)
  for (let i = 0; i < restPool.length && ids.length < restTake; i++) ids.push(restPool[i] ?? CARD.heal)
  if (takeBoon) {
    const slot = ids.length === 0 ? 0 : (rng() * (ids.length + 1)) | 0
    ids.splice(slot, 0, boonPool[0] ?? CARD.wide)
  }
  if (wantHalo && !ids.includes(CARD.halo) && restPool.includes(CARD.halo)) ids[0] = CARD.halo
  while (ids.length < need) ids.push(CARD.heal)
  for (let i = 0; i < need; i++) out[i] = describe(build, ids[i] ?? CARD.heal)
  return need
}

export function recommendIndex(build: Build, cards: Card[], count: number): number {
  const n = Math.min(count, cards.length)
  for (let i = 0; i < n; i++) {
    const card = cards[i]
    if (!card || card.id === CARD.heal) continue
    if (rankOf(build, card.id) > 0) return i
  }
  for (let i = 0; i < n; i++) {
    const card = cards[i]
    if (card && isWeapon(card.id) && rankOf(build, card.id) <= 0) return i
  }
  return 0
}

function cardOf(build: Build, id: number, name: string, text: string, max: number): Card {
  const rank = rankOf(build, id)
  const step = cardStep(build, id)
  const next = Math.min(max, rank + step)
  const from = rank <= 0 ? 'new' : `${rank}/${max}`
  const line = step > 1 ? `${text} (+2 levels)` : text
  return { id, name, text: line, from, to: `${next}/${max}`, rank, max, next }
}

export function describe(build: Build, id: number): Card {
  if (id === CARD.spear) return cardOf(build, id, 'Sunspear', spearText(build.spear), 5)
  if (id === CARD.halo) return cardOf(build, id, 'Halo Discs', haloText(build.halo), 5)
  if (id === CARD.might) return cardOf(build, id, 'Might', '+10% damage', 5)
  if (id === CARD.haste) return cardOf(build, id, 'Haste', '−8% cooldowns', 5)
  if (id === CARD.swift) return cardOf(build, id, 'Swiftness', '+7% move speed', 5)
  if (id === CARD.vitality) return cardOf(build, id, 'Vitality', '+20 max HP and heal 20', 5)
  if (id === CARD.lodestone) return cardOf(build, id, 'Lodestone', '+25% pickup radius', 5)
  if (id === CARD.wide) return cardOf(build, id, 'Wide Noon', 'the sun\'s beam gets wider', TUNING.wideMax)
  if (id === CARD.flare) return cardOf(build, id, 'Solar Flare', 'A sun burst every 6s, doubled in light', 5)
  if (id === CARD.bell) return cardOf(build, id, 'Noon Bell', 'A toll slows nearby shade', 5)
  if (id === CARD.longday) return cardOf(build, id, 'Long Day', 'The sun turns 12% slower', 5)
  if (id === CARD.searing) return cardOf(build, id, 'Searing Light', 'Lit enemies burn for 2s', 5)
  if (id === CARD.mirage) return cardOf(build, id, 'Mirage Sandals', 'A sidestep that leaves a decoy', 1)
  return { id: CARD.heal, name: 'Heal 30', text: 'Restore 30 HP', from: 'now', to: '+30', rank: 0, max: 1, next: 1 }
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
