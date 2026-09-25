export interface Sundial {
  root: HTMLElement
  set: (angle: number, seconds: number) => void
}

export function createSundial(parent: HTMLElement): Sundial {
  const root = document.createElement('div')
  root.id = 'sundial'
  root.innerHTML = `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="28" class="dial"></circle>
      <circle id="sun-dot" cx="36" cy="8" r="4"></circle>
    </svg>
    <span id="clock">00:00</span>`
  parent.append(root)
  const dot = root.querySelector('#sun-dot') as SVGCircleElement
  const clock = root.querySelector('#clock') as HTMLElement
  return {
    root,
    set(angle, seconds) {
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      dot.setAttribute('cx', `${36 + c * 28}`)
      dot.setAttribute('cy', `${36 + s * 28}`)
      const clamped = Math.max(0, Math.floor(seconds))
      const m = Math.floor(clamped / 60)
      const sec = clamped % 60
      clock.textContent = `${m}:${sec < 10 ? '0' : ''}${sec}`
    },
  }
}
