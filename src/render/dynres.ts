import { TUNING } from '../data/tuning'

const CAP = 48

export function createDynres(start: number) {
  const times = new Float32Array(CAP)
  const stamps = new Float32Array(CAP)
  const order = new Float32Array(CAP)
  let count = 0
  let head = 0
  let ratio = start
  let overHold = 0
  let enabled = true
  let clock = 0
  let settle = 0
  let lastDown = -10
  let lastUp = -10

  function reset() {
    count = 0
    head = 0
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
        order[n] = times[idx] ?? 0
        sum += order[n] ?? 0
        n++
        oldest = stamp
      }
      const span = clock - oldest
      const ringFull = count >= CAP
      const hot = frameMs > targetMs * 1.4
      if (n < 6 || (!hot && span < 0.35 && !ringFull)) {
        return { changed: false, dropTier: false }
      }
      for (let i = 1; i < n; i++) {
        const v = order[i] ?? 0
        let j = i - 1
        while (j >= 0 && (order[j] ?? 0) > v) {
          order[j + 1] = order[j] ?? 0
          j--
        }
        order[j + 1] = v
      }
      const avg = sum / n
      const p95 = order[Math.min(n - 1, Math.max(0, Math.ceil(n * 0.95) - 1))] ?? avg
      const step = TUNING.quality.dynStep
      if (avg > targetMs * TUNING.quality.dynDown) {
        if (clock - lastDown >= 2) {
          const next = Math.round(Math.max(min, ratio - step) * 100) / 100
          if (next !== ratio) {
            ratio = next
            lastDown = clock
            overHold = 0
            settle = 0.2
            count = 0
            return { changed: true, dropTier: false }
          }
        }
        overHold += frameSec
        if (overHold >= TUNING.quality.tierDropHold && ratio <= min + 0.001) {
          overHold = 0
          return { changed: false, dropTier: true }
        }
      } else {
        overHold = 0
        // 0.1 covers a full 1.0 drop inside 8 s at one step per 0.5 s. 0.05 cannot.
        if (p95 <= targetMs && clock - lastUp >= 0.5) {
          const next = Math.round(Math.min(max, ratio + 0.1) * 100) / 100
          if (next !== ratio) {
            ratio = next
            lastUp = clock
            settle = 0.2
            count = 0
            return { changed: true, dropTier: false }
          }
        }
      }
      return { changed: false, dropTier: false }
    },
  }
}

export type Dynres = ReturnType<typeof createDynres>
