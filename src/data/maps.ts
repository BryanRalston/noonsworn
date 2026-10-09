import { storageGet, storageSet } from '../platform/storage'

export interface MapDef {
  id: string
  name: string
  hook: string
  footprint: number
  pillars: 'sanctum' | 'posts'
  cookie: string | null
  keyart: string | null
  wave: string
  boss: string | null
  unlock: string | null
  playable: boolean
}

/** Sundial Court, expressed as data. Runtime geometry stays the M3b sanctum. */
export const MAP_DEFS: MapDef[] = [
  {
    id: 'sundial',
    name: 'Sundial Court',
    hook: 'Hold the light in the four wings.',
    footprint: 48,
    pillars: 'sanctum',
    cookie: null,
    keyart: 'assets/maps/sundial-key.webp',
    wave: 'sundial',
    boss: null,
    unlock: null,
    playable: true,
  },
  {
    id: 'lattice',
    name: 'Lattice Terraces',
    hook: 'Fight the coins the pergolas let through.',
    footprint: 48,
    pillars: 'posts',
    cookie: 'assets/maps/lattice-cookie.png',
    keyart: 'assets/maps/lattice-key.webp',
    wave: 'lattice',
    boss: null,
    unlock: 'sundial',
    playable: true,
  },
  {
    id: 'cloister',
    name: 'The Brimming Cloister',
    hook: 'When the pool brims, the sun reaches under the arches.',
    footprint: 48,
    pillars: 'sanctum',
    cookie: null,
    keyart: 'assets/maps/cloister-key.webp',
    wave: 'cloister',
    boss: null,
    unlock: 'lattice',
    playable: true,
  },
  {
    id: 'stair',
    name: 'The Westering Stair',
    hook: 'The sun is going down. Climb with it.',
    footprint: 48,
    pillars: 'sanctum',
    cookie: null,
    keyart: 'assets/maps/stair-key.webp',
    wave: 'stair',
    boss: null,
    unlock: 'cloister',
    playable: true,
  },
  {
    id: 'nadir',
    name: 'Nadir Court',
    hook: 'Stand in its light.',
    footprint: 48,
    pillars: 'sanctum',
    cookie: null,
    keyart: 'assets/maps/nadir-key.webp',
    wave: 'nadir',
    boss: 'Matins',
    unlock: 'stair',
    playable: true,
  },
]

/** Pergola posts. These replace the four sanctum pillars while Lattice is active. */
export const LATTICE_POSTS: { x: number; z: number; r: number }[] = [
  { x: -20, z: -16, r: 0.5 },
  { x: -7, z: -16, r: 0.5 },
  { x: 7, z: -16, r: 0.5 },
  { x: 20, z: -16, r: 0.5 },
  { x: -20, z: 16, r: 0.5 },
  { x: -7, z: 16, r: 0.5 },
  { x: 7, z: 16, r: 0.5 },
  { x: 20, z: 16, r: 0.5 },
]

const KEY = 'noonsworn.maps.v1'

export interface MapBest {
  time: number
  kills: number
  /** Best clear. Lower is better. A death never writes this. */
  clear?: number
  clearKills?: number
  /** Longest survival. A clear never replaces this, and this never replaces a clear. */
  survived?: number
  survivedKills?: number
  /** Best Night-Clock remaining on a finale clear. Higher is better. */
  remain?: number
}

export interface MapRecord {
  unlocked: string[]
  best: Record<string, MapBest>
  last: string
  seen: string[]
}

function fresh(): MapRecord {
  return { unlocked: ['sundial'], best: {}, last: 'sundial', seen: [] }
}

