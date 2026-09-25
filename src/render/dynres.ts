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
  let lastDrop = -10
  let arm = 0
  let climbing = false

  function reset() {
    count = 0
    head = 0
    overHold = 0
    arm = 0
    climbing = false
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
      if (frameMs > targetMs * TUNING.quality.dropGap) lastDrop = clock
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
      if (n < 8 || (span < TUNING.quality.dynWindow * 0.85 && !ringFull)) {
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
      const p90 = order[Math.min(n - 1, Math.max(0, Math.ceil(n * 0.9) - 1))] ?? avg
      const step = TUNING.quality.dynStep
      if (avg > targetMs * TUNING.quality.dynDown) {
        arm = 0
        climbing = false
        lastDrop = clock
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
      } else {
        overHold = 0
        const clean = clock - lastDrop >= 3 && p90 <= targetMs * 1.05
        if (clean) {
          arm += frameSec
          // The 3s clean window is already required. Climb in short steps so a
          // multi-step drop can return to the tier max inside the 8s proof.
          const need = climbing ? TUNING.quality.dynClimb : 0.35
          if (arm >= need) {
            arm = 0
            const next = Math.round(Math.min(max, ratio + step) * 100) / 100
            if (next !== ratio) {
              ratio = next
              climbing = true
              settle = TUNING.quality.dynUpSettle
              count = 0
              return { changed: true, dropTier: false }
            }
            climbing = false
          }
        } else if (p90 > targetMs * 1.05) {
          arm = 0
          climbing = false
        }
      }
      return { changed: false, dropTier: false }
    },
  }
}

export type Dynres = ReturnType<typeof createDynres>
