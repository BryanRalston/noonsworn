/** Sampled CC0 audio. Core events never use a raw oscillator as the primary sound. */

import type { MusicHandle, MusicState } from './music'

const NAMES = [
  'spear_throw_1', 'spear_throw_2', 'spear_throw_3',
  'cut_swish_1', 'cut_swish_2', 'cut_blade_1', 'cut_blade_2', 'cut_blade_3', 'cloth_1',
  'hit_stone_1', 'hit_stone_2', 'hit_stone_3', 'hit_thud_1', 'hit_thud_2',
  'armored_tink_1', 'armored_tink_2', 'armored_tink_3',
  'exposed_crack_1', 'exposed_crack_2',
  'kill_shatter_1', 'kill_shatter_2',
  'xp_chime_1', 'xp_chime_2', 'xp_chime_3', 'xp_pluck_1',
  'level_bell', 'level_bell_heavy', 'level_jingle',
  'shimmer_ding', 'hurt_1', 'hurt_2',
  'ui_click', 'ui_select', 'ui_confirm',
  'death_jingle', 'win_jingle',
  'footstep_stone_1', 'footstep_stone_2',
  'amb_wind_loop',
  'gate_rumble', 'mirror_hum_loop', 'mirror_fire', 'slab_warn', 'slab_slam',
  'spring_launch', 'spring_land', 'mirage_step', 'relic_get',
  'coin_bloom', 'shutter_open', 'shutter_close', 'darter_dart',
  'espalier_rake', 'espalier_slam', 'espalier_wake',
] as const

/** Map-only cues. Resident only while that map is current, so a Stair boss crossfade stays under 48 MiB. */
const MAP_FOLEY: Record<string, readonly string[]> = {
  sundial: [
    'gate_rumble', 'mirror_hum_loop', 'mirror_fire', 'slab_warn', 'slab_slam',
    'spring_launch', 'spring_land', 'mirage_step', 'relic_get',
  ],
  lattice: [
    'coin_bloom', 'shutter_open', 'shutter_close', 'darter_dart',
    'espalier_rake', 'espalier_slam', 'espalier_wake',
  ],
  cloister: [
    'water_fill', 'water_ebb', 'brim_chime', 'brimwash_warn', 'brimwash_crash',
    'blot_rise', 'blot_spit', 'votary_cowl', 'compline_wake', 'compline_pour',
    'compline_drink', 'compline_slam',
  ],
  stair: [
    'westering_bell', 'sun_glide', 'seal_set', 'seal_fade', 'pitch_bubble',
    'courser_pounce', 'hushmaw_feed', 'hushmaw_burst',
    'newel_wake', 'newel_cast', 'newel_sweep', 'newel_bow', 'newel_break', 'newel_fall',
  ],
}

const FOLEY_OWNER = new Map<string, string>()
for (const [map, names] of Object.entries(MAP_FOLEY)) {
  for (const name of names) FOLEY_OWNER.set(name, map)
}

const PENTA = [1, 1.122, 1.26, 1.335, 1.414, 1.498]

