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
    keyart: null,
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
    keyart: 'assets/maps/lattice-key.png',
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
    hook: '',
    footprint: 48,
    pillars: 'sanctum',
    cookie: null,
    keyart: null,
    wave: 'stair',
    boss: null,
    unlock: 'cloister',
    playable: false,
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
      out[key] = { time, kills }
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
    const last = typeof parsed.last === 'string' ? parsed.last : 'sundial'
    const seen = Array.isArray(parsed.seen) ? parsed.seen.filter((id): id is string => typeof id === 'string') : []
    return { unlocked, best: cleanBest(parsed.best), last, seen }
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

/** Updates the best time. A Sundial clear unlocks Lattice. A Lattice clear already unlocks the Cloister. */
export function noteRun(mapId: string, time: number, kills: number, cleared: boolean): boolean {
  const rec = loadMaps()
  const prev = rec.best[mapId]
  if (!prev || time > prev.time) rec.best[mapId] = { time, kills }
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
