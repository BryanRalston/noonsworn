import { TUNING } from '../data/tuning'

const STEP = 1 / TUNING.simHz

export interface LoopHost {
  beginFrame: (frameSec: number) => boolean
  step: (dt: number, first: boolean) => boolean
  render: (alpha: number, frameSec: number, frameMs: number) => void
}

export function startLoop(host: LoopHost) {
  let last = performance.now()
  let acc = 0
  const tick = (now: number) => {
    requestAnimationFrame(tick)
    let frameSec = (now - last) / 1000
    last = now
    if (frameSec < 0) frameSec = 0
    if (frameSec > 0.1) frameSec = 0.1
    const frameMs = frameSec * 1000
    if (!host.beginFrame(frameSec)) {
      acc = 0
      host.render(1, frameSec, frameMs)
      return
    }
    acc += frameSec
    let steps = 0
    let first = true
    while (acc >= STEP && steps < TUNING.maxSteps) {
      const keep = host.step(STEP, first)
      first = false
      acc -= STEP
      steps++
      if (!keep) {
        acc = 0
        break
      }
    }
    if (steps === TUNING.maxSteps) acc = 0
    const alpha = acc / STEP
    host.render(alpha > 1 ? 1 : alpha, frameSec, frameMs)
  }
  requestAnimationFrame(tick)
}
