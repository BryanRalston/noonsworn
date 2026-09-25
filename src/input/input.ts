import type { Camera } from 'three'
import type { TouchView } from '../ui/touchControls'
import { createKeyboard } from './keyboard'
import { createMouse } from './mouse'
import { createTouch, type Basis } from './touch'

export interface InputState {
  moveX: number
  moveY: number
  aimX: number | null
  aimZ: number | null
  cutPressed: boolean
  cutDirX: number | null
  cutDirZ: number | null
  pausePressed: boolean
  restartPressed: boolean
  debugToggle: boolean
  featureToggle: boolean
  pick: number
  mouseIdle: boolean
  usingTouch: boolean
}

export function createInput(canvas: HTMLCanvasElement, touch: TouchView, basis: () => Basis) {
  const keys = createKeyboard()
  const mouse = createMouse(canvas)
  const pad = createTouch(touch, basis)
  let device: 'keyboard' | 'mouse' | 'touch' = 'keyboard'
  return {
    device: () => device,
    clearCut() {
      keys.clearCut()
      mouse.clearCut()
      pad.clearCut()
    },
    readInto(out: InputState, camera: Camera) {
      if (keys.activity) device = 'keyboard'
      if (mouse.activity) device = 'mouse'
      if (pad.activity) device = 'touch'
      keys.activity = false
      mouse.activity = false
      pad.activity = false
      keys.consume()
      mouse.consume()
      pad.consume()
      const key = keys.axes()
      const stick = pad.stick()
      let mx = key.x + stick.x
      let my = key.y + stick.y
      const mag = Math.hypot(mx, my)
      if (mag > 1) {
        mx /= mag
        my /= mag
      }
      const aim = mouse.aim(camera)
      out.moveX = mx
      out.moveY = my
      out.aimX = aim ? aim.x : null
      out.aimZ = aim ? aim.z : null
      out.cutPressed = keys.cut || mouse.cut || pad.cut
      out.cutDirX = pad.flickX
      out.cutDirZ = pad.flickZ
      out.pausePressed = keys.pause
      out.restartPressed = keys.restart
      out.debugToggle = keys.debug || pad.debug
      out.featureToggle = keys.feature
      out.pick = keys.pick
      out.mouseIdle = mouse.idle()
      out.usingTouch = device === 'touch'
    },
  }
}

export type InputApi = ReturnType<typeof createInput>
