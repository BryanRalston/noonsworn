import { TUNING } from '../data/tuning'

const CAP = 48

export function createDynres(start: number) {
  const times = new Float32Array(CAP)
  const stamps = new Float32Array(CAP)
  let count = 0
  let head = 0
  let ratio = start
  let upHold = 0
  let overHold = 0
  let enabled = true
  let clock = 0
  let settle = 0

  function reset() {
    count = 0
    head = 0
    upHold = 0
    overHold = 0
    clock = 0
  }

  return {
    get ratio() {
      return ratio
    },
    get enabled() {
      return enabled
    },
    set enabled(v: boolean) {
      enabled = v
      reset()
    },
    setRatio(next: number) {
      ratio = next
      reset()
    },
    sample(frameMs: number, frameSec: number, targetMs: number, min: number, max: number) {
      if (!enabled || frameMs <= 0 || frameMs > TUNING.quality.ignoreFrameMs) {
        return { changed: false, dropTier: false }
      }
      if (settle > 0) {
        settle -= frameSec
        count = 0
        return { changed: false, dropTier: false }
      }
      clock += frameSec
      times[head] = frameMs
      stamps[head] = clock
      head = (head + 1) % CAP
      if (count < CAP) count++
      let sum = 0
      let n = 0
      let oldest = clock
      for (let i = 0; i < count; i++) {
        const idx = (head - 1 - i + CAP) % CAP
        const stamp = stamps[idx] ?? 0
        if (clock - stamp > TUNING.quality.dynWindow) break
        sum += times[idx] ?? 0
        n++
        oldest = stamp
      }
      if (n < 8 || clock - oldest < TUNING.quality.dynWindow * 0.85) {
        return { changed: false, dropTier: false }
      }
      const avg = sum / n
      const step = TUNING.quality.dynStep
      if (avg > targetMs * TUNING.quality.dynDown) {
        upHold = 0
        const next = Math.round(Math.max(min, ratio - step) * 100) / 100
        if (next !== ratio) {
          ratio = next
          overHold = 0
          settle = TUNING.quality.dynSettle
          count = 0
          return { changed: true, dropTier: false }
        }
        overHold += frameSec
        if (overHold >= TUNING.quality.tierDropHold) {
          overHold = 0
          return { changed: false, dropTier: true }
        }
      } else if (avg < targetMs * TUNING.quality.dynUp) {
        overHold = 0
        upHold += frameSec
        if (upHold >= TUNING.quality.dynUpHold) {
          upHold = 0
          const next = Math.round(Math.min(max, ratio + step) * 100) / 100
          if (next !== ratio) {
            ratio = next
            settle = TUNING.quality.dynSettle
            count = 0
            return { changed: true, dropTier: false }
          }
        }
      } else {
        upHold = 0
        overHold = 0
      }
      return { changed: false, dropTier: false }
    },
  }
}

export type Dynres = ReturnType<typeof createDynres>
