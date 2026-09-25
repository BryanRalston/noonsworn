export type ScreenMode = 'title' | 'playing' | 'paused' | 'dead' | 'clear' | 'level'

export interface Screens {
  setMode: (mode: ScreenMode, detail?: string) => void
  onPlay: (() => void) | null
  onRestart: (() => void) | null
  onResume: (() => void) | null
  onFeature: (() => void) | null
}

export function createScreens(parent: HTMLElement): Screens {
  const root = document.createElement('div')
  root.id = 'screens'
  root.innerHTML = `
    <section id="title-screen">
      <h1>NOONSWORN</h1>
      <p>Tap or press any key</p>
      <button type="button" id="btn-play">Play</button>
      <button type="button" id="btn-feature">Feature Map</button>
    </section>
    <section id="pause-screen" hidden>
      <h2>PAUSED</h2>
      <button type="button" id="btn-resume">Resume</button>
      <button type="button" id="btn-pause-restart">Restart</button>
      <button type="button" id="btn-pause-feature">Feature Map</button>
    </section>
    <section id="end-screen" hidden>
      <h2 id="end-title">THE LIGHT FAILS</h2>
      <p id="end-detail"></p>
      <button type="button" id="btn-end">Restart</button>
    </section>`
  parent.append(root)
  const title = root.querySelector('#title-screen') as HTMLElement
  const pause = root.querySelector('#pause-screen') as HTMLElement
  const end = root.querySelector('#end-screen') as HTMLElement
  const endTitle = root.querySelector('#end-title') as HTMLElement
  const endDetail = root.querySelector('#end-detail') as HTMLElement
  const endBtn = root.querySelector('#btn-end') as HTMLButtonElement
  const screens: Screens = {
    onPlay: null,
    onRestart: null,
    onResume: null,
    onFeature: null,
    setMode(mode, detail) {
      title.hidden = mode !== 'title'
      pause.hidden = mode !== 'paused'
      const ended = mode === 'dead' || mode === 'clear'
      end.hidden = !ended
      if (mode === 'dead') {
        endTitle.textContent = 'THE LIGHT FAILS'
        endBtn.textContent = 'Restart'
      } else if (mode === 'clear') {
        endTitle.textContent = 'THE DAY IS HELD'
        endBtn.textContent = 'Play again'
      }
      if (detail) endDetail.textContent = detail
    },
  }
  root.querySelector('#btn-play')?.addEventListener('click', () => screens.onPlay?.())
  root.querySelector('#btn-feature')?.addEventListener('click', (e) => {
    e.stopPropagation()
    screens.onFeature?.()
  })
  root.querySelector('#btn-resume')?.addEventListener('click', () => screens.onResume?.())
  root.querySelector('#btn-pause-restart')?.addEventListener('click', () => screens.onRestart?.())
  root.querySelector('#btn-pause-feature')?.addEventListener('click', () => screens.onFeature?.())
  endBtn.addEventListener('click', () => screens.onRestart?.())
  return screens
}
