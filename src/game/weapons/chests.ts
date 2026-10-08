import { Vector3, type Camera } from 'three'
import { mulberry32, type Rng } from '../../core/rng'
import type { MapId } from '../../data/mapId'
import { TUNING } from '../../data/tuning'
import { CARD, rankOf, type Build } from '../leveling'
import { insideArena, octDist, resolveCircle, segmentBlocked } from '../collision'
import { probePut, rimAt, spinRims } from './probe'
import { ARSENAL_PART, type Arsenal } from './arsenal'
import type { WeaponFx } from './fx'
import {
  evoLive,
  evoOn,
  setDayburstFlash,
  setEvo,
  type EvoKind,
} from './evoHook'

const ROW = TUNING.evo
const TIMES = [105, 180, 255]
const OPEN_R = 1.5
const PAIRS: readonly { id: number; passive: number; kind: EvoKind; from: string; name: string; pay: string }[] = [
  { id: CARD.spear, passive: CARD.multitude, kind: 'spear', from: 'Sunspear', name: 'Meridian Lance', pay: 'Five lances. Every fourth volley, the Meridian.' },
  { id: CARD.halo, passive: CARD.reach, kind: 'halo', from: 'Halo Discs', name: 'Corona', pay: 'A ring of fire that Exposes all it touches.' },
  { id: CARD.flare, passive: CARD.might, kind: 'flare', from: 'Solar Flare', name: 'Dayburst', pay: 'A double nova that rains sun-tongues.' },
  { id: CARD.bell, passive: CARD.vitality, kind: 'bell', from: 'Noon Bell', name: 'Twelvefold Toll', pay: 'Twelve tolls. The last one stuns the screen.' },
  { id: CARD.helio, passive: CARD.haste, kind: 'helio', from: 'Heliograph', name: 'Solar Array', pay: 'Three mirrors: a chain beam, or a lit triangle.' },
  { id: CARD.scarab, passive: CARD.lodestone, kind: 'scarab', from: 'Scarablight', name: 'Sunroller', pay: 'A scarab rolls a burning sun around you.' },
  { id: CARD.stake, passive: CARD.endurance, kind: 'stake', from: 'Hour Stakes', name: 'Obelisk Grove', pay: 'Obelisks that sweep shadow and fence in light.' },
  { id: CARD.prism, passive: CARD.swift, kind: 'prism', from: 'Prism Shards', name: 'Mock Sun', pay: 'Sun-dogs split every prism that passes.' },
]

const SLOT_ORDER = [CARD.spear, CARD.halo, CARD.flare, CARD.bell, CARD.helio, CARD.scarab, CARD.stake, CARD.prism]

interface Chest {
  x: number
  z: number
  born: number
  fill: number
  band: '8-14' | '6-18' | 'floor'
  dist: number
  lit: boolean
  flash: number
  open: boolean
}

export interface ChestEnv {
  rawDt: number
  time: number
  px: number
  pz: number
  map: MapId
  mapLit: (x: number, z: number) => boolean
  floorY: (x: number, z: number) => number
  w2: 'loading' | 'ready' | 'failed'
  dev: boolean
  chestsOff: boolean
  chestAt: number | null
  rank: (id: number) => number
  grantTwo: () => void
}

export interface ChestView {
  camera: Camera
  canvas: HTMLCanvasElement
  px: number
  pz: number
  time: number
}

const aim = new Vector3()
const RING_GOLD: readonly number[] = [1.033, 0.249, 0]
const RING_EDGE: readonly number[] = [1.4, 1.05, 0.42]
const RIM: readonly (readonly [number, number, number])[] = [
  [0, 0.74, 0.61], [0.35, 0.74, 0.61], [-0.35, 0.74, 0.61], [0.6, 0.74, 0.58],
  [-0.6, 0.74, 0.58], [0.2, 0.74, 0.66], [-0.2, 0.74, 0.66], [0, 0.74, 0.55],
]

function pairOf(kind: EvoKind) {
  for (let i = 0; i < PAIRS.length; i++) if (PAIRS[i]?.kind === kind) return PAIRS[i] ?? null
  return null
}

