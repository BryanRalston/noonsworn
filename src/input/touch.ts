import { TUNING } from '../data/tuning'
import type { TouchView } from '../ui/touchControls'

interface Ptr {
  id: number
  x: number
  y: number
  sx: number
  sy: number
  role: 'stick' | 'cut' | 'flick' | 'none'
  t: number
}

const stickOut = { x: 0, y: 0 }

export interface Basis {
  fx: number
  fz: number
  rx: number
  rz: number
}

export function createTouch(view: TouchView, basis: () => Basis) {
  const ptrs = new Map<number, Ptr>()
  let cut = false
  let debug = false
  let stickX = 0
  let stickY = 0
  let stickId = -1
  let hasFlick = false
  let flickX = 0
  let flickZ = 0
  const api = {
    cut: false,
    debug: false,
    flickX: null as number | null,
    flickZ: null as number | null,
    activity: false,
    stick() {
      stickOut.x = stickX
      stickOut.y = stickY
      return stickOut
    },
    consume() {
      api.cut = cut
      api.debug = debug
      api.flickX = hasFlick ? flickX : null
      api.flickZ = hasFlick ? flickZ : null
      cut = false
      debug = false
      hasFlick = false
    },
    clearCut() {
      cut = false
      hasFlick = false
      api.cut = false
      api.flickX = null
      api.flickZ = null
    },
  }

  function applyStick(p: Ptr) {
    const rad = TUNING.touch.stick
    const dx = p.x - p.sx
    const dy = p.y - p.sy
    const mag = Math.hypot(dx, dy) / rad
    const dead = TUNING.touch.deadzone
    if (mag < dead) {
      stickX = 0
      stickY = 0
    } else {
      const clamped = Math.min(1, mag)
      const remapped = (clamped - dead) / (1 - dead)
      stickX = (dx / (mag * rad)) * remapped
      stickY = -(dy / (mag * rad)) * remapped
    }
    const show = Math.min(rad, Math.hypot(dx, dy))
    const ang = Math.atan2(dy, dx)
    view.setStick(p.sx, p.sy, Math.cos(ang) * show, Math.sin(ang) * show, true)
  }

  function clearStick() {
    stickX = 0
    stickY = 0
    stickId = -1
    view.setStick(0, 0, 0, 0, false)
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    const target = e.target
    if (target instanceof Element && target.closest('#ui button, #feature-map, #debug, #level-up')) return
    api.activity = true
    view.show()
    view.layout()
    const right = e.clientX >= window.innerWidth * TUNING.touch.left
    let role: Ptr['role'] = 'none'
    if (view.hit(e.clientX, e.clientY)) role = 'cut'
    else if (!right && stickId < 0) {
      role = 'stick'
      stickId = e.pointerId
    } else if (right) role = 'flick'
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, role, t: performance.now() }
    ptrs.set(e.pointerId, p)
    if (role === 'stick') applyStick(p)
    if (ptrs.size >= 3) {
      let oldest = performance.now()
      ptrs.forEach((item) => {
        if (item.t < oldest) oldest = item.t
      })
      if (performance.now() - oldest < 420) {
        debug = true
        clearStick()
      }
    }
    e.preventDefault()
  })
  window.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    if (p.role === 'stick') applyStick(p)
  })
  const up = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId)
    if (!p) return
    ptrs.delete(e.pointerId)
    if (p.role === 'stick') clearStick()
    const dt = performance.now() - p.t
    const dist = Math.hypot(p.x - p.sx, p.y - p.sy)
    const right = p.sx >= window.innerWidth * TUNING.touch.left
    if (right && dist >= TUNING.touch.flickPx && dt < TUNING.touch.flickMs) {
      const b = basis()
      const mag = dist || 1
      const rx = (p.x - p.sx) / mag
      const ry = -((p.y - p.sy) / mag)
      flickX = b.rx * rx + b.fx * ry
      flickZ = b.rz * rx + b.fz * ry
      hasFlick = true
      cut = true
    } else if (p.role === 'cut') cut = true
  }
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  window.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault()
  }, { passive: false })
  return api
}
