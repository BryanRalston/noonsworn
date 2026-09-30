import type { Camera } from 'three'
import type { TouchView } from '../ui/touchControls'
import { createGamepad } from './gamepad'
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
  claimPressed: boolean
  confirmPressed: boolean
  cancelPressed: boolean
  navX: number
  navY: number
  anyPressed: boolean
  keyPressed: boolean
  shiftPressed: boolean
  altPressed: boolean
  miragePressed: boolean
}

export function createInput(canvas: HTMLCanvasElement, touch: TouchView, basis: () => Basis) {
  const keys = createKeyboard()
  const mouse = createMouse(canvas)
  const pad = createTouch(touch, basis)
  const gamepad = createGamepad()
  let device: 'keyboard' | 'mouse' | 'touch' | 'pad' = 'keyboard'
  return {
    device: () => device,
    setNavLock(on: boolean) {
      keys.navLock = on
    },
    clearCut() {
      keys.clearCut()
      mouse.clearCut()
      pad.clearCut()
    },
    readInto(out: InputState, camera: Camera) {
      const gp = gamepad.poll()
      const keyActive = keys.activity
      const mouseActive = mouse.activity
      const touchActive = pad.activity
      if (keyActive) device = 'keyboard'
      if (mouseActive) device = 'mouse'
      if (touchActive) device = 'touch'
      if (gp.activity) device = 'pad'
      keys.activity = false
      mouse.activity = false
      pad.activity = false
      keys.consume()
      mouse.consume()
      pad.consume()
      const key = keys.axes()
      const stick = pad.stick()
      let mx = key.x + stick.x + gp.stickX
      let my = key.y + stick.y + gp.stickY
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
      out.cutPressed = keys.cut || mouse.cut || pad.cut || gp.a
      out.cutDirX = pad.flickX
      out.cutDirZ = pad.flickZ
      out.pausePressed = keys.pause
      out.restartPressed = keys.restart
      out.debugToggle = keys.debug || pad.debug
      out.featureToggle = keys.feature
      out.pick = keys.pick
      out.mouseIdle = mouse.idle()
      out.usingTouch = device === 'touch'
      out.claimPressed = keys.claim || gp.lb
      out.confirmPressed = keys.confirm || gp.a
      out.cancelPressed = gp.b
      out.navX = keys.navX !== 0 ? keys.navX : gp.navX
      out.navY = keys.navY !== 0 ? keys.navY : gp.navY
      out.anyPressed = keyActive || mouseActive || touchActive || gp.any || gp.a || gp.b || gp.lb || gp.navX !== 0 || gp.navY !== 0
      out.keyPressed = keyActive
      out.shiftPressed = keys.shift
      out.altPressed = mouse.alt
      out.miragePressed = pad.mirage
    },
  }
}

export type InputApi = ReturnType<typeof createInput>
