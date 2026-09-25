/** Sampled CC0 audio. Core events never use a raw oscillator as the primary sound. */

const SFX = [
  'spear_throw_1.ogg', 'spear_throw_2.ogg', 'spear_throw_3.ogg',
  'cut_swish_1.ogg', 'cut_swish_2.ogg', 'cut_blade_1.ogg', 'cut_blade_2.ogg', 'cut_blade_3.ogg', 'cloth_1.ogg',
  'hit_stone_1.ogg', 'hit_stone_2.ogg', 'hit_stone_3.ogg', 'hit_thud_1.ogg', 'hit_thud_2.ogg',
  'armored_tink_1.ogg', 'armored_tink_2.ogg', 'armored_tink_3.ogg',
  'exposed_crack_1.ogg', 'exposed_crack_2.ogg',
  'kill_shatter_1.ogg', 'kill_shatter_2.ogg', 'kill_soft_1.ogg', 'kill_soft_2.ogg',
  'xp_chime_1.ogg', 'xp_chime_2.ogg', 'xp_chime_3.ogg', 'xp_pluck_1.ogg',
  'level_bell.ogg', 'level_jingle.ogg',
  'shimmer_ding.ogg', 'hurt_1.ogg', 'hurt_2.ogg',
  'ui_click.ogg', 'ui_confirm.ogg',
  'death_jingle.ogg', 'win_jingle.ogg',
  'amb_wind_loop.ogg',
] as const

const PENTA = [1, 1.122, 1.26, 1.498, 1.682, 2]

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
  counts: () => Record<string, number>
  meter: () => { peak: number; clipped: number; voices: number }
}

