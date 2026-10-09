import { TUNING } from '../data/tuning'

const STEP = 1 / TUNING.simHz

export interface LoopHost {
  /** `false` skips the sim. A number is the time scale applied to this frame. */
  beginFrame: (frameSec: number) => false | number
  step: (dt: number, first: boolean) => boolean
  render: (alpha: number, frameSec: number, frameMs: number) => void
  /** After this frame, skip scheduling. The canvas keeps whatever render just drew. */
  hold?: () => boolean
  /** This frame's sim advance will park the loop. Do not queue the next frame first. */
  willHold?: (advance: number) => boolean
  /** Sim steps kept this frame. Omitted uses TUNING.maxSteps. */
  stepBudget?: () => number
  /** When the budget is spent, keep the leftover time instead of dropping it. */
  keepTime?: () => boolean
}

export function startLoop(host: LoopHost): { wake: () => void } {
  let last = performance.now()
  let acc = 0
  let queued = false
  let poke = false
  const tick = (now: number) => {
    queued = false
    const redraw = poke
    poke = false
    // A callback queued before the card was up. Drop it: a short task is what the phone timer stretches.
    if (host.hold?.() === true && !redraw) return
    let frameSec = (now - last) / 1000
    last = now
    if (frameSec < 0) frameSec = 0
    if (frameSec > 0.1) frameSec = 0.1
    const frameMs = frameSec * 1000
    const capOf = () => host.stepBudget?.() ?? TUNING.maxSteps
    let pending = acc + frameSec
    let advance = 0
    let budget = 0
    const previewCap = capOf()
    while (pending >= STEP && budget < previewCap) {
      pending -= STEP
      advance += STEP
      budget++
    }
    const crossing = host.willHold?.(advance) === true
    // Queue before the work. Queuing afterward lets the phone timer open a long gap between full frames.
    if (host.hold?.() !== true && !crossing) wake()
    const scale = host.beginFrame(frameSec)
    if (scale === false) {
      acc = 0
      host.render(1, frameSec, frameMs)
    } else {
      acc += frameSec * scale
      let steps = 0
      let first = true
      const cap = capOf()
      while (acc >= STEP && steps < cap) {
        const keep = host.step(STEP, first)
        first = false
        acc -= STEP
        steps++
        if (!keep) {
          acc = 0
          break
        }
      }
      if (steps === cap && host.keepTime?.() !== true) acc = 0
      const alpha = acc / STEP
      host.render(alpha > 1 ? 1 : alpha, frameSec, frameMs)
    }
    if (!queued && host.hold?.() !== true) wake()
  }
  const wake = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(tick)
  }
  const requestRedraw = () => {
    poke = true
    wake()
  }
  wake()
  return { wake: requestRedraw }
}
