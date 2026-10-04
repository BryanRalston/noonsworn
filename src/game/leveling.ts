import type { Rng } from '../core/rng'
import { mulberry32 } from '../core/rng'
import { TUNING } from '../data/tuning'
import { bellText } from './weapons/bell'
import { flareText } from './weapons/flare'
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

export const WEAPON_IDS: readonly number[] = [CARD.spear, CARD.halo, CARD.flare, CARD.bell]
export const PASSIVE_IDS: readonly number[] = [CARD.might, CARD.haste, CARD.swift, CARD.vitality, CARD.lodestone]
export const SLOT_CAP = 6

export function countHeld(ids: readonly number[], rank: (id: number) => number): number {
  let n = 0
  for (let i = 0; i < ids.length; i++) if (rank(ids[i] ?? -1) > 0) n++
  return n
}

function isWeapon(id: number): boolean {
  return WEAPON_IDS.includes(id)
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
  const weaponsHeld = countHeld(WEAPON_IDS, (id) => rankOf(build, id))
  const passivesHeld = countHeld(PASSIVE_IDS, (id) => rankOf(build, id))
  const weaponRoom = (rank: number) => (rank <= 0 ? weaponsHeld < SLOT_CAP : rank < cap)
  const passiveRoom = (rank: number) => (rank <= 0 ? passivesHeld < SLOT_CAP : rank < cap)
  const add = (id: number, room: boolean) => {
    if (!room) return
    if (isSunBoon(id)) boonPool.push(id)
    else restPool.push(id)
  }
  add(CARD.spear, weaponRoom(build.spear))
  add(CARD.halo, weaponRoom(build.halo))
  add(CARD.might, passiveRoom(build.might))
  add(CARD.haste, passiveRoom(build.haste))
  add(CARD.swift, passiveRoom(build.swift))
  add(CARD.vitality, passiveRoom(build.vitality))
  add(CARD.lodestone, passiveRoom(build.lodestone))
  add(CARD.wide, build.wide < TUNING.wideMax)
  if (build.level >= 4) {
    add(CARD.flare, weaponRoom(build.flare))
    add(CARD.bell, weaponRoom(build.bell))
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
  if (id === CARD.flare) return cardOf(build, id, 'Solar Flare', flareText(build.flare), 5)
  if (id === CARD.bell) return cardOf(build, id, 'Noon Bell', bellText(build.bell), 5)
  if (id === CARD.longday) return cardOf(build, id, 'Long Day', 'The sun turns 12% slower', 5)
  if (id === CARD.searing) return cardOf(build, id, 'Searing Light', 'Lit enemies burn for 2s', 5)
  if (id === CARD.mirage) return cardOf(build, id, 'Mirage Sandals', 'A sidestep that leaves a decoy', 1)
  return { id: CARD.heal, name: 'Heal 30', text: 'Restore 30 HP', from: 'now', to: '+30', rank: 0, max: 1, next: 1 }
}

/** Rank changes shared by the offer test and the live pick. Side effects stay in world. */
export function applyRank(build: Build, id: number): 'vitality' | 'wide' | 'heal' | 'done' {
  const step = cardStep(build, id)
  const cap = TUNING.passive.max
  if (id === CARD.spear && build.spear < cap) {
    build.spear = Math.min(cap, build.spear + step)
    noteJump(build, id, step)
    return 'done'
  }
  if (id === CARD.halo && build.halo < cap) {
    build.halo = Math.min(cap, build.halo + step)
    noteJump(build, id, step)
    return 'done'
  }
  if (id === CARD.flare && build.flare < cap) {
    build.flare = Math.min(cap, build.flare + step)
    noteJump(build, id, step)
    return 'done'
  }
  if (id === CARD.bell && build.bell < cap) {
    build.bell = Math.min(cap, build.bell + step)
    noteJump(build, id, step)
    return 'done'
  }
  if (id === CARD.might && build.might < cap) {
    build.might++
    return 'done'
  }
  if (id === CARD.haste && build.haste < cap) {
    build.haste++
    return 'done'
  }
  if (id === CARD.swift && build.swift < cap) {
    build.swift++
    return 'done'
  }
  if (id === CARD.lodestone && build.lodestone < cap) {
    build.lodestone++
    return 'done'
  }
  if (id === CARD.vitality && build.vitality < cap) {
    build.vitality++
    return 'vitality'
  }
  if (id === CARD.wide && build.wide < TUNING.wideMax) {
    build.wide++
    return 'wide'
  }
  if (id === CARD.longday && build.longday < cap) {
    build.longday++
    return 'done'
  }
  if (id === CARD.searing && build.searing < cap) {
    build.searing++
    return 'done'
  }
  if (id === CARD.mirage && build.mirage === 0) {
    build.mirage = 1
    return 'done'
  }
  return 'heal'
}

function legacyIds(build: Build, rng: Rng, count: number): number[] {
  const rest: number[] = []
  const boon: number[] = []
  const cap = TUNING.passive.max
  const add = (id: number, room: boolean) => {
    if (!room) return
    if (isSunBoon(id)) boon.push(id)
    else rest.push(id)
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
  if (rest.length + boon.length === 0) rest.push(CARD.heal)
  shuffle(rest, rng)
  shuffle(boon, rng)
  const wantHalo = build.halo === 0 && build.level <= 2
  if (wantHalo) {
    const at = rest.indexOf(CARD.halo)
    if (at > 0) {
      rest[at] = rest[0] ?? CARD.halo
      rest[0] = CARD.halo
    }
  }
  const need = count < 1 ? 1 : count
  const takeBoon = boon.length > 0 ? 1 : 0
  const ids: number[] = []
  const restTake = Math.max(0, need - takeBoon)
  for (let i = 0; i < rest.length && ids.length < restTake; i++) ids.push(rest[i] ?? CARD.heal)
  if (takeBoon) {
    const slot = ids.length === 0 ? 0 : (rng() * (ids.length + 1)) | 0
    ids.splice(slot, 0, boon[0] ?? CARD.wide)
  }
  if (wantHalo && !ids.includes(CARD.halo) && rest.includes(CARD.halo)) ids[0] = CARD.halo
  while (ids.length < need) ids.push(CARD.heal)
  return ids
}

/** Cap proof with a stub list, plus the seeded offer ids for 12 level-ups. */
export function assertSlotCap(): void {
  const stubs = [100, 101, 102, 103, 104, 105, 106]
  const ranks = [1, 1, 1, 1, 1, 1, 0]
  const held = countHeld(stubs, (id) => ranks[stubs.indexOf(id)] ?? 0)
  if (held !== 6) throw new Error(`stub held ${held}`)
  const room = (rank: number) => (rank <= 0 ? held < SLOT_CAP : rank < TUNING.passive.max)
  if (room(0)) throw new Error('offered a 7th weapon')
  if (!room(2)) throw new Error('blocked an owned upgrade')
  const sixth = (rank: number) => (rank <= 0 ? 5 < SLOT_CAP : rank < TUNING.passive.max)
  if (!sixth(0)) throw new Error('sixth weapon blocked')
  if (WEAPON_IDS.includes(CARD.wide) || WEAPON_IDS.includes(CARD.longday) || WEAPON_IDS.includes(CARD.searing) || WEAPON_IDS.includes(CARD.mirage)) {
    throw new Error('a sun boon or Mirage counts as a weapon')
  }
  if (PASSIVE_IDS.includes(CARD.wide) || PASSIVE_IDS.includes(CARD.mirage) || PASSIVE_IDS.includes(CARD.longday) || PASSIVE_IDS.includes(CARD.searing)) {
    throw new Error('a sun boon or Mirage counts as a passive')
  }
  const build = createBuild()
  const live = mulberry32(1)
  const old = mulberry32(1)
  const shown: Card[] = []
  for (let n = 0; n < 12; n++) {
    build.level += 1
    rollCards(build, live, shown, 3)
    const next = legacyIds(build, old, 3)
    for (let i = 0; i < 3; i++) {
      if ((shown[i]?.id ?? -1) !== (next[i] ?? -2)) throw new Error(`offer drift at level-up ${n + 1}`)
    }
    applyRank(build, shown[recommendIndex(build, shown, 3)]?.id ?? CARD.heal)
  }
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
