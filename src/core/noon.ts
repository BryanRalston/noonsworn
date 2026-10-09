import { TUNING } from '../data/tuning'
import { mulberry32, type Rng } from './rng'

/** Named gameplay streams. 1 spawn, 2 offers, 3 boss, 4 chest, 5 sun, 6 fx. */
export const STREAM = { spawn: 1, offers: 2, boss: 3, chest: 4, sun: 5, fx: 6 } as const

const TEMPLE = ['sundial', 'lattice', 'cloister', 'stair'] as const
const LINE = ['line.sliver', 'line.hard', 'line.blister', 'line.quick', 'line.fewhands'] as const
const STAIR_LINE = ['line.sliver', 'line.hard', 'line.blister', 'line.fewhands'] as const

export const LINE_NAME: Record<string, string> = {
  'line.sliver': 'Sliver Line',
  'line.hard': 'Hard Line',
  'line.blister': 'Blister Line',
  'line.quick': 'Quick Line',
  'line.fewhands': 'Few Hands',
}

export interface SunEvent {
  t: number
  scale: number
}

export interface Streams {
  spawn: Rng
  boss: Rng
  sun: Rng
  bossSeed: number
  chest: number
  fx: number
}

export function mix(a: number, b: number, c: number): number {
  let h = 2166136261
  h = Math.imul(h ^ (a >>> 0), 16777619)
  h = Math.imul(h ^ (b >>> 0), 16777619)
  h = Math.imul(h ^ (c >>> 0), 16777619)
  return h >>> 0
}

export function utcDay(now = Date.now()): number {
  const d = new Date(now)
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

export function dayKey(day: number): string {
  const y = (day / 10000) | 0
  const m = ((day / 100) | 0) % 100
  const dd = day % 100
  const p = (n: number) => (n < 10 ? '0' : '') + n
  return `${y}-${p(m)}-${p(dd)}`
}

export function templeOf(day: number): (typeof TEMPLE)[number] {
  return TEMPLE[mix(day, TUNING.rules, 0) % 4] ?? 'sundial'
}

export function openStreams(base: number): Streams {
  const rules = TUNING.rules
  const bossSeed = mix(base, rules, STREAM.boss)
  return {
    spawn: mulberry32(mix(base, rules, STREAM.spawn)),
    boss: mulberry32(bossSeed),
    sun: mulberry32(mix(base, rules, STREAM.sun)),
    bossSeed,
    chest: mix(base, rules, STREAM.chest),
    fx: mix(base, rules, STREAM.fx),
  }
}

/** Line and sun-speed events. Call after sun.reset has taken its two rolls. */
export function takePlan(sun: Rng, temple: string): { line: string; events: SunEvent[] } {
  const stair = temple === 'stair'
  const pool = stair ? STAIR_LINE : LINE
  const line = pool[(sun() * pool.length) | 0] ?? 'line.sliver'
  const count = 2 + ((sun() * 2) | 0)
  const events: SunEvent[] = []
  for (let i = 0; i < count; i++) {
    const t = Math.round((36 + sun() * 220) * 100) / 100
    const scale = Math.round((0.72 + sun() * 0.7) * 1000) / 1000
    events.push({ t, scale })
  }
  events.sort((a, b) => a.t - b.t)
  return { line, events }
}

/** Picker preview. Skips the two sun.reset rolls, then reads the plan. */
export function previewDay(day: number): { day: number; key: string; temple: string; line: string; events: SunEvent[] } {
  const temple = templeOf(day)
  const sun = mulberry32(mix(day, TUNING.rules, STREAM.sun))
  sun()
  sun()
  const plan = takePlan(sun, temple)
  return { day, key: dayKey(day), temple, line: plan.line, events: plan.events }
}

export function offerStream(base: number, level: number, roll: number): Rng {
  return mulberry32(mix(mix(base, level, roll), TUNING.rules, STREAM.offers))
}

export function utcLeft(now = Date.now()): string {
  const d = new Date(now)
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now
  const s = Math.max(0, (ms / 1000) | 0)
  const h = (s / 3600) | 0
  const m = ((s % 3600) / 60) | 0
  const ss = s % 60
  const p = (n: number) => (n < 10 ? '0' : '') + n
  return `${h}:${p(m)}:${p(ss)}`
}
