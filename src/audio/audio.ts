/** Procedural WebAudio. No files. Cosmetic pitch uses fxRng. */
export interface AudioBus {
  unlock: () => void
  setMuted: (muted: boolean) => void
  setVolumes: (master: number, sfx: number) => void
  spear: () => void
  hit: () => void
  exposed: () => void
  armored: () => void
  kill: () => void
  cut: () => void
  xp: (step: number) => void
  level: () => void
  hurt: () => void
  shimmer: () => void
  ui: () => void
  death: () => void
  win: () => void
}

export function createAudio(fxRng: () => number): AudioBus {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfx: GainNode | null = null
  let unlocked = false
  let muted = false
  let voices = 0
  let exposedAt = 0
  let shimmerAt = 0

  function ensure(): AudioContext {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      sfx = ctx.createGain()
      sfx.connect(master)
      master.connect(ctx.destination)
      master.gain.value = muted ? 0 : 0.8
      sfx.gain.value = 0.9
    }
    return ctx
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!unlocked || muted || voices >= 16) return
    const c = ensure()
    if (!sfx) return
    voices++
    const t = c.currentTime
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq * (1 + (fxRng() * 2 - 1) * 0.06)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(sfx)
    o.start(t)
    o.stop(t + dur + 0.02)
    o.onended = () => {
      voices = Math.max(0, voices - 1)
    }
  }

  function noise(dur: number, gain: number) {
    if (!unlocked || muted || voices >= 16) return
    const c = ensure()
    if (!sfx) return
    voices++
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = fxRng() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const g = c.createGain()
    const t = c.currentTime
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(g)
    g.connect(sfx)
    src.start(t)
    src.onended = () => {
      voices = Math.max(0, voices - 1)
    }
  }

  return {
    unlock() {
      unlocked = true
      const c = ensure()
      if (c.state === 'suspended') void c.resume()
    },
    setMuted(next) {
      muted = next
      if (master) master.gain.value = next ? 0 : 0.8
    },
    setVolumes(m, s) {
      if (master && !muted) master.gain.value = m
      if (sfx) sfx.gain.value = s
    },
    spear() {
      tone(640, 0.07, 'square', 0.05)
    },
    hit() {
      tone(220, 0.05, 'triangle', 0.06)
    },
    exposed() {
      const now = performance.now()
      if (now - exposedAt < 125) return
      exposedAt = now
      tone(880, 0.09, 'sine', 0.07)
    },
    armored() {
      tone(90, 0.06, 'sine', 0.08)
    },
    kill() {
      tone(520, 0.08, 'triangle', 0.06)
    },
    cut() {
      noise(0.12, 0.05)
      tone(140, 0.1, 'sine', 0.08)
    },
    xp(step) {
      tone(480 + step * 40, 0.05, 'sine', 0.04)
    },
    level() {
      tone(523, 0.12, 'triangle', 0.07)
      tone(659, 0.16, 'triangle', 0.06)
      tone(784, 0.2, 'sine', 0.05)
    },
    hurt() {
      tone(160, 0.12, 'sawtooth', 0.05)
    },
    shimmer() {
      const now = performance.now()
      if (now - shimmerAt < 250) return
      shimmerAt = now
      tone(1200, 0.14, 'sine', 0.03)
    },
    ui() {
      tone(700, 0.04, 'square', 0.03)
    },
    death() {
      tone(196, 0.4, 'sine', 0.08)
      tone(98, 0.5, 'triangle', 0.06)
    },
    win() {
      tone(523, 0.2, 'sine', 0.06)
      tone(784, 0.28, 'sine', 0.05)
    },
  }
}
