import { TUNING } from '../data/tuning'

interface Rect {
  l: number
  t: number
  r: number
  b: number
}

const RING = 2 * Math.PI * 15

export interface TouchView {
  root: HTMLElement
  show: () => void
  hide: () => void
  readonly visible: boolean
  setStick: (sx: number, sy: number, kx: number, ky: number, on: boolean) => void
  setCooldown: (ready: number) => void
  hit: (x: number, y: number) => boolean
  layout: () => void
}

export function createTouchControls(parent: HTMLElement): TouchView {
  const root = document.createElement('div')
  root.id = 'touch-root'
  root.className = 'touch-off'
  root.innerHTML = `
    <div id="stick" hidden><div class="stick-base"></div><div class="stick-knob"></div></div>
    <button type="button" id="btn-cut" tabindex="-1">
      <svg viewBox="0 0 36 36" class="ring" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-bg"></circle><circle id="touch-ring" cx="18" cy="18" r="15" class="ring-fg"></circle></svg>
      <span>Cut</span>
    </button>`
  parent.append(root)
  const stick = root.querySelector('#stick') as HTMLElement
  const knob = root.querySelector('.stick-knob') as HTMLElement
  const button = root.querySelector('#btn-cut') as HTMLElement
  const ring = root.querySelector('#touch-ring') as SVGCircleElement
  ring.style.strokeDasharray = `${RING}`
  button.style.width = `${TUNING.touch.cut}px`
  button.style.height = `${TUNING.touch.cut}px`
  const rect: Rect = { l: 0, t: 0, r: 0, b: 0 }
  let visible = false
  const view: TouchView = {
    root,
    get visible() {
      return visible
    },
    show() {
      visible = true
      root.classList.remove('touch-off')
      view.layout()
    },
    hide() {
      visible = false
      root.classList.add('touch-off')
      stick.hidden = true
    },
    setStick(sx, sy, kx, ky, on) {
      if (!on) {
        stick.hidden = true
        return
      }
      stick.hidden = false
      stick.style.left = `${sx}px`
      stick.style.top = `${sy}px`
      knob.style.transform = `translate(${kx}px, ${ky}px)`
    },
    setCooldown(ready) {
      const t = ready < 0 ? 0 : ready > 1 ? 1 : ready
      ring.style.strokeDashoffset = `${RING * (1 - t)}`
    },
    hit(x, y) {
      return x >= rect.l && x <= rect.r && y >= rect.t && y <= rect.b
    },
    layout() {
      const r = button.getBoundingClientRect()
      rect.l = r.left
      rect.t = r.top
      rect.r = r.right
      rect.b = r.bottom
    },
  }
  window.addEventListener('resize', () => view.layout())
  return view
}
