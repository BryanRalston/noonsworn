const down = new Set<string>()
const axesOut = { x: 0, y: 0 }

export function createKeyboard() {
  let cut = false
  let pause = false
  let restart = false
  let debug = false
  let feature = false
  let pick = -1
  const api = {
    cut: false,
    pause: false,
    restart: false,
    debug: false,
    feature: false,
    pick: -1,
    activity: false,
    axes() {
      let x = 0
      let y = 0
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1
      if (down.has('KeyW') || down.has('ArrowUp')) y += 1
      if (down.has('KeyS') || down.has('ArrowDown')) y -= 1
      const m = Math.hypot(x, y)
      if (m > 1) {
        x /= m
        y /= m
      }
      axesOut.x = x
      axesOut.y = y
      return axesOut
    },
    consume() {
      api.cut = cut
      api.pause = pause
      api.restart = restart
      api.debug = debug
      api.feature = feature
      api.pick = pick
      cut = false
      pause = false
      restart = false
      debug = false
      feature = false
      pick = -1
    },
    clearCut() {
      cut = false
      api.cut = false
    },
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (isScrollKey(e.code)) e.preventDefault()
    down.add(e.code)
    api.activity = true
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') cut = true
    if (e.code === 'Escape' || e.code === 'KeyP') pause = true
    if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'NumpadEnter') restart = true
    if (e.code === 'F3' || e.code === 'Backquote') debug = true
    if (e.code === 'KeyM') feature = true
    if (e.code === 'Digit1' || e.code === 'Numpad1') pick = 0
    if (e.code === 'Digit2' || e.code === 'Numpad2') pick = 1
    if (e.code === 'Digit3' || e.code === 'Numpad3') pick = 2
  })
  window.addEventListener('keyup', (e) => down.delete(e.code))
  window.addEventListener('blur', () => down.clear())
  return api
}

function isScrollKey(code: string): boolean {
  return code === 'Space' || code.startsWith('Arrow') || code === 'F3' || code === 'Backquote'
}