export function createAudio(fxRng: () => number): AudioBus {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let musicBus: GainNode | null = null
  let ambBus: GainNode | null = null
  let analyser: AnalyserNode | null = null
  const wave = new Float32Array(1024)
  let unlocked = false
  let muted = false
  let loading = false
  let loaded = false
  let musicStarted = false
  let musicLevel = 0.45
  let sfxLevel = 0.9
  let ambLoop: AudioBufferSourceNode | null = null
  let musicLoop: AudioBufferSourceNode | null = null
  const buffers = new Map<string, AudioBuffer>()
  const counts: Record<string, number> = {
    spear: 0, hit: 0, exposed: 0, armored: 0, kill: 0, cut: 0, xp: 0, level: 0, hurt: 0, shimmer: 0, ui: 0, death: 0, win: 0, bell: 0,
  }
  const live: Record<string, number> = { hit: 0, armored: 0, kill: 0, xp: 0, spear: 0, total: 0 }
  let voicePeak = 0
  const caps: Record<string, number> = { hit: 6, armored: 3, kill: 6, xp: 4, spear: 4 }
  let clipped = 0
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
      ambBus = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -12
      comp.ratio.value = 4
      comp.knee.value = 6
      comp.attack.value = 0.003
      comp.release.value = 0.18
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      sfxBus.connect(master)
      musicBus.connect(master)
      ambBus.connect(master)
      master.connect(comp)
      comp.connect(analyser)
      analyser.connect(ctx.destination)
      master.gain.value = muted ? 0 : 0.9
      sfxBus.gain.value = sfxLevel
      musicBus.gain.value = musicLevel
      ambBus.gain.value = 0.12
    }
    return ctx
  }

  async function loadSet(names: readonly string[]) {
    const c = ensure()
    const base = import.meta.env.BASE_URL
    await Promise.all(names.map(async (name) => {
      if (buffers.has(name)) return
      const res = await fetch(`${base}assets/audio/${name}`)
      if (!res.ok) return
      const data = await res.arrayBuffer()
      const buf = await c.decodeAudioData(data.slice(0))
      buffers.set(name, buf)
    }))
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
    if (!ctx || !musicBus) return
    const now = ctx.currentTime
    const g = musicBus.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(musicLevel, now)
    g.linearRampToValueAtTime(musicLevel * 0.5, now + 0.04)
    g.linearRampToValueAtTime(musicLevel, now + 0.44)
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

  const spears = ['spear_throw_1.ogg', 'spear_throw_2.ogg', 'spear_throw_3.ogg']
  const stones = ['hit_stone_1.ogg', 'hit_stone_2.ogg', 'hit_stone_3.ogg', 'hit_thud_1.ogg', 'hit_thud_2.ogg']
  const tinks = ['armored_tink_1.ogg', 'armored_tink_2.ogg', 'armored_tink_3.ogg']
  const cracks = ['exposed_crack_1.ogg', 'exposed_crack_2.ogg']
  const shatters = ['kill_shatter_1.ogg', 'kill_shatter_2.ogg']
  const softs = ['kill_soft_1.ogg', 'kill_soft_2.ogg']
  const chimes = ['xp_chime_1.ogg', 'xp_chime_2.ogg', 'xp_chime_3.ogg', 'xp_pluck_1.ogg']
  const hurts = ['hurt_1.ogg', 'hurt_2.ogg']
  const swishes = ['cut_swish_1.ogg', 'cut_swish_2.ogg']
  const blades = ['cut_blade_1.ogg', 'cut_blade_2.ogg', 'cut_blade_3.ogg']

  return {
    unlock() {
      unlocked = true
      const c = ensure()
      if (c.state === 'suspended') void c.resume()
      if (!loading && !loaded) {
        loading = true
        void loadSet(SFX).then(() => {
          loaded = true
          if (!ambLoop) ambLoop = loop('amb_wind_loop.ogg', ambBus)
        }).catch(() => {
          loading = false
        })
      }
    },
    setMuted(next) {
      muted = next
      if (master) master.gain.value = next ? 0 : 0.9
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
      if (musicStarted) return
      musicStarted = true
      const base = import.meta.env.BASE_URL
      void fetch(`${base}assets/audio/music_desert_loop.ogg`)
        .then((res) => res.arrayBuffer())
        .then((data) => ensure().decodeAudioData(data.slice(0)))
        .then((buf) => {
          buffers.set('music_desert_loop.ogg', buf)
          if (!musicLoop) musicLoop = loop('music_desert_loop.ogg', musicBus)
        })
        .catch(() => undefined)
    },
    stopMusic() {
      musicLoop?.stop()
      musicLoop = null
      musicStarted = false
    },
    counts() {
      return { ...counts }
    },
    meter() {
      if (!analyser) return { peak: -96, clipped, voices: live.total ?? 0 }
      analyser.getFloatTimeDomainData(wave)
      let peak = 0
      for (let i = 0; i < wave.length; i++) {
        const a = Math.abs(wave[i] ?? 0)
        if (a > peak) peak = a
        if (a >= 0.999) clipped++
      }
      const db = 20 * Math.log10(Math.max(peak, 1e-5))
      return { peak: db, clipped, voices: Math.max(live.total ?? 0, voicePeak) }
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
      one(cracks, 0.34, null)
    },
    armored() {
      mark('armored')
      one(tinks, 0.32, 'armored')
    },
    kill(lit = true) {
      mark('kill')
      one(lit ? shatters : softs, 0.4, 'kill')
    },
    cut() {
      mark('cut')
      one(swishes, 0.4, null)
      one(blades, 0.34, null)
      one(['cloth_1.ogg'], 0.22, null)
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
      play(pick(chimes), sfxBus, v.gain, (PENTA[xpStep] ?? 1) * v.rate, 'xp')
    },
    level() {
      mark('level')
      duck()
      one(['level_bell.ogg'], 0.45, null)
      one(['level_jingle.ogg'], 0.4, null)
    },
    hurt() {
      mark('hurt')
      duck()
      one(hurts, 0.5, null)
    },
    shimmer() {
      mark('shimmer')
      one(['shimmer_ding.ogg'], 0.18, null)
    },
    ui() {
      mark('ui')
      one(['ui_click.ogg', 'ui_confirm.ogg'], 0.35, null)
    },
    death() {
      mark('death')
      one(['death_jingle.ogg'], 0.5, null)
    },
    win() {
      mark('win')
      one(['win_jingle.ogg'], 0.5, null)
    },
    bell() {
      mark('bell')
      one(['level_bell.ogg'], 0.4, null)
    },
  }
}
