import { EARN_BOSS, EARN_CLEAR, EARN_PER30, TUNING } from '../data/tuning'
import { storageCommit, storageGet } from '../platform/storage'

export const META_KEY = 'noonsworn.meta.v1'
const BAK = 'noonsworn.meta.v1.bak'
const MAPS = 'noonsworn.maps.v1'
const DAWN = 'noonsworn.dawn'
const V = 1

export const LINE_ID = ['line.sliver', 'line.hard', 'line.blister', 'line.quick', 'line.fewhands'] as const
export type LineId = (typeof LINE_ID)[number]
const TEMPLE = ['sundial', 'lattice', 'cloister', 'stair', 'nadir'] as const
const FOUR = LINE_ID.slice(0, 4)

export const BOUGHT_IDS = ['mark.frame', 'mark.reroll1', 'mark.palette1', 'mark.weaponA', 'mark.banish1', 'mark.palette2', 'mark.weaponB', 'mark.reroll2', 'mark.banish2'] as const
export const MARK_COST = [25, 35, 45, 60, 70, 85, 100, 125, 150] as const
export const EARNED_IDS = ['mark.temples', 'mark.finale', 'mark.prints'] as const

const BONUS: Record<LineId, number> = {
  'line.sliver': TUNING.lines.bonus.sliver,
  'line.hard': TUNING.lines.bonus.hard,
  'line.blister': TUNING.lines.bonus.blister,
  'line.quick': TUNING.lines.bonus.quick,
  'line.fewhands': TUNING.lines.bonus.fewhands,
}

export interface Envelope {
  v: number
  rev: number
  sunmarks: number
  ent: string[]
  wheel: string[]
  lines: string[]
  palette: string
  daily: Record<string, number>
  migratedFrom: string | null
  inferred: string[]
  readonly?: boolean
  session?: boolean
}

export interface MetaStore {
  get(key: string): string | null
  commit(key: string, value: string): boolean
}

export interface CreditIn {
  seconds: number
  bossKills: number
  cleared: boolean
  finale: boolean
  mapId: string
  practice: boolean
}

export interface MetaSession {
  env: Envelope
  notice: string
  pull: () => void
  arm: (mapId: string) => void
  endRun: () => void
  noteDev: () => void
  lineLive: (id: string, mapId: string) => boolean
  armed: () => string[]
  credit: (input: CreditIn) => { total: number; line: string }
  buy: (id: string, confirmed: boolean) => { ok: boolean; reason: string }
  setLines: (ids: string[]) => void
  setPalette: (id: string) => boolean
  weaponOpen: (which: 'helio' | 'scarab') => boolean
  rerolls: () => number
  banishes: () => number
  hasProgress: () => boolean
}

let live: MetaSession | null = null

function blank(from: string | null): Envelope {
  return {
    v: V,
    rev: 1,
    sunmarks: 0,
    ent: [],
    wheel: [],
    lines: [],
    palette: 'default',
    daily: {},
    migratedFrom: from,
    inferred: [],
  }
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (let i = 0; i < value.length; i++) if (typeof value[i] === 'string') out.push(value[i])
  return out
}

function pack(env: Envelope): string {
  return JSON.stringify({
    v: env.v,
    rev: env.rev,
    sunmarks: env.sunmarks,
    ent: env.ent,
    wheel: env.wheel,
    lines: env.lines,
    palette: env.palette,
    daily: env.daily,
    migratedFrom: env.migratedFrom,
    inferred: env.inferred,
  })
}

function add(list: string[], id: string) {
  if (!list.includes(id)) list.push(id)
}

function union(a: string[], b: string[]): string[] {
  const out = a.slice()
  for (let i = 0; i < b.length; i++) add(out, b[i] ?? '')
  return out
}

function lineFor(id: string): string | undefined {
  const i = (TEMPLE as readonly string[]).indexOf(id)
  return i < 0 ? undefined : LINE_ID[i]
}

function costOf(id: string): number {
  const i = (BOUGHT_IDS as readonly string[]).indexOf(id)
  return i < 0 ? -1 : (MARK_COST[i] ?? -1)
}

interface RawMaps {
  unlocked?: unknown
  best?: unknown
}

