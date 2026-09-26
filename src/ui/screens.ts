import { storageGet, storageSet } from '../platform/storage'

const SHAKE = 'noonsworn.shake'
const HAPTICS = 'noonsworn.haptics'
const MUTE = 'noonsworn.mute'
const MUSIC = 'noonsworn.music'
const SFX = 'noonsworn.sfx'

export type ScreenMode = 'title' | 'playing' | 'paused' | 'dead' | 'clear' | 'level'

export interface Screens {
  setMode: (mode: ScreenMode, detail?: string) => void
  onPlay: (() => void) | null
  onRestart: (() => void) | null
  onResume: (() => void) | null
  onFeature: (() => void) | null
  onAudio: ((which: 'music' | 'sfx' | 'mute', value: number) => void) | null
}

export function createScreens(parent: HTMLElement): Screens {
  const root = document.createElement('div')
  root.id = 'screens'
  root.innerHTML = `
    <section id="title-screen">
      <h1>NOONSWORN</h1>
      <div class="title-actions">
        <p class="prompt">Tap or press any key</p>
        <button type="button" id="btn-play">Play</button>
        <button type="button" id="btn-feature">Feature Map</button>
        <label class="toggle"><input type="checkbox" data-setting="shake"> Screen shake</label>
        <label class="toggle"><input type="checkbox" data-setting="haptics"> Haptics</label>
        <label class="slider">Music <input type="range" min="0" max="100" data-audio="music" value="45"></label>
        <label class="slider">SFX <input type="range" min="0" max="100" data-audio="sfx" value="90"></label>
        <label class="toggle"><input type="checkbox" data-setting="mute"> Mute</label>
      </div>
    </section>
    <section id="pause-screen" hidden>
      <h2>PAUSED</h2>
      <button type="button" id="btn-resume">Resume</button>
      <button type="button" id="btn-pause-restart">Restart</button>
      <button type="button" id="btn-pause-feature">Feature Map</button>
      <label class="toggle"><input type="checkbox" data-setting="shake"> Screen shake</label>
      <label class="toggle"><input type="checkbox" data-setting="haptics"> Haptics</label>
      <label class="slider">Music <input type="range" min="0" max="100" data-audio="music" value="45"></label>
      <label class="slider">SFX <input type="range" min="0" max="100" data-audio="sfx" value="90"></label>
      <label class="toggle"><input type="checkbox" data-setting="mute"> Mute</label>
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
  const boxes = root.querySelectorAll<HTMLInputElement>('input[data-setting]')
  const sliders = root.querySelectorAll<HTMLInputElement>('input[data-audio]')
  function sync() {
    const shake = storageGet(SHAKE) !== '0'
    const haptics = storageGet(HAPTICS) !== '0'
    const mute = storageGet(MUTE) === '1'
    boxes.forEach((box) => {
      if (box.dataset.setting === 'shake') box.checked = shake
      else if (box.dataset.setting === 'haptics') box.checked = haptics
      else box.checked = mute
    })
    sliders.forEach((slider) => {
      const key = slider.dataset.audio === 'music' ? MUSIC : SFX
      const fallback = slider.dataset.audio === 'music' ? '45' : '90'
      slider.value = storageGet(key) ?? fallback
    })
  }
  sync()
  let notify: ((which: 'music' | 'sfx' | 'mute', value: number) => void) | null = null
  boxes.forEach((box) => {
    box.addEventListener('change', () => {
      const setting = box.dataset.setting
      const key = setting === 'shake' ? SHAKE : setting === 'haptics' ? HAPTICS : MUTE
      const on = setting === 'mute' ? box.checked : box.checked
      storageSet(key, setting === 'mute' ? (on ? '1' : '0') : on ? '1' : '0')
      if (setting === 'mute') notify?.('mute', box.checked ? 1 : 0)
      sync()
    })
  })
  sliders.forEach((slider) => {
    slider.addEventListener('input', () => {
      const key = slider.dataset.audio === 'music' ? MUSIC : SFX
      storageSet(key, slider.value)
      notify?.(slider.dataset.audio === 'music' ? 'music' : 'sfx', Number(slider.value))
      sync()
    })
  })
  const screens: Screens = {
    onPlay: null,
    onRestart: null,
    onResume: null,
    onFeature: null,
    onAudio: null,
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
      sync()
    },
  }
  notify = (which, value) => screens.onAudio?.(which, value)
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
