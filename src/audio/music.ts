/** Lazy music graph. Loop points come from music_manifest.json. */

export interface MusicState {
  ext: string
  sources: number
  decoded: number
  peak: number
  cues: { name: string; samples: number; rate: number; channels: number; diff: number }[]
  shifts: { name: string; diff: number; shift: number }[]
}

export interface MusicHandle {
  stop: () => void
  menu: () => void
  enter: (map: string) => void
  leave: () => void
  prefetchBoss: () => void
  wakeBoss: (map: string) => void
  setLit: (lit: boolean) => void
  setMusic: (value: number) => void
  setHear: (value: number) => void
  fadeOut: (seconds: number) => void
  sunrise: () => void
  rate: (value: number) => void
  state: () => MusicState
}

interface Side {
  decodedSamples48k: number
  loopStart?: number
  loopEnd?: number
}

interface CueRow {
  kind?: string
  ogg?: Side
  m4a?: Side
}

interface Manifest {
  files: Record<string, CueRow>
}

interface Voice {
  name: string
  src: AudioBufferSourceNode
  gain: GainNode
  kind: 'loop' | 'once'
  dead: boolean
}

const MAP_LOOP: Record<string, string> = {
  sundial: 'music_sundial',
  lattice: 'music_lattice',
  cloister: 'music_cloister',
  stair: 'music_stair',
  nadir: 'music_nadir',
}

const STING: Record<string, string> = {
  sundial: 'sfx_boss_sting_a',
  lattice: 'sfx_boss_sting_b',
  cloister: 'sfx_boss_sting_a',
  stair: 'sfx_boss_sting_b',
  nadir: 'sfx_boss_sting_c',
}

const LIGHT_HZ = 18000
const SHADE_HZ = 1500
const SHADE_GAIN = Math.pow(10, -2.5 / 20)

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function fetchTry(url: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) return null
    if (attempt > 0) await wait(150 * attempt)
    if (signal.aborted) return null
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(String(res.status))
      return await res.arrayBuffer()
    } catch {
      if (signal.aborted || attempt === 2) return null
    }
  }
  return null
}