export function createChests(fx: WeaponFx, arsenal: Arsenal, container: HTMLElement) {
  const card = document.createElement('div')
  card.id = 'evo-reveal'
  card.hidden = true
  const inner = document.createElement('div')
  inner.className = 'evo-card'
  const from = document.createElement('p')
  from.className = 'evo-from'
  const name = document.createElement('strong')
  name.className = 'evo-name'
  const pay = document.createElement('p')
  pay.className = 'evo-pay'
  inner.append(from, name, pay)
  card.append(inner)
  const pointer = document.createElement('div')
  pointer.id = 'chest-pointer'
  pointer.hidden = true
  const flashEl = document.createElement('div')
  flashEl.id = 'dayburst-flash'
  container.append(card, pointer, flashEl)

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let lastFlash = -10
  setDayburstFlash((simTime) => {
    if (reduced()) return
    if (simTime - lastFlash < 2) return
    lastFlash = simTime
    // Toggling the animation name restarts the flash. Reading offsetWidth here
    // forced a synchronous layout of the whole page inside the frame.
    if (!flashEl.classList.contains('on')) flashEl.classList.add('on')
    else flashEl.classList.toggle('alt')
  })

  let placeRng: Rng = mulberry32(1)
  const list: Chest[] = []
  const fired = [false, false, false]
  let atFired = false
  const order: number[] = []
  let revealAge = -1
  let revealKind: EvoKind | 'levels' | null = null
  let flipped = false
  let swallowUntil = 0
  let holdBank = false
  let fromBoss = 0
  const log: { t: number; x: number; z: number; band: string; dist: number; lit: boolean }[] = []

  function reduced(): boolean {
    return reduce || document.documentElement.classList.contains('reduce-motion')
  }

  function armSwallow() {
    swallowUntil = performance.now() + ROW.reveal.holdMs
    const strip = document.getElementById('level-up')
    if (strip) strip.style.pointerEvents = 'none'
    window.setTimeout(() => {
      if (strip) strip.style.pointerEvents = ''
    }, ROW.reveal.holdMs)
  }

  function showCard(kind: EvoKind | 'levels') {
    revealKind = kind
    revealAge = 0
    flipped = false
    const row = kind === 'levels' ? null : pairOf(kind)
    from.textContent = row ? row.from : 'Sun Chest'
    name.textContent = row ? row.from : 'Sun Chest'
    pay.textContent = ''
    inner.classList.remove('flip', 'evolved')
    card.hidden = false
    armSwallow()
  }

  function finishReveal() {
    if (revealAge < 0) return
    revealAge = -1
    revealKind = null
    card.hidden = true
    inner.classList.remove('flip', 'evolved')
    armSwallow()
  }

  function skip() {
    if (revealAge < ROW.reveal.skip) return
    finishReveal()
  }

  card.addEventListener('pointerdown', (e) => {
    if (revealAge < ROW.reveal.skip) return
    e.preventDefault()
    e.stopPropagation()
    skip()
  })

  function locked(map: ChestEnv['map'], x: number, z: number): boolean {
    if (map === 'stair') {
      const dx = x + 1
      const dz = z
      return dx * dx + dz * dz < 16
    }
    if (map === 'cloister') return octDist(x, z) < 11.4
    return false
  }

  function spot(env: ChestEnv, min: number, max: number, needLit: boolean, sameFloor: boolean): { x: number; z: number } | null {
    for (let i = 0; i < 48; i++) {
      const ang = placeRng() * Math.PI * 2
      const dist = min + placeRng() * Math.max(0, max - min)
      const x = env.px + Math.cos(ang) * dist
      const z = env.pz + Math.sin(ang) * dist
      if (locked(env.map, x, z)) continue
      if (!insideArena(x, z, 0.45)) continue
      const resolved = resolveCircle(x, z, 0.45)
      const dx = resolved.x - x
      const dz = resolved.z - z
      if (dx * dx + dz * dz > 0.04) continue
      if (segmentBlocked(env.px, env.pz, resolved.x, resolved.z)) continue
      if (sameFloor && Math.abs(env.floorY(resolved.x, resolved.z) - env.floorY(env.px, env.pz)) > 0.45) continue
      const lit = env.mapLit(resolved.x, resolved.z)
      if (needLit && !lit) continue
      if (locked(env.map, resolved.x, resolved.z)) continue
      return { x: resolved.x, z: resolved.z }
    }
    return null
  }

  function trySpawn(env: ChestEnv, born: number) {
    if (list.length >= 3) return
    let found = spot(env, ROW.chest.near, ROW.chest.far, true, env.map === 'stair')
    let band: Chest['band'] = '8-14'
    if (!found) {
      found = spot(env, ROW.chest.wideNear, ROW.chest.wideFar, true, false)
      band = '6-18'
    }
    if (!found) {
      found = spot(env, 2, 22, false, false)
      band = 'floor'
    }
    if (!found) return
    const dist = Math.hypot(found.x - env.px, found.z - env.pz)
    const lit = env.mapLit(found.x, found.z)
    list.push({ x: found.x, z: found.z, born, fill: 0, band, dist, lit, flash: 0, open: false })
    log.push({ t: born, x: found.x, z: found.z, band, dist, lit })
  }

  function eligible(rank: (id: number) => number): EvoKind | null {
    let best: EvoKind | null = null
    let bestAt = 1e9
    for (let i = 0; i < PAIRS.length; i++) {
      const row = PAIRS[i]
      if (!row) continue
      if (evoOn(row.kind)) continue
      if (rank(row.id) < 5 || rank(row.passive) < 1) continue
      let at = order.indexOf(row.id)
      if (at < 0) at = 100 + i
      if (at < bestAt) {
        bestAt = at
        best = row.kind
      }
    }
    return best
  }

  function openChest(env: ChestEnv, chest: Chest) {
    chest.open = true
    const ready = env.w2 === 'ready' && evoLive()
    const kind = ready ? eligible(env.rank) : null
    if (!ready || !kind) env.grantTwo()
    if (kind) setEvo(kind, true)
    showCard(kind ?? 'levels')
    fx.glow(chest.x, chest.z, 1.8)
    fx.glint(chest.x, 2.6, chest.z, 1.4)
    fx.glint(chest.x, 4.4, chest.z, 0.9)
  }

  return {
    reset(seed: number) {
      placeRng = mulberry32((seed ^ 0x51ed5eed) >>> 0)
      list.length = 0
      fired[0] = false
      fired[1] = false
      fired[2] = false
      atFired = false
      order.length = 0
      finishReveal()
      holdBank = false
      fromBoss = 0
      log.length = 0
      lastFlash = -10
    },
    noteAcquire(id: number) {
      if (order.indexOf(id) >= 0) return
      order.push(id)
    },
    devMove(x: number, z: number, fill: number) {
      const chest = list[list.length - 1]
      if (!chest || chest.open) return false
      chest.x = x
      chest.z = z
      chest.fill = fill
      return true
    },
    syncAcquire(build: Build) {
      for (let i = 0; i < SLOT_ORDER.length; i++) {
        const id = SLOT_ORDER[i] ?? 0
        if (rankOf(build, id) > 0) this.noteAcquire(id)
      }
    },
    order() {
      return order.slice()
    },
    revealUp() {
      return revealAge >= 0
    },
    slowing() {
      return revealAge >= 0 && revealAge < ROW.reveal.slow
    },
    canSkip() {
      return revealAge >= ROW.reveal.skip
    },
    swallowing() {
      return performance.now() < swallowUntil
    },
    skip,
    holdBank() {
      holdBank = true
    },
    takeHold() {
      const held = holdBank && revealAge < 0
      if (held) holdBank = false
      return held
    },
    update(env: ChestEnv) {
      if (env.rawDt < 0) return
      for (let i = 0; i < 3; i++) {
        if (env.chestsOff || fired[i]) continue
        if (env.time + 1e-4 >= (TIMES[i] ?? 0)) {
          fired[i] = true
          trySpawn(env, TIMES[i] ?? env.time)
        }
      }
      if (env.dev && env.chestAt != null && !atFired && env.time + 1e-4 >= env.chestAt) {
        atFired = true
        trySpawn(env, env.time)
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const chest = list[i]
        if (!chest || chest.open) {
          list.splice(i, 1)
          continue
        }
        const forced = env.time - chest.born >= ROW.chest.fallback
        const sun = env.mapLit(chest.x, chest.z)
        if (sun || forced) chest.fill = Math.min(ROW.chest.sun, chest.fill + env.rawDt)
        chest.flash = Math.max(0, chest.flash - env.rawDt)
        const dx = env.px - chest.x
        const dz = env.pz - chest.z
        if (dx * dx + dz * dz > OPEN_R * OPEN_R) continue
        if (chest.fill + 1e-3 < ROW.chest.sun) {
          if (chest.flash <= 0) {
            chest.flash = 0.45
            fx.ring(chest.x, chest.z, 1.4, RING_GOLD, 0.25)
          }
          continue
        }
        if (env.w2 === 'loading') continue
        openChest(env, chest)
        list.splice(i, 1)
      }
      if (revealAge >= 0) {
        revealAge += env.rawDt
        const row = revealKind && revealKind !== 'levels' ? pairOf(revealKind) : null
        if (!flipped && revealAge >= 0.4) {
          flipped = true
          name.textContent = row ? row.name : 'Two level-ups'
          pay.textContent = row ? row.pay : 'Nothing ready. Two level-ups.'
          inner.classList.add('evolved')
          if (!reduced()) inner.classList.add('flip')
        }
        if (revealAge >= ROW.reveal.total) finishReveal()
      }
    },
    sync(view: ChestView) {
      let pointed = false
      let best = 1e9
      let px = 0
      let py = 0
      for (let i = 0; i < list.length; i++) {
        const chest = list[i]
        if (!chest) continue
        const pulse = 0.65 + 0.35 * Math.sin(view.time * 6)
        const charged = chest.fill + 1e-3 >= ROW.chest.sun
        arsenal.place(ARSENAL_PART.chest, chest.x, 0, chest.z, 0.4, 1.15, charged ? pulse : 0.15, 0)
        const rims = spinRims(chest.x, 0, chest.z, 0.4, 1.15, RIM)
        const rim = rimAt(rims, 0, chest.x, 0.4, chest.z)
        probePut('chest', charged ? 5 : 1, chest.x, 0.55, chest.z, rim.x, rim.y, rim.z, chest.x + 1.5, 0.02, chest.z, rims)
        const span = 0.7 + 1.5 * (chest.fill / ROW.chest.sun)
        fx.ring(chest.x, chest.z, span, charged ? RING_EDGE : RING_GOLD, 0.16)
        fx.glow(chest.x, chest.z, charged ? 1.3 : 0.8)
        aim.set(chest.x, 0.8, chest.z)
        aim.project(view.camera)
        const e = view.camera.matrixWorld.elements
        const fxw = -(e[8] ?? 0)
        const fyw = -(e[9] ?? 0)
        const fzw = -(e[10] ?? 0)
        const facing = (chest.x - view.camera.position.x) * fxw + (0.8 - view.camera.position.y) * fyw + (chest.z - view.camera.position.z) * fzw
        const inside = facing > 0 && Math.abs(aim.x) <= 1 && Math.abs(aim.y) <= 1
        if (inside) continue
        const dist = Math.hypot(chest.x - view.px, chest.z - view.pz)
        if (dist >= best) continue
        best = dist
        let nx = facing > 0 ? aim.x : -aim.x
        let ny = facing > 0 ? aim.y : -aim.y
        const m = Math.max(Math.abs(nx), Math.abs(ny), 0.001)
        nx /= m
        ny /= m
        const w = window.innerWidth || 1
        const h = window.innerHeight || 1
        px = (nx * 0.5 + 0.5) * w
        py = (-ny * 0.5 + 0.5) * h
        pointed = true
        pointer.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(py - h * 0.5, px - w * 0.5)}rad)`
      }
      pointer.hidden = !pointed
      if (pointed) {
        const w = window.innerWidth || 1
        const h = window.innerHeight || 1
        pointer.style.left = `${Math.max(16, Math.min(w - 16, px))}px`
        pointer.style.top = `${Math.max(16, Math.min(h - 16, py))}px`
      }
    },
    sample() {
      return {
        chests: list.map((c) => ({
          x: c.x,
          z: c.z,
          born: c.born,
          fill: c.fill,
          charged: c.fill + 1e-3 >= ROW.chest.sun,
          band: c.band,
          dist: c.dist,
          lit: c.lit,
        })),
        log: log.slice(),
        reveal: { up: revealAge >= 0, age: Math.max(0, revealAge), kind: revealKind, slow: revealAge >= 0 && revealAge < ROW.reveal.slow },
        order: order.slice(),
        fromBoss,
        evos: {
          spear: evoOn('spear'), halo: evoOn('halo'), flare: evoOn('flare'), bell: evoOn('bell'),
          helio: evoOn('helio'), scarab: evoOn('scarab'), stake: evoOn('stake'), prism: evoOn('prism'),
        },
      }
    },
  }
}

export function applyEvoAll(build: Build, evoAll: boolean, stress: boolean): void {
  if (!evoAll) return
  if (stress) {
    build.might = Math.max(1, build.might)
    build.haste = Math.max(1, build.haste)
    build.vitality = Math.max(1, build.vitality)
    build.swift = Math.max(1, build.swift)
    build.lodestone = Math.max(1, build.lodestone)
  }
  for (let i = 0; i < PAIRS.length; i++) {
    const row = PAIRS[i]
    if (!row) continue
    if (rankOf(build, row.id) < 5) continue
    if (rankOf(build, row.passive) < 1) {
      if (row.passive === CARD.might) build.might = 1
      else if (row.passive === CARD.haste) build.haste = 1
      else if (row.passive === CARD.swift) build.swift = 1
      else if (row.passive === CARD.vitality) build.vitality = 1
      else if (row.passive === CARD.lodestone) build.lodestone = 1
      else if (row.passive === CARD.multitude) build.multitude = Math.max(1, build.multitude)
      else if (row.passive === CARD.reach) build.reach = Math.max(1, build.reach)
      else if (row.passive === CARD.endurance) build.endurance = Math.max(1, build.endurance)
    }
    setEvo(row.kind, true)
  }
}
