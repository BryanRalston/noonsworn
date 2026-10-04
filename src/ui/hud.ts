const RING = 2 * Math.PI * 15

export interface Hud {
  root: HTMLElement
  setVisible: (on: boolean) => void
  setTouchMode: (on: boolean) => void
  setHp: (hp: number, max: number) => void
  setXp: (xp: number, next: number, level: number) => void
  setKills: (kills: number) => void
  setCooldown: (ready: number) => void
  setCharges: (n: number) => void
  setMirage: (owned: boolean, ready: number) => void
  pulse: () => void
  onPause: (() => void) | null
  onHalo: (() => void) | null
}

export function createHud(parent: HTMLElement): Hud {
  const root = document.createElement('div')
  root.id = 'hud'
  root.hidden = true
  root.innerHTML = `
    <div id="xp-wrap"><div id="xp-fill"></div></div>
    <span id="level">Lv 1</span>
    <div class="hp-wrap"><div class="hp-bar"><div id="hp-fill"></div><span id="hp-num">100</span></div></div>
    <svg id="hud-ring" viewBox="0 0 36 36" class="ring" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-bg"></circle><circle id="hud-ring-fg" cx="18" cy="18" r="15" class="ring-fg"></circle></svg>
    <span id="mirage-pip" hidden></span>
    <div id="kills">0</div>
    <button type="button" id="btn-pause" aria-label="Pause">II</button>
    <button type="button" id="btn-halo" aria-label="Power-up"><span id="halo-count">0</span></button>`
  parent.append(root)
  const hpFill = root.querySelector('#hp-fill') as HTMLElement
  const hpNum = root.querySelector('#hp-num') as HTMLElement
  const xpFill = root.querySelector('#xp-fill') as HTMLElement
  const level = root.querySelector('#level') as HTMLElement
  const kills = root.querySelector('#kills') as HTMLElement
  const ring = root.querySelector('#hud-ring-fg') as SVGCircleElement
  const ringSvg = root.querySelector('#hud-ring') as SVGElement
  const haloBtn = root.querySelector('#btn-halo') as HTMLButtonElement
  const miragePip = root.querySelector('#mirage-pip') as HTMLElement
  const haloCount = root.querySelector('#halo-count') as HTMLElement
  ring.style.strokeDasharray = `${RING}`
  let touch = false
  let charges = -1
  const hud: Hud = {
    root,
    onPause: null,
    onHalo: null,
    setVisible(on) {
      root.hidden = !on
    },
    setTouchMode(on) {
      touch = on
      ringSvg.style.visibility = on ? 'hidden' : 'visible'
      root.classList.toggle('touch', on)
    },
    setHp(hp, max) {
      const pct = max > 0 ? (Math.max(0, hp) / max) * 100 : 0
      hpFill.style.width = `${pct}%`
      hpFill.classList.toggle('low', pct <= 30)
      hpNum.textContent = `${Math.ceil(Math.max(0, hp))}`
    },
    setXp(xp, next, lv) {
      const pct = next > 0 ? Math.min(100, (xp / next) * 100) : 0
      xpFill.style.width = `${pct}%`
      level.textContent = `Lv ${lv}`
    },
    setKills(n) {
      kills.textContent = `${n}`
    },
    setCooldown(ready) {
      if (touch) return
      const t = ready < 0 ? 0 : ready > 1 ? 1 : ready
      ring.style.strokeDashoffset = `${RING * (1 - t)}`
    },
    setMirage(owned, ready) {
      miragePip.hidden = !owned
      if (!owned) return
      const t = ready < 0 ? 0 : ready > 1 ? 1 : ready
      miragePip.style.opacity = `${0.35 + 0.65 * t}`
    },
    setCharges(n) {
      if (n === charges) return
      charges = n
      haloCount.textContent = `${n}`
      haloBtn.classList.toggle('ready', n > 0)
    },
    pulse() {
      haloBtn.classList.remove('glow')
      void haloBtn.offsetWidth
      haloBtn.classList.add('glow')
    },
  }
  bindTap(root.querySelector('#btn-pause'), () => hud.onPause?.())
  bindTap(haloBtn, () => hud.onHalo?.())
  haloBtn.addEventListener('animationend', () => haloBtn.classList.remove('glow'))
  return hud
}

function bindTap(el: Element | null, fn: () => void) {
  if (!(el instanceof HTMLElement)) return
  let fromTouch = false
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return
    e.preventDefault()
    fromTouch = true
    fn()
    window.setTimeout(() => {
      fromTouch = false
    }, 150)
  })
  el.addEventListener('click', () => {
    if (fromTouch) return
    fn()
  })
}
