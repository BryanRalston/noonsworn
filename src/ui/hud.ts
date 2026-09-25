const RING = 2 * Math.PI * 15

export interface Hud {
  root: HTMLElement
  setVisible: (on: boolean) => void
  setTouchMode: (on: boolean) => void
  setHp: (hp: number, max: number) => void
  setXp: (xp: number, next: number, level: number) => void
  setKills: (kills: number) => void
  setCooldown: (ready: number) => void
  onPause: (() => void) | null
}

export function createHud(parent: HTMLElement): Hud {
  const root = document.createElement('div')
  root.id = 'hud'
  root.hidden = true
  root.innerHTML = `
    <div id="xp-wrap"><div id="xp-fill"></div><span id="level">Lv 1</span></div>
    <div class="hp-wrap"><div class="hp-bar"><div id="hp-fill"></div><span id="hp-num">100</span></div></div>
    <svg id="hud-ring" viewBox="0 0 36 36" class="ring" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-bg"></circle><circle id="hud-ring-fg" cx="18" cy="18" r="15" class="ring-fg"></circle></svg>
    <div id="kills">0</div>
    <button type="button" id="btn-pause" aria-label="Pause">II</button>`
  parent.append(root)
  const hpFill = root.querySelector('#hp-fill') as HTMLElement
  const hpNum = root.querySelector('#hp-num') as HTMLElement
  const xpFill = root.querySelector('#xp-fill') as HTMLElement
  const level = root.querySelector('#level') as HTMLElement
  const kills = root.querySelector('#kills') as HTMLElement
  const ring = root.querySelector('#hud-ring-fg') as SVGCircleElement
  const ringSvg = root.querySelector('#hud-ring') as SVGElement
  ring.style.strokeDasharray = `${RING}`
  let touch = false
  const hud: Hud = {
    root,
    onPause: null,
    setVisible(on) {
      root.hidden = !on
    },
    setTouchMode(on) {
      touch = on
      ringSvg.style.visibility = on ? 'hidden' : 'visible'
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
  }
  root.querySelector('#btn-pause')?.addEventListener('click', () => hud.onPause?.())
  return hud
}
