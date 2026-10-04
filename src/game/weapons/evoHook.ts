/** Entry-side evolution flags. The lazy chunk is the only thing that drives them. */

export type EvoKind = 'spear' | 'halo' | 'flare' | 'bell' | 'helio' | 'scarab' | 'stake' | 'prism'

export const EVO_KINDS: readonly EvoKind[] = ['spear', 'halo', 'flare', 'bell', 'helio', 'scarab', 'stake', 'prism']

const on: Record<EvoKind, boolean> = {
  spear: false, halo: false, flare: false, bell: false, helio: false, scarab: false, stake: false, prism: false,
}

let live = false
let seeFn: (x: number, z: number) => boolean = () => true
let healFn: (n: number) => void = () => {}
let flashFn: (simTime: number) => void = () => {}
let lightFn: (x: number, z: number) => boolean = () => false

const cpu: Record<string, number> = {
  meridian: 0, corona: 0, dayburst: 0, twelvefold: 0, solar: 0, sunroller: 0, obelisk: 0, mocksun: 0, chest: 0,
}

export function evoOn(kind: EvoKind): boolean {
  return on[kind]
}

/** Base weapons stand down only once the lazy chunk is actually driving the slot. */
export function evoDriving(kind: EvoKind): boolean {
  return live && on[kind]
}

export function setEvo(kind: EvoKind, value: boolean): void {
  on[kind] = value
}

export function clearEvos(): void {
  for (let i = 0; i < EVO_KINDS.length; i++) on[EVO_KINDS[i] ?? 'spear'] = false
  for (const key of Object.keys(cpu)) cpu[key] = 0
}

export function markEvoLive(value: boolean): void {
  live = value
}

export function evoLive(): boolean {
  return live
}

export function setEvoSee(fn: (x: number, z: number) => boolean): void {
  seeFn = fn
}

export function evoSee(x: number, z: number): boolean {
  return seeFn(x, z)
}

export function setEvoHeal(fn: (n: number) => void): void {
  healFn = fn
}

export function evoHeal(n: number): void {
  if (n > 0) healFn(n)
}

export function setDayburstFlash(fn: (simTime: number) => void): void {
  flashFn = fn
}

export function dayburstFlash(simTime: number): void {
  flashFn(simTime)
}

export function setEvoLights(fn: (x: number, z: number) => boolean): void {
  lightFn = fn
}

export function evoLights(x: number, z: number): boolean {
  return live && lightFn(x, z)
}

export function addEvoCpu(name: string, ms: number): void {
  cpu[name] = (cpu[name] ?? 0) + ms
}

export function evoCpu(): Record<string, number> {
  return { ...cpu }
}

export function resetEvoCpu(): void {
  for (const key of Object.keys(cpu)) cpu[key] = 0
}

export interface EvoRead {
  meridianVolley: number
  meridianFan: number
  meridianSpan: number
  meridianBig: number
  coronaR: number
  coronaBurst: number
  dayburstAt: number
  tongues: number
  spots: number
  tolls: number
  tollR: number
  dazed: number
  healed: number
  mirrors: number
  chain: number
  ballHits: number
  obelisks: number
  fences: number
  prismAlive: number
  prismMax: number
  dogs: number
  bossScales: Record<EvoKind, number>
}

const blankRead = (): EvoRead => ({
  meridianVolley: 0, meridianFan: 0, meridianSpan: 0, meridianBig: 0,
  coronaR: 0, coronaBurst: 0, dayburstAt: 0, tongues: 0, spots: 0,
  tolls: 0, tollR: 0, dazed: 0, healed: 0, mirrors: 0, chain: 0,
  ballHits: 0, obelisks: 0, fences: 0, prismAlive: 0, prismMax: 0, dogs: 0,
  bossScales: { spear: 0, halo: 0, flare: 0, bell: 0, helio: 0, scarab: 0, stake: 0, prism: 0 },
})

let readState: EvoRead = blankRead()

export function publishEvo(next: EvoRead): void {
  readState = next
}

export function readEvo(): EvoRead {
  return readState
}

export function clearEvoRead(): void {
  readState = blankRead()
}
