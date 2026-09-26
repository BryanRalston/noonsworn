/** Sampled CC0 audio. Core events never use a raw oscillator as the primary sound. */

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
] as const

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
  cut: () => void
  xp: (step: number) => void
  level: () => void
  hurt: () => void
  shimmer: () => void
  ui: () => void
  death: () => void
  win: () => void
  bell: () => void
  step: () => void
  sample: () => void
  counts: () => Record<string, number>
  meter: () => { peak: number; clipped: number; voices: number; duck: number }
}

function preferOgg(): boolean {
  if (typeof Audio === 'undefined') return true
  return new Audio().canPlayType('audio/ogg; codecs=vorbis') !== ''
}

export function createAudio(fxRng: () => number): AudioBus {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let musicBus: GainNode | null = null
  let duckGain: GainNode | null = null
  let ambBus: GainNode | null = null
  let post: GainNode | null = null
  let analyser: AnalyserNode | null = null
  const wave = new Float32Array(2048)
  let unlocked = false
  let muted = false
  let loading = false
  let loaded = false
  let musicStarted = false
  let musicFailed = false
  let musicLevel = 0.45
  let sfxLevel = 0.9
  let ambLoop: AudioBufferSourceNode | null = null
  let musicLoop: AudioBufferSourceNode | null = null
  const ext = preferOgg() ? 'ogg' : 'm4a'
  const buffers = new Map<string, AudioBuffer>()
  const failed = new Set<string>()
  const counts: Record<string, number> = {
    spear: 0, hit: 0, exposed: 0, armored: 0, kill: 0, cut: 0, xp: 0, level: 0, hurt: 0, shimmer: 0, ui: 0, death: 0, win: 0, bell: 0, step: 0,
  }
  const live: Record<string, number> = { hit: 0, armored: 0, kill: 0, xp: 0, spear: 0, shimmer: 0, exposed: 0, hurt: 0, level: 0, total: 0 }
  let voicePeak = 0
  const caps: Record<string, number> = { hit: 6, armored: 3, kill: 6, xp: 4, spear: 4, shimmer: 3, exposed: 3, hurt: 2, level: 1 }
  let clipped = 0
  let held = 0
  let xpWindow = 0
  let xpPlays = 0
  let xpStep = 0
  let hitBurst = 0
  let hitBurstAt = 0
  let hitClustered = false

  function ensure(): AudioContext {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      sfxBus = ctx.createGain()
      musicBus = ctx.createGain()
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
      musicBus.connect(duckGain)
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
      ambBus.gain.value = 0.12
    }
    return ctx
  }

  async function loadOne(name: string) {
    if (buffers.has(name) || failed.has(name)) return
    const c = ensure()
    const base = import.meta.env.BASE_URL
    try {
      const res = await fetch(`${base}assets/audio/${name}.${ext}`)
      if (!res.ok) {
        failed.add(name)
        return
      }
      const data = await res.arrayBuffer()
      const buf = await c.decodeAudioData(data.slice(0))
      buffers.set(name, buf)
    } catch {
      failed.add(name)
    }
  }

  async function loadSet(names: readonly string[]) {
    await Promise.all(names.map((name) => loadOne(name)))
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
      if (master) master.gain.value = next ? 0 : 1
    },
    setVolumes(m, s) {
      if (master && !muted) master.gain.value = m
      sfxLevel = s
      if (sfxBus) sfxBus.gain.value = s
    },
    setMusic(value) {
      musicLevel = value
      if (musicBus) musicBus.gain.value = value
    },
    setSfx(value) {
      sfxLevel = value
      if (sfxBus) sfxBus.gain.value = value
    },
    startMusic() {
      if (musicStarted || musicFailed) return
      musicStarted = true
      const base = import.meta.env.BASE_URL
      void fetch(`${base}assets/audio/music_desert_loop.${ext}`)
        .then((res) => {
          if (!res.ok) throw new Error('music')
          return res.arrayBuffer()
        })
        .then((data) => ensure().decodeAudioData(data.slice(0)))
        .then((buf) => {
          buffers.set('music_desert_loop', buf)
          if (!musicLoop) musicLoop = loop('music_desert_loop', musicBus)
        })
        .catch(() => {
          musicFailed = true
        })
    },
    stopMusic() {
      musicLoop?.stop()
      musicLoop = null
      musicStarted = false
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
    hurt() {
      mark('hurt')
      duck()
      one(hurts, 0.5, 'hurt')
    },
    shimmer() {
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
  }
}