function explicitClear(best: Record<string, unknown>, id: string): boolean {
  const row = best[id]
  return !!row && typeof row === 'object' && typeof (row as { clear?: unknown }).clear === 'number'
}

function taken(parsed: Partial<Envelope>) {
  return {
    rev: typeof parsed.rev === 'number' ? parsed.rev : 1,
    sun: typeof parsed.sunmarks === 'number' ? parsed.sunmarks : 0,
    ent: strings(parsed.ent),
    wheel: strings(parsed.wheel),
    lines: strings(parsed.lines),
    palette: typeof parsed.palette === 'string' ? parsed.palette : '',
    inferred: strings(parsed.inferred),
  }
}

function grantsFrom(raw: RawMaps, dawn: boolean): Envelope {
  const env = blank('maps.v1')
  const unlocked = strings(raw.unlocked)
  if (!unlocked.includes('sundial')) unlocked.unshift('sundial')
  const best = raw.best && typeof raw.best === 'object' ? (raw.best as Record<string, unknown>) : {}
  if (explicitClear(best, 'stair') && !unlocked.includes('nadir')) unlocked.push('nadir')
  const cleared = new Set<string>()
  const inferred = new Set<string>()
  const mark = (id: string) => {
    cleared.add(id)
    if (!explicitClear(best, id)) inferred.add(id)
  }
  for (const id of TEMPLE) if (explicitClear(best, id)) mark(id)
  const finale = dawn || cleared.has('nadir')
  if (finale) mark('nadir')
  // A later clear or unlock is the only proof an older best row was a clear. Dawn counts as the finale.
  for (let i = TEMPLE.length - 1; i > 0; i--) {
    const later = TEMPLE[i] ?? ''
    const earlier = TEMPLE[i - 1] ?? ''
    if (cleared.has(later) || unlocked.includes(later)) mark(earlier)
  }
  for (const id of cleared) {
    const line = lineFor(id)
    if (line) add(env.ent, line)
  }
  for (const id of inferred) {
    const line = lineFor(id)
    if (line) add(env.inferred, line)
  }
  const anyBest = Object.keys(best).length > 0
  if (anyBest || dawn || cleared.size > 0) {
    add(env.ent, 'bonus.first')
    env.sunmarks += 15
  }
  if (finale) {
    add(env.ent, 'bonus.finale')
    env.sunmarks += 25
    add(env.wheel, 'mark.finale')
    add(env.ent, 'line.fewhands')
    env.palette = 'linen'
  }
  if (TEMPLE.slice(0, 4).every((id) => cleared.has(id))) add(env.wheel, 'mark.temples')
  if (anyBest) {
    add(env.wheel, 'mark.weaponA')
    add(env.wheel, 'mark.weaponB')
    add(env.ent, 'kept.mark.weaponA')
    add(env.ent, 'kept.mark.weaponB')
  }
  return env
}

function fill(env: Envelope, parsed: Partial<Envelope>, floorSun: boolean) {
  const row = taken(parsed)
  env.rev = row.rev
  env.sunmarks = floorSun ? (row.sun > 0 ? Math.floor(row.sun) : 0) : row.sun
  env.ent = row.ent
  env.wheel = row.wheel
  env.lines = floorSun ? row.lines.slice(0, 3) : row.lines
  env.palette = row.palette || 'default'
  env.inferred = row.inferred
  if (floorSun) env.daily = parsed.daily && typeof parsed.daily === 'object' ? (parsed.daily as Record<string, number>) : {}
}