export function attachMusic(
  ctx: AudioContext,
  opts: {
    musicBus: GainNode
    musicLow: BiquadFilterNode
    duck: GainNode
    ext: 'ogg' | 'm4a'
    base: string
    hear: number
    onBytes: (bytes: number) => void
  },
): MusicHandle {
  const shadeLow = ctx.createBiquadFilter()
  shadeLow.type = 'lowpass'
  shadeLow.frequency.value = LIGHT_HZ
  shadeLow.Q.value = 0.707
  const shadeGain = ctx.createGain()
  shadeGain.gain.value = 1
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.05
  const hear = ctx.createGain()
  hear.gain.value = opts.hear
  const sunBus = ctx.createGain()
  sunBus.gain.value = opts.musicBus.gain.value
  try {
    opts.musicLow.disconnect()
  } catch {
    /* not yet connected */
  }
  try {
    opts.duck.disconnect()
  } catch {
    /* not yet connected */
  }
  opts.musicLow.connect(shadeLow)
  shadeLow.connect(shadeGain)
  shadeGain.connect(opts.duck)
  opts.duck.connect(limiter)
  limiter.connect(hear)
  hear.connect(ctx.destination)
  sunBus.connect(opts.duck)

  const ext = opts.ext
  const decoded = new Map<string, AudioBuffer>()
  const cues: MusicState['cues'] = []
  const shifts: MusicState['shifts'] = []
  let voices: Voice[] = []
  let manifest: Manifest | null = null
  let ctrl = new AbortController()
  let gen = 0
  let playRate = 1
  let litNow = true
  let peak = 0
  let bossRaw: ArrayBuffer | null = null
  let bossPrefetch: Promise<void> | null = null
  let primedLog = false
  let fading = false

  function noteBytes() {
    let n = 0
    for (const buf of decoded.values()) n += buf.length * buf.numberOfChannels * 4
    if (n > peak) peak = n
    opts.onBytes(n)
  }

  async function loadManifest(signal: AbortSignal): Promise<Manifest | null> {
    if (manifest) return manifest
    const raw = await fetchTry(`${opts.base}assets/audio/music/music_manifest.json`, signal)
    if (!raw || signal.aborted) return null
    if (manifest) return manifest
    try {
      manifest = JSON.parse(new TextDecoder().decode(raw)) as Manifest
      return manifest
    } catch {
      return null
    }
  }

  function sideOf(row: CueRow): Side | null {
    const side = row[ext]
    return side ?? null
  }

  function remember(name: string, buf: AudioBuffer, side: Side) {
    const scaled = Math.round(buf.length * (48000 / buf.sampleRate))
    const diff = scaled - side.decodedSamples48k
    cues.push({ name, samples: buf.length, rate: buf.sampleRate, channels: buf.numberOfChannels, diff })
    if (Math.abs(diff) > 64) {
      const shift = (diff / 2) / 48000
      shifts.push({ name, diff, shift })
      if (import.meta.env.DEV && !primedLog) {
        primedLog = true
        console.info(`[music] priming ${name} ${diff} samples`)
      }
    } else shifts.push({ name, diff, shift: 0 })
  }

  async function loadCue(name: string, signal: AbortSignal): Promise<AudioBuffer | null> {
    const have = decoded.get(name)
    if (have) return have
    const book = await loadManifest(signal)
    if (!book || signal.aborted) return null
    const row = book.files[name]
    const side = row ? sideOf(row) : null
    if (!side) return null
    const raw = await fetchTry(`${opts.base}assets/audio/music/${name}.${ext}`, signal)
    if (!raw || signal.aborted) return null
    try {
      const buf = await ctx.decodeAudioData(raw.slice(0))
      if (signal.aborted) return null
      decoded.set(name, buf)
      remember(name, buf, side)
      noteBytes()
      return buf
    } catch {
      return null
    }
  }

  function points(buf: AudioBuffer, side: Side, name: string): { start: number; end: number } {
    const scaled = Math.round(buf.length * (48000 / buf.sampleRate))
    const diff = scaled - side.decodedSamples48k
    let start = side.loopStart ?? 0
    let end = side.loopEnd ?? buf.duration
    const found = shifts.find((row) => row.name === name)
    if (found && found.shift !== 0) {
      start += found.shift
      end += found.shift
    } else if (Math.abs(diff) > 64) {
      start += (diff / 2) / 48000
      end += (diff / 2) / 48000
    }
    const dur = buf.duration
    if (start < 0) start = 0
    if (end > dur) end = dur
    if (end <= start + 0.01) end = Math.min(dur, start + 0.05)
    return { start, end }
  }

  function stopVoice(v: Voice) {
    if (v.dead) return
    v.dead = true
    v.src.onended = null
    try {
      v.src.stop()
    } catch {
      /* already stopped */
    }
    try {
      v.src.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      v.gain.disconnect()
    } catch {
      /* already disconnected */
    }
    v.src.buffer = null
    const i = voices.indexOf(v)
    if (i >= 0) voices.splice(i, 1)
  }

  function evict(name: string) {
    if (voices.some((v) => v.name === name && !v.dead)) return
    if (!decoded.delete(name)) return
    noteBytes()
  }

  function ramp(param: AudioParam, target: number, seconds: number) {
    const now = ctx.currentTime
    const dur = Math.max(0.02, seconds)
    param.cancelScheduledValues(now)
    const cur = Math.max(0.0001, param.value)
    param.setValueAtTime(cur, now)
    param.exponentialRampToValueAtTime(Math.max(0.0001, target), now + dur)
  }

  function spawnLoop(name: string, buf: AudioBuffer, side: Side): Voice {
    const pts = points(buf, side, name)
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.connect(opts.musicBus)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = pts.start
    src.loopEnd = pts.end
    src.playbackRate.value = playRate
    src.connect(g)
    const now = ctx.currentTime
    src.start(now, pts.start)
    const voice: Voice = { name, src, gain: g, kind: 'loop', dead: false }
    voices.push(voice)
    return voice
  }

  function sideFor(name: string): Side | null {
    const row = manifest?.files[name]
    return row ? sideOf(row) : null
  }

  function crossfade(name: string, buf: AudioBuffer, seconds: number, token: number) {
    const side = sideFor(name)
    if (!side) return
    const incoming = spawnLoop(name, buf, side)
    const outgoing = voices.filter((v) => v !== incoming && v.kind === 'loop')
    ramp(incoming.gain.gain, 1, seconds)
    for (const v of outgoing) ramp(v.gain.gain, 0.0001, seconds)
    window.setTimeout(() => {
      if (token !== gen) return
      for (const v of outgoing) {
        const dropped = v.name
        stopVoice(v)
        evict(dropped)
      }
    }, Math.ceil(seconds * 1000) + 40)
  }

  function playShot(name: string, bypass: boolean, token: number, signal: AbortSignal) {
    void loadCue(name, signal).then((buf) => {
      if (token !== gen || !buf || signal.aborted) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = 1
      g.connect(bypass ? sunBus : opts.musicBus)
      src.connect(g)
      src.start()
      const voice: Voice = { name, src, gain: g, kind: 'once', dead: false }
      voices.push(voice)
      src.onended = () => {
        stopVoice(voice)
        evict(name)
      }
    })
  }

  function bump() {
    gen += 1
    ctrl.abort()
    ctrl = new AbortController()
    bossPrefetch = null
  }

  function stopAll() {
    bump()
    bossRaw = null
    fading = false
    for (const v of [...voices]) stopVoice(v)
    decoded.clear()
    noteBytes()
  }

  async function prefetchBoss() {
    if (bossRaw || bossPrefetch) return
    const signal = ctrl.signal
    const token = gen
    const book = await loadManifest(signal)
    if (!book || token !== gen) return
    bossPrefetch = fetchTry(`${opts.base}assets/audio/music/music_boss.${ext}`, signal).then((raw) => {
      bossPrefetch = null
      if (!raw || token !== gen || signal.aborted) return
      bossRaw = raw
    })
    await bossPrefetch
  }

  async function decodeBoss(signal: AbortSignal): Promise<AudioBuffer | null> {
    const have = decoded.get('music_boss')
    if (have) return have
    if (!bossRaw) await prefetchBoss()
    if (!bossRaw || signal.aborted) return null
    const book = manifest
    const side = book ? sideFor('music_boss') : null
    if (!side) return null
    try {
      const buf = await ctx.decodeAudioData(bossRaw.slice(0))
      bossRaw = null
      if (signal.aborted) return null
      decoded.set('music_boss', buf)
      remember('music_boss', buf, side)
      noteBytes()
      return buf
    } catch {
      return null
    }
  }

  return {
    stop: stopAll,
    menu() {
      if (voices.some((v) => v.name === 'music_menu' && v.kind === 'loop' && !v.dead)) return
      const token = gen
      const signal = ctrl.signal
      void loadCue('music_menu', signal).then((buf) => {
        if (token !== gen || !buf) return
        const side = sideFor('music_menu')
        if (!side) return
        const voice = spawnLoop('music_menu', buf, side)
        ramp(voice.gain.gain, 1, 0.05)
      })
    },
    enter(map: string) {
      const cue = MAP_LOOP[map]
      if (!cue) return
      const loops = voices.filter((v) => v.kind === 'loop' && !v.dead)
      if (loops.length === 1 && loops[0]?.name === cue) return
      bump()
      const token = gen
      const signal = ctrl.signal
      void loadCue(cue, signal).then((buf) => {
        if (token !== gen || !buf) return
        crossfade(cue, buf, 1, token)
      })
    },
    leave() {
      stopAll()
      const token = gen
      const signal = ctrl.signal
      void loadCue('music_menu', signal).then((buf) => {
        if (token !== gen || !buf) return
        const side = sideFor('music_menu')
        if (!side) return
        const voice = spawnLoop('music_menu', buf, side)
        ramp(voice.gain.gain, 1, 0.2)
      })
    },
    prefetchBoss() {
      void prefetchBoss()
    },
    wakeBoss(map: string) {
      const sting = STING[map]
      const token = gen
      const signal = ctrl.signal
      if (sting) playShot(sting, false, token, signal)
      if (map === 'nadir') return
      void decodeBoss(signal).then((buf) => {
        if (token !== gen || !buf) return
        crossfade('music_boss', buf, 1.5, token)
      })
    },
    setLit(lit: boolean) {
      if (lit === litNow) return
      litNow = lit
      const now = ctx.currentTime
      const hz = lit ? LIGHT_HZ : SHADE_HZ
      const gain = lit ? 1 : SHADE_GAIN
      const seconds = lit ? 0.6 : 0.3
      const freq = shadeLow.frequency
      freq.cancelScheduledValues(now)
      freq.setValueAtTime(Math.max(10, freq.value), now)
      freq.exponentialRampToValueAtTime(hz, now + seconds)
      const param = shadeGain.gain
      param.cancelScheduledValues(now)
      param.setValueAtTime(Math.max(0.0001, param.value), now)
      param.exponentialRampToValueAtTime(gain, now + seconds)
    },
    setMusic(value: number) {
      opts.musicBus.gain.value = value
      sunBus.gain.value = value
    },
    setHear(value: number) {
      hear.gain.value = value
    },
    fadeOut(seconds: number) {
      fading = true
      const token = gen
      const loops = voices.filter((v) => v.kind === 'loop' && !v.dead)
      for (const v of loops) ramp(v.gain.gain, 0.0001, seconds)
      window.setTimeout(() => {
        if (token !== gen) return
        for (const v of loops) {
          const name = v.name
          stopVoice(v)
          evict(name)
        }
        fading = false
      }, Math.ceil(Math.max(0.02, seconds) * 1000) + 40)
    },
    sunrise() {
      if (!fading) {
        const loops = voices.filter((v) => v.kind === 'loop' && !v.dead)
        for (const v of loops) {
          const name = v.name
          stopVoice(v)
          evict(name)
        }
      }
      playShot('sfx_sunrise', true, gen, ctrl.signal)
    },
    rate(value: number) {
      playRate = value
      for (const v of voices) {
        if (v.kind === 'loop' && !v.dead) v.src.playbackRate.value = value
      }
    },
    state() {
      return {
        ext,
        sources: voices.filter((v) => !v.dead).length,
        decoded: [...decoded.values()].reduce((sum, buf) => sum + buf.length * buf.numberOfChannels * 4, 0),
        peak,
        cues: cues.slice(),
        shifts: shifts.slice(),
      }
    },
  }
}