function cleanBest(value: unknown): Record<string, MapBest> {
  const out: Record<string, MapBest> = {}
  if (!value || typeof value !== 'object') return out
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== 'object') continue
    const time = (row as { time?: unknown }).time
    const kills = (row as { kills?: unknown }).kills
    if (typeof time === 'number' && Number.isFinite(time) && typeof kills === 'number' && Number.isFinite(kills)) {
      const best: MapBest = { time, kills }
      const clear = (row as { clear?: unknown }).clear
      const clearKills = (row as { clearKills?: unknown }).clearKills
      const survived = (row as { survived?: unknown }).survived
      const survivedKills = (row as { survivedKills?: unknown }).survivedKills
      if (typeof clear === 'number' && Number.isFinite(clear)) best.clear = clear
      if (typeof clearKills === 'number' && Number.isFinite(clearKills)) best.clearKills = clearKills
      if (typeof survived === 'number' && Number.isFinite(survived)) best.survived = survived
      if (typeof survivedKills === 'number' && Number.isFinite(survivedKills)) best.survivedKills = survivedKills
      const remain = (row as { remain?: unknown }).remain
      if (typeof remain === 'number' && Number.isFinite(remain)) best.remain = remain
      out[key] = best
    }
  }
  return out
}

export function loadMaps(): MapRecord {
  const raw = storageGet(KEY)
  if (!raw) return fresh()
  try {
    const parsed = JSON.parse(raw) as { unlocked?: unknown; best?: unknown; last?: unknown; seen?: unknown }
    const unlocked = Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id): id is string => typeof id === 'string') : ['sundial']
    if (!unlocked.includes('sundial')) unlocked.unshift('sundial')
    const best = cleanBest(parsed.best)
    if (best.stair?.clear != null && !unlocked.includes('nadir')) unlocked.push('nadir')
    const last = typeof parsed.last === 'string' ? parsed.last : 'sundial'
    const seen = Array.isArray(parsed.seen) ? parsed.seen.filter((id): id is string => typeof id === 'string') : []
    return { unlocked, best, last, seen }
  } catch {
    return fresh()
  }
}

export function saveMaps(rec: MapRecord) {
  storageSet(KEY, JSON.stringify(rec))
}

export function rememberMap(id: string) {
  const rec = loadMaps()
  rec.last = id
  saveMaps(rec)
}

/** A clear keeps the faster clear. A death keeps the longer survival and never replaces a clear. */
export function noteRun(mapId: string, time: number, kills: number, cleared: boolean, remain?: number): boolean {
  const rec = loadMaps()
  const prev = rec.best[mapId]
  if (!prev) {
    rec.best[mapId] = cleared
      ? { time, kills, clear: time, clearKills: kills, remain }
      : { time, kills, survived: time, survivedKills: kills }
  } else if (cleared) {
    if (prev.clear == null || time < prev.clear) {
      prev.clear = time
      prev.clearKills = kills
      prev.time = time
      prev.kills = kills
    }
    if (typeof remain === 'number' && (prev.remain == null || remain > prev.remain)) prev.remain = remain
  } else {
    const lived = prev.survived ?? (prev.clear == null ? prev.time : 0)
    if (time > lived) {
      prev.survived = time
      prev.survivedKills = kills
      if (prev.clear == null) {
        prev.time = time
        prev.kills = kills
      }
    }
  }
  let opened = false
  if (cleared && mapId === 'sundial' && !rec.unlocked.includes('lattice')) {
    rec.unlocked.push('lattice')
    opened = true
  }
  if (cleared && mapId === 'lattice' && !rec.unlocked.includes('cloister')) {
    rec.unlocked.push('cloister')
    opened = true
  }
  if (cleared && mapId === 'cloister' && !rec.unlocked.includes('stair')) {
    rec.unlocked.push('stair')
    opened = true
  }
  if (cleared && mapId === 'stair' && !rec.unlocked.includes('nadir')) {
    rec.unlocked.push('nadir')
    opened = true
  }
  saveMaps(rec)
  return opened
}

/** First time a temple is announced. Old saves have no seen list and still load. */
export function markSeen(id: string): boolean {
  const rec = loadMaps()
  if (rec.seen.includes(id)) return false
  rec.seen.push(id)
  saveMaps(rec)
  return true
}