function readStored(store: MetaStore): { env: Envelope; future: string | null } {
  const raw = store.get(META_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Envelope>
      if (parsed && typeof parsed === 'object' && typeof parsed.v === 'number' && parsed.v > V) {
        const env = blank('future')
        env.readonly = true
        fill(env, parsed, false)
        return { env, future: raw }
      }
      if (parsed && parsed.v === V && Array.isArray(parsed.ent) && Array.isArray(parsed.wheel)) {
        const env = blank(typeof parsed.migratedFrom === 'string' || parsed.migratedFrom === null ? parsed.migratedFrom : 'meta')
        fill(env, parsed, true)
        return { env, future: null }
      }
    } catch {
      /* corrupt meta falls through */
    }
    store.commit(BAK, raw)
  }
  const mapsRaw = store.get(MAPS)
  const dawn = store.get(DAWN) === '1'
  if (!mapsRaw) {
    const env = grantsFrom({ unlocked: ['sundial'], best: {} }, dawn)
    if (!dawn && Object.keys(env.ent).length === 0) {
      const fresh = blank('fresh')
      store.commit(META_KEY, pack(fresh))
      return { env: fresh, future: null }
    }
    env.migratedFrom = dawn ? 'dawn' : 'fresh'
    store.commit(META_KEY, pack(env))
    return { env, future: null }
  }
  try {
    const parsed = JSON.parse(mapsRaw) as RawMaps
    if (!parsed || typeof parsed !== 'object') throw new Error('legacy')
    const env = grantsFrom(parsed, dawn)
    store.commit(META_KEY, pack(env))
    return { env, future: null }
  } catch {
    store.commit(BAK, mapsRaw)
    const env = blank('legacy-bad')
    store.commit(META_KEY, pack(env))
    return { env, future: null }
  }
}

function practiceUrl(): boolean {
  if (typeof location === 'undefined') return false
  return /(?:\?|&)(?:dev|arsenal|evo|seed)(?:=|&|$)/.test(location.search)
}

function bonusOf(ids: readonly string[]): number {
  let n = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (id && id in BONUS) n += BONUS[id as LineId]
  }
  return Math.min(TUNING.lines.bonusCap, n)
}

/** Pure earn total. The sim and the ledger share this so the report matches the game. */
export function scoreRun(seconds: number, bossKills: number, cleared: boolean, finale: boolean, first: boolean, finaleDone: boolean, bonus: number): number {
  const base = Math.floor(Math.max(0, seconds) / 30) * EARN_PER30 + bossKills * EARN_BOSS + (cleared ? EARN_CLEAR : 0) + (first ? 0 : 15) + (finale ? (finaleDone ? 5 : 25) : 0)
  return Math.floor(base * (1 + Math.min(TUNING.lines.bonusCap, Math.max(0, bonus))))
}

/**
 * Noon Print pays +10 once R1b calls this with a day key.
 * This round never calls it, and it does not write the ledger.
 */
export function creditNoonPrint(day: string): number {
  return day ? 10 : 0
}

