export interface Sundial {
  root: HTMLElement
  set: (
    angle: number,
    seconds: number,
    gate?: boolean,
    terraces?: number,
    water?: { dir: number } | null,
    stair?: { elev: number; countdown: number } | null,
  ) => void
}

function thetaAt(c: number, dir: number): number {
  return Math.PI / 2 + dir * Math.PI * 2 * ((c - 17) / 60)
}

function dialArc(a0: number, a1: number): string {
  const r = 30
  const x0 = 36 + Math.cos(a0) * r
  const y0 = 36 + Math.sin(a0) * r
  const x1 = 36 + Math.cos(a1) * r
  const y1 = 36 + Math.sin(a1) * r
  let sweep = a1 - a0
  while (sweep <= -Math.PI) sweep += Math.PI * 2
  while (sweep > Math.PI) sweep -= Math.PI * 2
  const large = Math.abs(sweep) > Math.PI ? 1 : 0
  const flag = sweep > 0 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${flag} ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export function createSundial(parent: HTMLElement): Sundial {
  const root = document.createElement('div')
  root.id = 'sundial'
  root.hidden = true
  root.innerHTML = `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="28" class="dial"></circle>
      <circle id="gate-tick" cx="36" cy="12" r="2.4"></circle>
      <path id="water-deep" hidden></path>
      <path id="water-brim" hidden></path>
      <circle id="sun-dot" cx="36" cy="8" r="4"></circle>
      <path id="stair-arc" hidden></path>
      <circle id="stair-elev" r="2.2" cx="36" cy="12" hidden></circle>
      <g id="terrace-ticks" visibility="hidden">
        <circle class="terrace" data-bit="1" cx="22" cy="58" r="2.1"></circle>
        <circle class="terrace" data-bit="2" cx="36" cy="58" r="2.1"></circle>
        <circle class="terrace" data-bit="4" cx="50" cy="58" r="2.1"></circle>
      </g>
    </svg>
    <span id="clock">00:00</span>`
  parent.append(root)
  const dot = root.querySelector('#sun-dot') as SVGCircleElement
  const clock = root.querySelector('#clock') as HTMLElement
  const ticks = root.querySelector('#terrace-ticks') as SVGGElement
  const marks = [...root.querySelectorAll<SVGCircleElement>('#terrace-ticks circle')]
  const brimArc = root.querySelector('#water-brim') as SVGPathElement
  const deepArc = root.querySelector('#water-deep') as SVGPathElement
  const stairArc = root.querySelector('#stair-arc') as SVGPathElement
  const stairElev = root.querySelector('#stair-elev') as SVGCircleElement
  let gateOn = false
  let waterOn = false
  let waterDir = 99
  let dotCx = ''
  let dotCy = ''
  let shownSec = -1
  let stairOn = false
  let stairStep = -1
  let elevShown = 999
  let terraceMask = -2
  return {
    root,
    set(angle, seconds, gate = false, terraces?: number, water?: { dir: number } | null, stair?: { elev: number; countdown: number } | null) {
      if (gateOn !== gate) {
        gateOn = gate
        root.classList.toggle('gate', gate)
      }
      const showWater = !!water
      if (waterOn !== showWater) {
        waterOn = showWater
        brimArc.toggleAttribute('hidden', !showWater)
        deepArc.toggleAttribute('hidden', !showWater)
      }
      if (water) {
        const dir = water.dir < 0 ? -1 : 1
        if (waterDir !== dir) {
          waterDir = dir
          brimArc.setAttribute('d', dialArc(thetaAt(8, dir), thetaAt(26, dir)))
          deepArc.setAttribute('d', dialArc(thetaAt(34, dir), thetaAt(60, dir)))
        }
      }
      const cx = String(Math.round(36 + Math.cos(angle) * 28))
      const cy = String(Math.round(36 + Math.sin(angle) * 28))
      if (cx !== dotCx) {
        dotCx = cx
        dot.setAttribute('cx', cx)
      }
      if (cy !== dotCy) {
        dotCy = cy
        dot.setAttribute('cy', cy)
      }
      const clamped = Math.max(0, Math.floor(seconds))
      if (clamped !== shownSec) {
        shownSec = clamped
        const m = Math.floor(clamped / 60)
        const sec = clamped % 60
        clock.textContent = `${m}:${sec < 10 ? '0' : ''}${sec}`
      }
      const showStair = !!stair
      if (stairOn !== showStair) {
        stairOn = showStair
        stairArc.toggleAttribute('hidden', !showStair)
        stairElev.toggleAttribute('hidden', !showStair)
      }
      if (stair) {
        const step = Math.round(Math.max(0, Math.min(60, stair.countdown)) * 4)
        if (step !== stairStep) {
          stairStep = step
          const sweep = Math.min(1.98 * Math.PI, (step / 240) * Math.PI * 2)
          const a0 = -Math.PI / 2
          if (sweep < 0.05) stairArc.setAttribute('d', '')
          else {
            const r = 30
            const a1 = a0 + sweep
            const x0 = 36 + Math.cos(a0) * r
            const y0 = 36 + Math.sin(a0) * r
            const x1 = 36 + Math.cos(a1) * r
            const y1 = 36 + Math.sin(a1) * r
            const large = sweep > Math.PI ? 1 : 0
            stairArc.setAttribute('d', `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`)
          }
        }
        const elev = Math.round(stair.elev)
        if (elev !== elevShown) {
          elevShown = elev
          const elevAng = -Math.PI / 2 + ((38 - elev) / 34.5) * Math.PI * 0.85
          stairElev.setAttribute('cx', String(Math.round(36 + Math.cos(elevAng) * 28)))
          stairElev.setAttribute('cy', String(Math.round(36 + Math.sin(elevAng) * 28)))
        }
      }
      const mask = terraces == null ? -1 : terraces
      if (mask !== terraceMask) {
        terraceMask = mask
        if (terraces == null) ticks.setAttribute('visibility', 'hidden')
        else {
          ticks.setAttribute('visibility', 'visible')
          for (let i = 0; i < marks.length; i++) {
            const mark = marks[i]
            if (!mark) continue
            const bit = Number(mark.getAttribute('data-bit'))
            mark.classList.toggle('on', (terraces & bit) !== 0)
          }
        }
      }
    },
  }
}
