/**
 * R1a Sunmarks careers. Noon Print's +10 is not paid.
 * Not imported by the game.
 * Run: node --import ./scripts/r1a-register.mjs --experimental-strip-types scripts/r1a-economy.ts
 */
import { writeFileSync } from 'node:fs'
import { scoreRun } from '../src/game/meta.ts'

const TEMPLES = ['sundial', 'lattice', 'cloister', 'stair', 'nadir'] as const
const COSTS = [25, 35, 45, 60, 70, 85, 100, 125, 150]
const LINE_BONUS = [0.15, 0.15, 0.15, 0.1, 0.1]
const CAREERS = 2000
const RUN_CAP = 80

/** Clear chance and death-time range, in temple order. Chosen before the run, not fitted to the target. */
const TIER = {
  new: {
    clear: [0.25, 0.15, 0.1, 0.06, 0.04],
    death: [45, 140],
    lines: 1,
    bossDeath: 0.15,
  },
  mid: {
    clear: [0.55, 0.42, 0.3, 0.2, 0.12],
    death: [80, 220],
    lines: 2,
    bossDeath: 0.35,
  },
  good: {
    clear: [0.82, 0.7, 0.58, 0.45, 0.32],
    death: [140, 280],
    lines: 3,
    bossDeath: 0.55,
  },
} as const

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bonusFor(unlocked: number, slots: number): number {
  const have = LINE_BONUS.slice(0, unlocked).sort((a, b) => b - a).slice(0, slots)
  return Math.min(0.4, have.reduce((sum, n) => sum + n, 0))
}

function career(rng: () => number, tier: (typeof TIER)[keyof typeof TIER], payPrint: boolean) {
  let sunmarks = 0
  let owned = 0
  let unlocked = 0
  let first = false
  let finale = false
  const perRun: number[] = []
  const at = [0, 0, 0]
  for (let run = 1; run <= RUN_CAP; run++) {
    const temple = Math.min(unlocked, TEMPLES.length - 1)
    const cleared = rng() < tier.clear[temple]
    const seconds = cleared ? 300 : tier.death[0] + rng() * (tier.death[1] - tier.death[0])
    let bosses = 0
    if (temple > 0) {
      if (cleared) bosses = 1
      else if (seconds >= 250 && rng() < tier.bossDeath) bosses = 1
    }
    const isFinale = cleared && temple === 4
    const total = scoreRun(seconds, bosses, cleared, isFinale, first, finale, bonusFor(unlocked, tier.lines)) + (payPrint ? 10 : 0)
    perRun.push(total)
    sunmarks += total
    first = true
    if (cleared && unlocked < TEMPLES.length) unlocked += 1
    if (isFinale) finale = true
    while (owned < COSTS.length) {
      const cost = COSTS[owned]
      if (cost == null || sunmarks < cost) break
      sunmarks -= cost
      owned += 1
      if (owned === 1) at[0] = run
      if (owned === 5) at[1] = run
      if (owned === 9) at[2] = run
    }
    if (owned === 9) break
  }
  return { at, perRun }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid] ?? null
  const left = sorted[mid - 1] ?? 0
  const right = sorted[mid] ?? 0
  return (left + right) / 2
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function sliceMean(rows: number[][], from: number, to: number): number {
  const values: number[] = []
  for (const row of rows) {
    for (let i = from; i < to && i < row.length; i++) values.push(row[i] ?? 0)
  }
  return mean(values)
}

const targets = {
  new: [2, 13, 40],
  mid: [1, 9, 26],
  good: [1, 7, 18],
}

const report: Record<string, unknown> = { careers: CAREERS, cap: RUN_CAP, printPaid: false, assumptions: TIER }

for (const name of ['new', 'mid', 'good'] as const) {
  const rows: number[][] = []
  const hits: number[][] = [[], [], []]
  const withPrint: number[][] = [[], [], []]
  let printRuns: number[][] = []
  for (let i = 0; i < CAREERS; i++) {
    const played = career(mulberry32(1000 + i * 17 + name.length * 100003), TIER[name], false)
    rows.push(played.perRun)
    for (let k = 0; k < 3; k++) if (played.at[k]) hits[k]?.push(played.at[k] ?? 0)
    const printed = career(mulberry32(1000 + i * 17 + name.length * 100003), TIER[name], true)
    printRuns = printRuns
    for (let k = 0; k < 3; k++) if (printed.at[k]) withPrint[k]?.push(printed.at[k] ?? 0)
  }
  const own = [0, 1, 2].map((k) => median(hits[k] ?? []))
  const band = targets[name].map((n) => [Math.round(n * 0.7 * 10) / 10, Math.round(n * 1.3 * 10) / 10])
  const inside = own.map((n, k) => n != null && n >= (band[k]?.[0] ?? 0) && n <= (band[k]?.[1] ?? 0))
  report[name] = {
    target: targets[name],
    band,
    medianRuns: own,
    reached: hits.map((list) => list.length),
    inside,
    avgRuns1to10: Math.round(sliceMean(rows, 0, 10) * 10) / 10,
    avgRuns11to30: Math.round(sliceMean(rows, 10, 30) * 10) / 10,
    withPrintMedian: [0, 1, 2].map((k) => median(withPrint[k] ?? [])),
  }
}

const out = 'qa/r1a/economy.json'
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