export function openMeta(store: MetaStore): MetaSession {
  let future = ''
  const loaded = readStored(store)
  let env = loaded.env
  if (loaded.future) future = loaded.future
  let notice = ''
  let runLive = false
  let devDuring = false
  let armed: string[] = []

  function pull() {
    if (future) return
    const raw = store.get(META_KEY)
    if (!raw) return
    try {
      const disk = JSON.parse(raw) as Partial<Envelope>
      if (disk && typeof disk.v === 'number' && disk.v > V) {
        future = raw
        env.readonly = true
        return
      }
      if (!disk || disk.v !== V || typeof disk.rev !== 'number' || disk.rev <= env.rev) return
      const other = blank(env.migratedFrom)
      fill(other, disk, false)
      env = {
        ...env,
        rev: Math.max(env.rev, other.rev),
        sunmarks: Math.max(env.sunmarks, other.sunmarks),
        ent: union(env.ent, other.ent),
        wheel: union(env.wheel, other.wheel),
        inferred: union(env.inferred, other.inferred),
        lines: other.lines.length ? other.lines : env.lines,
        palette: other.palette || env.palette,
      }
    } catch {
      /* keep the session copy */
    }
  }

  function write(): boolean {
    if (future || env.readonly) return false
    env.session = false
    const ok = store.commit(META_KEY, pack(env))
    if (!ok) {
      env.session = true
      notice = 'Sunmarks stayed on this tab.'
    }
    return ok
  }

  function grantTemple(mapId: string) {
    const line = lineFor(mapId)
    if (line) add(env.ent, line)
    if (FOUR.every((id) => env.ent.includes(id))) add(env.wheel, 'mark.temples')
  }

  return {
    get env() {
      return env
    },
    get notice() {
      return notice
    },
    pull,
    arm(mapId) {
      runLive = true
      devDuring = false
      armed = env.lines.filter((id) => env.ent.includes(id)).slice(0, 3)
      void mapId
    },
    endRun() {
      runLive = false
    },
    noteDev() {
      if (runLive) devDuring = true
    },
    lineLive(id, mapId) {
      if (!armed.includes(id)) return false
      if (id === 'line.quick' && (mapId === 'stair' || mapId === 'nadir')) return false
      return true
    },
    armed: () => armed.slice(),
    credit(input) {
      if (input.practice || practiceUrl() || devDuring) return { total: 0, line: 'Practice · 0 Sunmarks' }
      if (future || env.readonly) return { total: 0, line: '0 Sunmarks' }
      pull()
      const first = !env.ent.includes('bonus.first')
      const finaleDone = env.ent.includes('bonus.finale')
      const bonus = bonusOf(armed.filter((id) => env.ent.includes(id)))
      const total = scoreRun(input.seconds, input.bossKills, input.cleared, input.finale, !first, finaleDone, bonus)
      add(env.ent, 'bonus.first')
      if (input.cleared) grantTemple(input.mapId)
      if (input.finale) {
        add(env.ent, 'bonus.finale')
        add(env.ent, 'line.fewhands')
        add(env.wheel, 'mark.finale')
        if (env.palette === 'default') env.palette = 'linen'
      }
      env.sunmarks += total
      env.rev += 1
      write()
      const survival = Math.floor(Math.max(0, input.seconds) / 30) * EARN_PER30
      const parts = [`${survival} survived`]
      if (input.bossKills) parts.push(`${input.bossKills * EARN_BOSS} boss`)
      if (input.cleared) parts.push(`${EARN_CLEAR} clear`)
      if (first) parts.push('15 first')
      if (input.finale) parts.push(finaleDone ? '5 finale' : '25 finale')
      if (bonus > 0) parts.push(`lines +${Math.round(bonus * 100)}%`)
      parts.push(`${total} Sunmarks`)
      return { total, line: parts.join(' · ') }
    },
    buy(id, confirmed) {
      if (future || env.readonly) return { ok: false, reason: 'read-only' }
      pull()
      const cost = costOf(id)
      if (cost < 0) return { ok: false, reason: 'locked' }
      if (env.wheel.includes(id)) return { ok: false, reason: 'owned' }
      if (cost >= 100 && !confirmed) return { ok: false, reason: 'confirm' }
      if (env.sunmarks < cost) return { ok: false, reason: 'short' }
      env.sunmarks -= cost
      add(env.wheel, id)
      env.rev += 1
      const ok = write()
      return { ok: true, reason: ok ? '' : 'session' }
    },
    setLines(ids) {
      if (future || env.readonly) return
      pull()
      const next: string[] = []
      for (let i = 0; i < ids.length && next.length < 3; i++) {
        const id = ids[i]
        if (!id || !env.ent.includes(id) || next.includes(id)) continue
        next.push(id)
      }
      env.lines = next
      armed = next.slice()
      env.rev += 1
      write()
    },
    setPalette(id) {
      if (future || env.readonly) return false
      pull()
      const linen = env.wheel.includes('mark.finale') || env.ent.includes('line.fewhands')
      const next = id === 'default' ? 'default' : id === 'linen' && linen ? 'linen' : id === 'flax' && env.wheel.includes('mark.palette1') ? 'flax' : id === 'pewter' && env.wheel.includes('mark.palette2') ? 'pewter' : ''
      if (!next) return false
      env.palette = next
      env.rev += 1
      write()
      return true
    },
    weaponOpen(which) {
      return env.wheel.includes(which === 'helio' ? 'mark.weaponA' : 'mark.weaponB')
    },
    rerolls() {
      return (env.wheel.includes('mark.reroll1') ? 1 : 0) + (env.wheel.includes('mark.reroll2') ? 1 : 0)
    },
    banishes() {
      return (env.wheel.includes('mark.banish1') ? 1 : 0) + (env.wheel.includes('mark.banish2') ? 1 : 0)
    },
    hasProgress() {
      return env.sunmarks > 0 || env.ent.length > 0 || env.wheel.length > 0
    },
  }
}

function browserStore(): MetaStore {
  return {
    get: storageGet,
    commit: storageCommit,
  }
}

export function bootMeta(): MetaSession {
  live = openMeta(browserStore())
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === META_KEY) live?.pull()
    })
  }
  return live
}

function use(): MetaSession {
  if (!live) live = bootMeta()
  return live
}

export function liveMeta(): MetaSession {
  return use()
}