export interface AudioBus {
  unlock: () => void
  setMuted: (muted: boolean) => void
  setVolumes: (master: number, sfx: number) => void
  setMusic: (value: number) => void
  setSfx: (value: number) => void
  startMusic: () => void
  stopMusic: () => void
  spear: () => void
  hit: () => void
  exposed: () => void
  armored: () => void
  kill: (lit?: boolean) => void
  /** Body plus one sweetener. Rank breaks a 90 ms cluster: cut 3, bell/flare 2, finisher 1, hit 0. */
  contact: (lit: boolean, killed: boolean, rank: number, index: number) => void
  impactAudit: () => {
    hit: number
    hitPlay: number
    exposed: number
    exposedPlay: number
    armored: number
    armoredPlay: number
    kill: number
    killPlay: number
    clustered: number
    crackThrottle: number
  }
  cut: () => void
  xp: (step: number) => void
  level: () => void
  chime: () => void
  hurt: () => void
  shimmer: () => void
  ui: () => void
  death: () => void
  win: () => void
  bell: () => void
  step: () => void
  rumble: () => void
  mirrorFire: () => void
  slabWarn: () => void
  slabSlam: () => void
  springLaunch: () => void
  springLand: () => void
  mirage: () => void
  relic: () => void
  coinBloom: () => void
  shutterOpen: () => void
  shutterClose: () => void
  darterDart: () => void
  espalierRake: () => void
  espalierSlam: () => void
  espalierWake: () => void
  setHums: (n: number) => void
  duckTap: () => void
  sample: () => void
  counts: () => Record<string, number>
  meter: () => { peak: number; clipped: number; voices: number; duck: number }
  preload: (names: readonly string[]) => void
  cue: (name: string) => void
  bed: (name: string, gain: number) => void
  lowpass: (hz: number, seconds?: number) => void
  lowpassHz: () => number
  musicRate: (rate: number) => void
  weaponDuck: (on: boolean) => void
  enterMap: (map: string) => void
  leaveMap: () => void
  prefetchBoss: () => void
  wakeBoss: (map: string) => void
  setLit: (lit: boolean) => void
  fadeMusic: (seconds: number) => void
  playSunrise: () => void
  musicState: () => { sfx: number; peak: number; ext: string; music: MusicState | null }
}

function preferOgg(): boolean {
  if (typeof Audio === 'undefined') return true
  return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== ''
}

