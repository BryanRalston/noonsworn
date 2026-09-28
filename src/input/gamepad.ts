const DEAD = 0.2

export interface GamepadFrame {
  activity: boolean
  stickX: number
  stickY: number
  lb: boolean
  a: boolean
  b: boolean
  navX: number
  navY: number
  any: boolean
}

export function createGamepad() {
  const prev = new Array<boolean>(16).fill(false)
  const frame: GamepadFrame = {
    activity: false, stickX: 0, stickY: 0, lb: false, a: false, b: false, navX: 0, navY: 0, any: false,
  }
  return {
    frame,
    poll() {
      frame.activity = false
      frame.stickX = 0
      frame.stickY = 0
      frame.lb = false
      frame.a = false
      frame.b = false
      frame.navX = 0
      frame.navY = 0
      frame.any = false
      const pads = navigator.getGamepads?.()
      if (!pads) return frame
      let pad: Gamepad | null = null
      for (let i = 0; i < pads.length; i++) {
        const item = pads[i]
        if (item && item.connected) pad = item
      }
      if (!pad) {
        prev.fill(false)
        return frame
      }
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      frame.stickX = Math.abs(ax) < DEAD ? 0 : ax
      frame.stickY = Math.abs(ay) < DEAD ? 0 : -ay
      const edge = (index: number) => {
        const down = !!pad.buttons[index]?.pressed
        const hit = down && !prev[index]
        prev[index] = down
        return hit
      }
      for (let i = 0; i < prev.length; i++) {
        if (i === 12 || i === 13 || i === 14 || i === 15 || i === 0 || i === 1 || i === 4) continue
        const down = !!pad.buttons[i]?.pressed
        if (down && !prev[i]) frame.any = true
        prev[i] = down
      }
      frame.a = edge(0)
      frame.b = edge(1)
      frame.lb = edge(4)
      if (edge(14)) frame.navX = -1
      if (edge(15)) frame.navX = 1
      if (edge(12)) frame.navY = 1
      if (edge(13)) frame.navY = -1
      if (frame.a || frame.b || frame.lb || frame.navX || frame.navY || frame.stickX || frame.stickY) frame.activity = true
      if (frame.any) frame.activity = true
      return frame
    },
  }
}
