const down = new Set<string>()
const axesOut = { x: 0, y: 0 }

export function createKeyboard() {
  let cut = false
  let pause = false
  let restart = false
  let debug = false
  let feature = false
  let pick = -1
  let claim = false
  let confirm = false
  let shift = false
  let navX = 0
  let navY = 0
  const api = {
    cut: false,
    pause: false,
    restart: false,
    debug: false,
    feature: false,
    pick: -1,
    claim: false,
    confirm: false,
    navX: 0,
    navY: 0,
    shift: false,
    navLock: false,
    activity: false,
    axes() {
      let x = 0
      let y = 0
      if (down.has('KeyA') || (!api.navLock && down.has('ArrowLeft'))) x -= 1
      if (down.has('KeyD') || (!api.navLock && down.has('ArrowRight'))) x += 1
      if (down.has('KeyW') || (!api.navLock && down.has('ArrowUp'))) y += 1
      if (down.has('KeyS') || (!api.navLock && down.has('ArrowDown'))) y -= 1
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
      api.claim = claim
      api.confirm = confirm
      api.navX = navX
      api.navY = navY
      api.shift = shift
      cut = false
      shift = false
      pause = false
      restart = false
      debug = false
      feature = false
      pick = -1
      claim = false
      confirm = false
      navX = 0
      navY = 0
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
    if (e.code === 'Space') cut = true
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') shift = true
    if (e.code === 'Escape' || e.code === 'KeyP') pause = true
    if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'NumpadEnter') restart = true
    if (e.code === 'F3' || e.code === 'Backquote') debug = true
    if (e.code === 'KeyM') feature = true
    if (e.code === 'Digit1' || e.code === 'Numpad1') pick = 0
    if (e.code === 'Digit2' || e.code === 'Numpad2') pick = 1
    if (e.code === 'Digit3' || e.code === 'Numpad3') pick = 2
    if (e.code === 'Digit4' || e.code === 'Numpad4') pick = 3
    if (e.code === 'Tab') {
      claim = true
      e.preventDefault()
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') confirm = true
    if (api.navLock) {
      if (e.code === 'ArrowLeft') navX = -1
      if (e.code === 'ArrowRight') navX = 1
      if (e.code === 'ArrowUp') navY = 1
      if (e.code === 'ArrowDown') navY = -1
    }
  })
  window.addEventListener('keyup', (e) => down.delete(e.code))
  window.addEventListener('blur', () => down.clear())
  return api
}

function isScrollKey(code: string): boolean {
  return code === 'Space' || code.startsWith('Arrow') || code === 'F3' || code === 'Backquote'
}