export function createAudio(fxRng: () => number): AudioBus {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let musicBus: GainNode | null = null
  let musicLow: BiquadFilterNode | null = null
  let duckGain: GainNode | null = null
  let lowHz = 18000
  let musicWant = 1
  let ambBus: GainNode | null = null
  let post: GainNode | null = null
  let analyser: AnalyserNode | null = null
  const wave = new Float32Array(2048)
  let unlocked = false
  let muted = false
  let loading = false
  let loaded = false
  let musicLevel = 0.45
  let sfxLevel = 0.9
  let ambLoop: AudioBufferSourceNode | null = null
  const ext = preferOgg() ? 'ogg' : 'm4a'
  const buffers = new Map<string, AudioBuffer>()
  const failed = new Set<string>()
  const counts: Record<string, number> = {
    spear: 0, hit: 0, exposed: 0, armored: 0, kill: 0, cut: 0, xp: 0, level: 0, hurt: 0, shimmer: 0, ui: 0, death: 0, win: 0, bell: 0, step: 0,
  }
  const live: Record<string, number> = { hit: 0, armored: 0, kill: 0, xp: 0, spear: 0, shimmer: 0, exposed: 0, hurt: 0, level: 0, total: 0 }
  let voicePeak = 0
  const caps: Record<string, number> = { hit: 6, armored: 3, kill: 6, xp: 4, spear: 4, shimmer: 3, exposed: 3, hurt: 2, level: 1, slam: 3, land: 1, hum: 2, bloom: 4, shutter: 2, dart: 4, boss: 2, water: 1, blot_spit: 3, compline: 1, seal: 2, fade: 1, feed: 2, stair: 4 }
  let clipped = 0
  let held = 0
  let xpWindow = 0
  let xpPlays = 0
  let xpStep = 0
  let hitBurst = 0
  let hitBurstAt = 0
  let hitClustered = false
  let clusterUntil = 0
  let clusterRank = -1
  let clusterBody = false
  let lastKillAccent = 0
  let killChain = 0
  let killChainAt = 0
  const crackAt: number[] = []
  const impact = {
    hit: 0, hitPlay: 0, exposed: 0, exposedPlay: 0, armored: 0, armoredPlay: 0,
    kill: 0, killPlay: 0, clustered: 0, crackThrottle: 0,
  }
  let shimmerAt = 0

  function ensure(): AudioContext {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      sfxBus = ctx.createGain()
      musicBus = ctx.createGain()
      musicLow = ctx.createBiquadFilter()
      musicLow.type = 'lowpass'
      musicLow.frequency.value = lowHz
      musicLow.Q.value = 0.707
      duckGain = ctx.createGain()
      ambBus = ctx.createGain()
      post = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -12
      comp.ratio.value = 4
      comp.knee.value = 6
      comp.attack.value = 0.003
      comp.release.value = 0.18
      const limit = ctx.createDynamicsCompressor()
      limit.threshold.value = -3
      limit.ratio.value = 20
      limit.knee.value = 0
      limit.attack.value = 0.001
      limit.release.value = 0.05
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0
      sfxBus.connect(master)
      musicBus.connect(musicLow)
      musicLow.connect(duckGain)
      duckGain.connect(master)
      ambBus.connect(master)
      master.connect(comp)
      comp.connect(limit)
      limit.connect(post)
      post.connect(analyser)
      analyser.connect(ctx.destination)
      master.gain.value = muted ? 0 : 1
      post.gain.value = 0.89
      sfxBus.gain.value = sfxLevel
      musicBus.gain.value = musicLevel
      duckGain.gain.value = 1
      ambBus.gain.value = 0.12 * sfxLevel
    }
    return ctx
  }

  const CORE = new Set<string>(NAMES.slice(0, 15))
  let ducked = false
  let masterLevel = 1
  let musicHandle: MusicHandle | null = null
  let opening: Promise<MusicHandle | null> | null = null
  let chain: Promise<void> = Promise.resolve()
  let musicBytes = 0
  let peakDecoded = 0
  let mapLive = false
  let menuAsked = false
  let bossAsked = false
  let litWant = true
  let foleyMap = ''
  const inflight = new Map<string, Promise<void>>()

  function foleyAllowed(name: string): boolean {
    const owner = FOLEY_OWNER.get(name)
    if (!owner) return true
    return owner === foleyMap
  }

  function clampVol(n: number): number {
    if (!Number.isFinite(n)) return 0
    if (n < 0) return 0
    if (n > 1) return 1
    return n
  }

  function sfxDecoded(): number {
    let n = 0
    for (const buf of buffers.values()) n += buf.length * buf.numberOfChannels * 4
    return n
  }

  function noteDecoded(music = musicBytes) {
    musicBytes = music
    const total = music + sfxDecoded()
    if (total > peakDecoded) peakDecoded = total
  }

  function applySfx() {
    if (sfxBus) sfxBus.gain.value = sfxLevel * (ducked ? 0.75 : 1)
    if (ambBus) ambBus.gain.value = 0.12 * sfxLevel
  }

  function hearNow(): number {
    return muted ? 0 : masterLevel
  }

  function readyMusic(): Promise<MusicHandle | null> {
    if (musicHandle) return Promise.resolve(musicHandle)
    if (!opening) {
      const c = ensure()
      const bus = musicBus
      const low = musicLow
      const duck = duckGain
      if (!bus || !low || !duck) return Promise.resolve(null)
      opening = import('./music')
        .then((mod) => {
          musicHandle = mod.attachMusic(c, {
            musicBus: bus,
            musicLow: low,
            duck,
            ext,
            base: import.meta.env.BASE_URL,
            hear: hearNow(),
            onBytes: (n) => noteDecoded(n),
          })
          musicHandle.setMusic(musicLevel)
          musicHandle.setHear(hearNow())
          musicHandle.rate(musicWant)
          musicHandle.setLit(litWant)
          return musicHandle
        })
        .catch(() => null)
    }
    return opening
  }

  function useMusic(fn: (bus: MusicHandle) => void) {
    chain = chain
      .then(async () => {
        const bus = await readyMusic()
        if (bus) fn(bus)
      })
      .catch(() => undefined)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  })

  async function loadOne(name: string) {
    if (!foleyAllowed(name)) return
    if (buffers.has(name) || failed.has(name)) return
    const pending = inflight.get(name)
    if (pending) return pending
    const run = (async () => {
      const c = ensure()
      const base = import.meta.env.BASE_URL
      const url = `${base}assets/audio/${name}.${ext}`
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 150 * attempt))
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(String(res.status))
          const data = await res.arrayBuffer()
          const buf = await c.decodeAudioData(data.slice(0))
          if (!foleyAllowed(name)) return
          buffers.set(name, buf)
          noteDecoded()
          return
        } catch {
          if (attempt === 2) failed.add(name)
        }
      }
    })().finally(() => {
      inflight.delete(name)
    })
    inflight.set(name, run)
    return run
  }

  async function pump(queue: string[]) {
    let cursor = 0
    const workers = Math.min(4, queue.length)
    const worker = async () => {
      while (cursor < queue.length) {
        const name = queue[cursor]
        cursor += 1
        if (name) await loadOne(name)
      }
    }
    if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()))
  }

  let loadChain: Promise<void> = Promise.resolve()

  async function loadSetNow(names: readonly string[]) {
    const core: string[] = []
    const rest: string[] = []
    for (const name of names) {
      if (!foleyAllowed(name)) continue
      if (CORE.has(name)) core.push(name)
      else rest.push(name)
    }
    await pump(core)
    await pump(rest)
  }

  function loadSet(names: readonly string[]): Promise<void> {
    const run = loadChain.then(() => loadSetNow(names))
    loadChain = run.then(() => undefined, () => undefined)
    return run
  }

  function mark(name: string) {
    if (!unlocked) return
    counts[name] = (counts[name] ?? 0) + 1
  }

  function play(name: string, bus: GainNode | null, gain: number, rate: number, kind: string | null) {
    if (!unlocked || muted || !ctx || !bus) return
    const buf = buffers.get(name)
    if (!buf) return
    if (kind) {
      const cap = caps[kind] ?? 24
      if ((live[kind] ?? 0) >= cap || (live.total ?? 0) >= 24) return
      live[kind] = (live[kind] ?? 0) + 1
    }
    if ((live.total ?? 0) >= 24) return
    live.total = (live.total ?? 0) + 1
    if ((live.total ?? 0) > voicePeak) voicePeak = live.total ?? 0
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(g)
    g.connect(bus)
    src.onended = () => {
      live.total = Math.max(0, (live.total ?? 1) - 1)
      if (kind) live[kind] = Math.max(0, (live[kind] ?? 1) - 1)
    }
    src.start()
  }

  function vary(baseGain: number): { gain: number; rate: number } {
    const rate = 1 + (fxRng() * 2 - 1) * 0.08
    const db = (fxRng() * 2 - 1) * 3
    return { gain: baseGain * Math.pow(10, db / 20), rate }
  }

  function pick(names: string[]): string {
    return names[Math.floor(fxRng() * names.length) % names.length] ?? names[0] ?? ''
  }

  function one(names: string[], gain: number, kind: string | null) {
    const v = vary(gain)
    play(pick(names), sfxBus, v.gain, v.rate, kind)
  }

  function newelDisc() {
    if (!unlocked || muted) return
    const c = ensure()
    if (!sfxBus) return
    const now = c.currentTime
    const ring = c.createGain()
    ring.gain.setValueAtTime(0.0001, now)
    ring.gain.exponentialRampToValueAtTime(0.2, now + 0.004)
    ring.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    ring.connect(sfxBus)
    const freqs = [210, 420, 630]
    for (let i = 0; i < freqs.length; i++) {
      const osc = c.createOscillator()
      osc.type = i === 0 ? 'triangle' : 'sine'
      const f = freqs[i] ?? 210
      osc.frequency.setValueAtTime(f, now)
      osc.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.18)
      const g = c.createGain()
      g.gain.value = i === 0 ? 0.8 : 0.28
      osc.connect(g)
      g.connect(ring)
      osc.start(now)
      osc.stop(now + 0.24)
    }
  }

  const gateAt: Record<string, number[]> = {}
  function gated(name: string, perSec: number): boolean {
    const now = performance.now()
    const list = gateAt[name] ?? (gateAt[name] = [])
    while (list.length && (list[0] ?? 0) < now - 1000) list.shift()
    if (list.length >= perSec) return false
    list.push(now)
    return true
  }

  const beds = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>()
  function bed(name: string, gain: number) {
    if (!unlocked || !ctx || !sfxBus) return
    const row = beds.get(name)
    if (gain <= 0) {
      if (row) row.gain.gain.value = 0
      return
    }
    if (!row) {
      const buf = buffers.get(name)
      if (!buf) return
      const g = ctx.createGain()
      g.gain.value = gain
      g.connect(sfxBus)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(g)
      src.start()
      beds.set(name, { src, gain: g })
      return
    }
    row.gain.gain.value = gain
  }

  function haloClank() {
    if (!unlocked || muted) return
    const c = ensure()
    if (!sfxBus) return
    const now = c.currentTime
    const ring = c.createGain()
    ring.gain.setValueAtTime(0.0001, now)
    ring.gain.exponentialRampToValueAtTime(0.16, now + 0.006)
    ring.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
    ring.connect(sfxBus)
    const freqs = [780, 1240]
    for (let i = 0; i < freqs.length; i++) {
      const osc = c.createOscillator()
      osc.type = i === 0 ? 'triangle' : 'sine'
      const f = freqs[i] ?? 780
      osc.frequency.setValueAtTime(f, now)
      osc.frequency.exponentialRampToValueAtTime(f * 0.64, now + 0.14)
      const g = c.createGain()
      g.gain.value = i === 0 ? 0.72 : 0.32
      osc.connect(g)
      g.connect(ring)
      osc.start(now)
      osc.stop(now + 0.18)
    }
  }

  function duckTap() {
    if (!ctx || !duckGain) return
    const now = ctx.currentTime
    const g = duckGain.gain
    if (g.value < 0.7) return
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0.708, now + 0.02)
    g.linearRampToValueAtTime(0.708, now + 0.25)
    g.linearRampToValueAtTime(1, now + 0.42)
  }

  const hums: AudioBufferSourceNode[] = []
  function setHums(n: number) {
    const want = Math.max(0, Math.min(2, n | 0))
    while (hums.length < want) {
      const src = loop('mirror_hum_loop', sfxBus)
      if (!src) break
      hums.push(src)
    }
    while (hums.length > want) {
      const src = hums.pop()
      if (!src) continue
      try {
        src.stop()
      } catch {
        /* already ended */
      }
      src.buffer = null
      try {
        src.disconnect()
      } catch {
        /* already disconnected */
      }
    }
  }

  function stopHeld(src: AudioBufferSourceNode, gain?: GainNode) {
    try {
      src.stop()
    } catch {
      /* already ended */
    }
    src.buffer = null
    try {
      src.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      gain?.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  /** Drop every other map's decoded cues, then load this map's set. Menu keeps none. */
  function keepFoley(map: string) {
    foleyMap = map
    if (map !== 'sundial') setHums(0)
    for (const [name, row] of beds) {
      if (foleyAllowed(name)) continue
      stopHeld(row.src, row.gain)
      beds.delete(name)
    }
    for (const name of [...buffers.keys()]) {
      if (!foleyAllowed(name)) buffers.delete(name)
    }
    noteDecoded()
    const extra = MAP_FOLEY[map]
    if (extra && extra.length) void loadSet(extra)
  }

  function duck() {
    if (!ctx || !duckGain) return
    const now = ctx.currentTime
    const g = duckGain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(1, now)
    g.linearRampToValueAtTime(0.5, now + 0.04)
    g.linearRampToValueAtTime(0.5, now + 0.36)
    g.linearRampToValueAtTime(1, now + 0.52)
  }

  function loop(name: string, bus: GainNode | null): AudioBufferSourceNode | null {
    if (!ctx || !bus) return null
    const buf = buffers.get(name)
    if (!buf) return null
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.playbackRate.value = musicWant
    src.connect(bus)
    src.start()
    return src
  }

  const spears = ['spear_throw_1', 'spear_throw_2', 'spear_throw_3']
  const stones = ['hit_stone_1', 'hit_stone_2', 'hit_stone_3', 'hit_thud_1', 'hit_thud_2']
  const tinks = ['armored_tink_1', 'armored_tink_2', 'armored_tink_3']
  const cracks = ['exposed_crack_1', 'exposed_crack_2']
  const shatters = ['kill_shatter_1', 'kill_shatter_2']
  const chimes = ['xp_chime_1', 'xp_chime_2', 'xp_chime_3', 'xp_pluck_1']
  const hurts = ['hurt_1', 'hurt_2']
  const swishes = ['cut_swish_1', 'cut_swish_2']
  const blades = ['cut_blade_1', 'cut_blade_2', 'cut_blade_3']
  const bells = ['level_bell', 'level_bell_heavy']
  const feet = ['footstep_stone_1', 'footstep_stone_2']
  const uiNames = ['ui_click', 'ui_select', 'ui_confirm']

  return {
    unlock() {
      unlocked = true
      const c = ensure()
      if (c.state === 'suspended') void c.resume()
      if (!menuAsked && !mapLive) {
        menuAsked = true
        useMusic((bus) => bus.menu())
      }
      if (!loading && !loaded) {
        loading = true
        void loadSet(NAMES).then(() => {
          loaded = true
          if (!ambLoop) ambLoop = loop('amb_wind_loop', ambBus)
        })
      }
    },
    setMuted(next) {
      muted = next
      const g = hearNow()
      if (master) master.gain.value = g
      if (musicHandle) musicHandle.setHear(g)
    },
    setVolumes(m, s) {
      masterLevel = clampVol(m)
      const g = hearNow()
      if (master) master.gain.value = g
      if (musicHandle) musicHandle.setHear(g)
      sfxLevel = clampVol(s)
      applySfx()
    },
    setMusic(value) {
      musicLevel = clampVol(value)
      if (musicHandle) musicHandle.setMusic(musicLevel)
      else if (musicBus) musicBus.gain.value = musicLevel
    },
    setSfx(value) {
      sfxLevel = clampVol(value)
      applySfx()
    },
    startMusic() {
      if (mapLive || menuAsked) return
      menuAsked = true
      useMusic((bus) => bus.menu())
    },
    stopMusic() {
      mapLive = false
      menuAsked = false
      bossAsked = false
      useMusic((bus) => bus.stop())
    },
    enterMap(map) {
      mapLive = true
      menuAsked = true
      bossAsked = false
      keepFoley(map)
      useMusic((bus) => bus.enter(map))
    },
    leaveMap() {
      mapLive = false
      bossAsked = false
      menuAsked = true
      keepFoley('')
      useMusic((bus) => bus.leave())
    },
    prefetchBoss() {
      if (bossAsked) return
      bossAsked = true
      useMusic((bus) => bus.prefetchBoss())
    },
    wakeBoss(map) {
      useMusic((bus) => bus.wakeBoss(map))
    },
    setLit(lit) {
      if (lit === litWant) return
      litWant = lit
      useMusic((bus) => bus.setLit(litWant))
    },
    fadeMusic(seconds) {
      useMusic((bus) => bus.fadeOut(seconds))
    },
    playSunrise() {
      useMusic((bus) => bus.sunrise())
    },
    musicState() {
      return { sfx: sfxDecoded(), peak: peakDecoded, ext, music: musicHandle ? musicHandle.state() : null }
    },
    counts() {
      return { ...counts }
    },
    sample() {
      if (!analyser) return
      analyser.getFloatTimeDomainData(wave)
      for (let i = 0; i < wave.length; i++) {
        const a = Math.abs(wave[i] ?? 0)
        if (a > held) held = a
        if (a >= 1) clipped++
      }
    },
    preload(names) {
      void loadSet(names)
    },
    cue(name) {
      if (name === 'compline_halo') {
        haloClank()
        return
      }
      if (name === 'newel_disc') {
        newelDisc()
        return
      }
      if (name === 'seal_set' && !gated(name, 8)) return
      if (name === 'seal_fade' && !gated(name, 2)) return
      const kind = name === 'water_fill' || name === 'water_ebb' ? 'water'
        : name === 'blot_spit' ? 'blot_spit'
        : name.startsWith('compline') ? 'compline'
        : name === 'seal_set' ? 'seal'
        : name === 'seal_fade' ? 'fade'
        : name === 'hushmaw_feed' ? 'feed'
        : name.startsWith('newel') || name.startsWith('courser') || name.startsWith('hushmaw') || name === 'westering_bell' || name === 'sun_glide' ? 'stair'
        : null
      const rate = name === 'seal_set' ? 1 + (fxRng() * 2 - 1) * 0.06 : 1
      play(name, sfxBus, 0.7, rate, kind)
      if (name === 'brimwash_crash' || name === 'compline_slam' || name === 'newel_cast' || name === 'newel_fall') duckTap()
    },
    bed,
    lowpass(hz, seconds = 1) {
      if (!musicLow || !ctx) return
      if (Math.abs(lowHz - hz) < 1 && seconds <= 1) return
      lowHz = hz
      const now = ctx.currentTime
      const freq = musicLow.frequency
      freq.cancelScheduledValues(now)
      freq.setValueAtTime(freq.value, now)
      freq.linearRampToValueAtTime(hz, now + Math.max(0.05, seconds))
    },
    lowpassHz: () => lowHz,
    musicRate(rate) {
      musicWant = rate
      if (musicHandle) musicHandle.rate(rate)
      else useMusic((bus) => bus.rate(musicWant))
    },
    weaponDuck(on) {
      ducked = on
      applySfx()
    },
    meter() {
      const db = 20 * Math.log10(Math.max(held, 1e-5))
      const param = duckGain?.gain as (AudioParam & { getValueAtTime?: (time: number) => number }) | undefined
      const duck = param?.getValueAtTime ? param.getValueAtTime(ctx?.currentTime ?? 0) : (param?.value ?? 1)
      return { peak: db, clipped, voices: Math.max(live.total ?? 0, voicePeak), duck }
    },
    spear() {
      mark('spear')
      one(spears, 0.28, 'spear')
    },
    hit() {
      const now = performance.now()
      if (now - hitBurstAt > 100) {
        hitBurst = 0
        hitBurstAt = now
        hitClustered = false
      }
      hitBurst++
      if (hitBurst > 6) {
        if (!hitClustered) {
          hitClustered = true
          mark('hit')
          const v = vary(0.7)
          play(pick(stones), sfxBus, v.gain, v.rate, 'hit')
        }
        return
      }
      mark('hit')
      one(stones, 0.42, 'hit')
    },
    exposed() {
      mark('exposed')
      one(cracks, 0.34, 'exposed')
    },
    armored() {
      mark('armored')
      one(tinks, 0.32, 'armored')
    },
    kill(lit = true) {
      mark('kill')
      one(shatters, lit ? 0.4 : 0.4 * Math.pow(10, -6 / 20), 'kill')
    },
    contact(lit, killed, rank, index) {
      const now = performance.now()
      impact.hit++
      mark('hit')
      if (now > clusterUntil) {
        clusterUntil = now + 90
        clusterRank = rank
        clusterBody = false
      } else if (rank < clusterRank) {
        impact.clustered++
        return
      } else if (rank > clusterRank) {
        clusterRank = rank
        clusterBody = false
      } else if (clusterBody && !killed) {
        impact.clustered++
        return
      }
      if (!clusterBody) {
        clusterBody = true
        impact.hitPlay++
        const body = vary(0.42)
        play(pick(stones), sfxBus, body.gain, body.rate, 'hit')
      }
      if (killed && lit) {
        crackAt[index] = now
        if (now - lastKillAccent < 120) {
          impact.kill++
          impact.clustered++
          return
        }
        lastKillAccent = now
        if (now - killChainAt > 400) killChain = 0
        const semi = killChain
        killChain = killChain >= 5 ? 0 : killChain + 1
        killChainAt = now
        impact.kill++
        impact.killPlay++
        mark('kill')
        const v = vary(0.4)
        play(pick(shatters), sfxBus, v.gain, v.rate * Math.pow(2, semi / 12), 'kill')
        return
      }
      if (killed) {
        if (now - lastKillAccent < 120) {
          impact.kill++
          impact.clustered++
          return
        }
        lastKillAccent = now
        impact.kill++
        impact.killPlay++
        mark('kill')
        const v = vary(0.4 * Math.pow(10, -6 / 20))
        play(pick(shatters), sfxBus, v.gain, v.rate, 'kill')
        return
      }
      if (lit) {
        const prev = crackAt[index] ?? -1e9
        if (now - prev < 500) {
          impact.exposed++
          impact.crackThrottle++
          return
        }
        crackAt[index] = now
        impact.exposed++
        impact.exposedPlay++
        mark('exposed')
        const v = vary(0.34)
        play(pick(cracks), sfxBus, v.gain, v.rate, 'exposed')
        return
      }
      impact.armored++
      impact.armoredPlay++
      mark('armored')
      const v = vary(0.32)
      play(pick(tinks), sfxBus, v.gain, v.rate * Math.pow(2, -2 / 12), 'armored')
    },
    impactAudit() {
      return { ...impact }
    },
    cut() {
      mark('cut')
      one(swishes, 0.4, null)
      one(blades, 0.34, null)
      one(['cloth_1'], 0.22, null)
    },
    xp(step: number) {
      const now = performance.now()
      if (now - xpWindow > 1000) {
        xpWindow = now
        xpPlays = 0
        xpStep = Math.max(0, step % PENTA.length)
      }
      if (xpPlays >= 4) return
      xpPlays++
      xpStep = Math.min(PENTA.length - 1, xpStep + 1)
      mark('xp')
      const v = vary(0.3)
      const rate = Math.min(1.5, (PENTA[xpStep] ?? 1) * v.rate)
      play(pick(chimes), sfxBus, v.gain, rate, 'xp')
    },
    level() {
      mark('level')
      duck()
      one(bells, 0.45, 'level')
      one(['level_jingle'], 0.4, null)
    },
    chime() {
      mark('level')
      one(['level_jingle'], 0.42, 'level')
    },
    hurt() {
      mark('hurt')
      duck()
      one(hurts, 0.5, 'hurt')
    },
    shimmer() {
      const now = performance.now()
      if (now - shimmerAt < 125) return
      shimmerAt = now
      mark('shimmer')
      one(['shimmer_ding'], 0.18, 'shimmer')
    },
    ui() {
      mark('ui')
      one(uiNames, 0.35, null)
    },
    death() {
      mark('death')
      one(['death_jingle'], 0.5, null)
    },
    win() {
      mark('win')
      one(['win_jingle'], 0.5, null)
    },
    bell() {
      mark('bell')
      one(bells, 0.4, null)
    },
    step() {
      mark('step')
      one(feet, Math.pow(10, -18 / 20), null)
    },
    rumble() {
      mark('rumble')
      one(['gate_rumble'], 0.55, null)
    },
    mirrorFire() {
      mark('mirror')
      one(['mirror_fire'], 0.4, null)
    },
    slabWarn() {
      mark('slab')
      one(['slab_warn'], 0.38, null)
    },
    slabSlam() {
      mark('slab')
      one(['slab_slam'], 0.5, 'slam')
    },
    springLaunch() {
      mark('spring')
      one(['spring_launch'], 0.42, null)
    },
    springLand() {
      mark('spring')
      one(['spring_land'], 0.48, 'land')
    },
    mirage() {
      mark('mirage')
      one(['mirage_step'], 0.4, null)
    },
    relic() {
      mark('relic')
      one(['relic_get'], 0.45, null)
    },
    coinBloom() {
      mark('coin')
      one(['coin_bloom'], 0.42, 'bloom')
    },
    shutterOpen() {
      mark('shutter')
      one(['shutter_open'], 0.46, 'shutter')
    },
    shutterClose() {
      mark('shutter')
      one(['shutter_close'], 0.4, 'shutter')
    },
    darterDart() {
      mark('dart')
      one(['darter_dart'], 0.36, 'dart')
    },
    espalierRake() {
      mark('rake')
      one(['espalier_rake'], 0.48, 'boss')
    },
    espalierSlam() {
      mark('slam')
      one(['espalier_slam'], 0.5, 'boss')
    },
    espalierWake() {
      mark('wake')
      one(['espalier_wake'], 0.5, 'boss')
    },
    setHums,
    duckTap,
  }
}
