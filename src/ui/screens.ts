import type { TierName } from '../data/tuning'
import { storageGet, storageSet } from '../platform/storage'

const SHAKE = 'noonsworn.shake'
const HAPTICS = 'noonsworn.haptics'
const MUTE = 'noonsworn.mute'
const MUSIC = 'noonsworn.music'
const SFX = 'noonsworn.sfx'
const TIPS = 'noonsworn.tips'
const AUTOPICK = 'noonsworn.autopick'
const QUALITY = 'noonsworn.quality.pref'

export type ScreenMode = 'splash' | 'menu' | 'howto' | 'settings' | 'credits' | 'playing' | 'paused' | 'dead' | 'clear' | 'level'
export type QualityPref = 'auto' | TierName

type HintDevice = 'keyboard' | 'touch' | 'pad'

function pages(device: HintDevice) {
  const move = device === 'touch' ? 'Drag to move.' : device === 'pad' ? 'Left stick to move.' : 'WASD to move.'
  const dash = device === 'touch' ? 'Dash-slash through them. Tap Cut.' : device === 'pad' ? 'Dash-slash through them. Press A.' : 'Dash-slash through them. Press Space.'
  const halo = device === 'touch' ? 'A level-up banks a charge. Tap the halo.' : device === 'pad' ? 'A level-up banks a charge. Press LB.' : 'A level-up banks a charge. Press Tab.'
  return [
    { title: 'Move', text: move, icon: 'icon_swift.webp' },
    { title: 'Auto-weapons', text: 'Lances and discs fire on their own. You still move, dash, and choose upgrades.', icon: 'icon_spear.webp' },
    { title: 'Sunlight', text: 'Enemies standing in the sun take double damage. Fight in the light.', icon: 'icon_wide.webp' },
    { title: 'Noon Cut', text: dash, icon: 'icon_flare.webp' },
    { title: 'Halo power-ups', text: halo, icon: 'icon_halo.webp' },
  ]
}

export interface Screens {
  setMode: (mode: ScreenMode, detail?: string) => void
  setBeamPaused: (paused: boolean) => void
  setQuality: (value: QualityPref) => void
  navigate: (dx: number, dy: number, confirm: boolean) => void
  back: () => void
  setDevice: (device: 'keyboard' | 'touch' | 'pad') => void
  onPlay: (() => void) | null
  onRestart: (() => void) | null
  onNext: (() => void) | null
  onTemple: (() => void) | null
  onResume: (() => void) | null
  onFeature: (() => void) | null
  onQuit: (() => void) | null
  onScreen: ((mode: ScreenMode) => void) | null
  onAudio: ((which: 'music' | 'sfx' | 'mute', value: number) => void) | null
  onQuality: ((value: QualityPref) => void) | null
  onTips: ((on: boolean) => void) | null
  onAutopick: ((on: boolean) => void) | null
  onResetTutorial: (() => void) | null
  onHover: (() => void) | null
  setToast: (text: string | null) => void
  setEnd: (view: EndView) => void
}

export interface EndView {
  title: string
  detail: string
  cause: string
  record: string
  progress: string
  icons: { id: number; name: string }[]
  primary: string
  primaryAction: 'retry' | 'next' | 'menu'
  retry: boolean
  temple: boolean
  revive: boolean
}

export function tipsEnabled(): boolean {
  return storageGet(TIPS) !== '0'
}

export function autopickEnabled(): boolean {
  return storageGet(AUTOPICK) === '1'
}

export function createScreens(parent: HTMLElement): Screens {
  const root = document.createElement('div')
  root.id = 'screens'
  const base = import.meta.env.BASE_URL
  root.innerHTML = `
    <section id="splash-screen">
      <div class="sun-beam"></div>
      <h1 class="logo-slot">NOONSWORN</h1>
      <p class="prompt pulse">Press any key / Tap to start</p>
    </section>
    <section id="menu-screen" hidden>
      <div class="sun-beam"></div>
      <div class="menu-panel">
        <h1 class="logo-slot">NOONSWORN</h1>
        <button type="button" class="menu-item primary" id="btn-play">Play</button>
        <button type="button" class="menu-item" id="btn-howto">How to Play</button>
        <button type="button" class="menu-item" id="btn-settings">Settings</button>
        <button type="button" class="menu-item" id="btn-credits">Credits</button>
      </div>
    </section>
    <section id="howto-screen" hidden>
      <article id="howto-card">
        <img id="howto-icon" alt="">
        <h2 id="howto-title"></h2>
        <p id="howto-text"></p>
      </article>
      <div class="howto-nav">
        <button type="button" id="howto-prev" aria-label="Previous">‹</button>
        <span id="howto-dots"></span>
        <button type="button" id="howto-next" aria-label="Next">›</button>
      </div>
      <button type="button" id="howto-back">Back</button>
    </section>
    <section id="settings-screen" hidden>
      <h2>SETTINGS</h2>
      <label class="slider">Music <input type="range" min="0" max="100" data-audio="music" value="45"></label>
      <label class="slider">SFX <input type="range" min="0" max="100" data-audio="sfx" value="90"></label>
      <label class="toggle"><input type="checkbox" data-setting="mute"> Mute</label>
      <label class="toggle"><input type="checkbox" data-setting="shake"> Screen shake</label>
      <label class="toggle"><input type="checkbox" data-setting="haptics"> Haptics</label>
      <label class="slider">Quality
        <select id="quality-pref">
          <option value="auto">Auto</option>
          <option value="high">High</option>
          <option value="med">Med</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label class="toggle"><input type="checkbox" data-setting="tips"> Tips</label>
      <label class="toggle"><input type="checkbox" data-setting="autopick"> Auto-pick upgrades</label>
      <button type="button" id="btn-reset-tut">Reset tutorial</button>
      <button type="button" id="settings-back">Back</button>
    </section>
    <section id="credits-screen" hidden>
      <h2>CREDITS</h2>
      <p>Original Lapis Noon illustrations and models for Sela, the Dusk Mite, and the Shade Hound. No CC0 model packs.</p>
      <p>Sound: Kenney, and artisticdude, StarNinjas, Fupi, PWL, SketchMan3 via OpenGameArt. All CC0.</p>
      <p>Music: cynicmusic, Centurion_of_war, CleytonKauffman, Bo Jingles (after TAD), and Joth, via OpenGameArt. All CC0.</p>
      <p>Three.js is MIT.</p>
      <button type="button" id="credits-back">Back</button>
    </section>
    <section id="pause-screen" hidden>
      <div class="menu-panel">
        <h2>PAUSED</h2>
        <button type="button" class="menu-item primary" id="btn-resume">Resume</button>
        <button type="button" class="menu-item" id="btn-pause-howto">How to Play</button>
        <button type="button" class="menu-item" id="btn-pause-settings">Settings</button>
        <button type="button" class="menu-item" id="btn-pause-quit">Quit to menu</button>
        <p id="pause-lines" hidden></p>
      </div>
    </section>
    <section id="end-screen" hidden>
      <h2 id="end-title">THE LIGHT FAILS</h2>
      <p id="end-cause"></p>
      <p id="end-detail"></p>
      <p id="end-record"></p>
      <div id="end-icons"></div>
      <p id="end-progress"></p>
      <p id="end-marks" hidden></p>
      <button type="button" class="menu-item" id="btn-next-mark" hidden></button>
      <p id="map-toast" hidden>New temple opened</p>
      <button type="button" class="menu-item primary" id="btn-end">Retry</button>
      <button type="button" class="menu-item" id="btn-end-retry" hidden>Retry</button>
      <button type="button" class="menu-item" id="btn-end-temple" hidden>Change Temple</button>
      <button type="button" class="menu-item" id="btn-end-menu">Menu</button>
      <button type="button" class="menu-item" id="btn-revive" disabled hidden>Revive — coming soon</button>
    </section>`
  parent.append(root)
  const sections = new Map<ScreenMode, HTMLElement>()
  const bind = (mode: ScreenMode, id: string) => {
    const el = root.querySelector(id) as HTMLElement
    sections.set(mode, el)
  }
  bind('splash', '#splash-screen')
  bind('menu', '#menu-screen')
  bind('howto', '#howto-screen')
  bind('settings', '#settings-screen')
  bind('credits', '#credits-screen')
  bind('paused', '#pause-screen')
  const end = root.querySelector('#end-screen') as HTMLElement
  const endTitle = root.querySelector('#end-title') as HTMLElement
  const endDetail = root.querySelector('#end-detail') as HTMLElement
  const endBtn = root.querySelector('#btn-end') as HTMLButtonElement
  const endCause = root.querySelector('#end-cause') as HTMLElement
  const endRecord = root.querySelector('#end-record') as HTMLElement
  const endIcons = root.querySelector('#end-icons') as HTMLElement
  const endProgress = root.querySelector('#end-progress') as HTMLElement
  const endRetry = root.querySelector('#btn-end-retry') as HTMLButtonElement
  const endTemple = root.querySelector('#btn-end-temple') as HTMLButtonElement
  const endMenu = root.querySelector('#btn-end-menu') as HTMLButtonElement
  const endRevive = root.querySelector('#btn-revive') as HTMLButtonElement
  const mapToast = root.querySelector('#map-toast') as HTMLElement
  const boxes = root.querySelectorAll<HTMLInputElement>('input[data-setting]')
  const sliders = root.querySelectorAll<HTMLInputElement>('input[data-audio]')
  const quality = root.querySelector('#quality-pref') as HTMLSelectElement
  const howtoTitle = root.querySelector('#howto-title') as HTMLElement
  const howtoText = root.querySelector('#howto-text') as HTMLElement
  const howtoIcon = root.querySelector('#howto-icon') as HTMLImageElement
  const howtoDots = root.querySelector('#howto-dots') as HTMLElement
  let page = 0
  let focus = 0
  let hint: HintDevice = 'keyboard'
  let mode: ScreenMode = 'splash'
  let returnTo: ScreenMode = 'menu'
  let qualitySilent = false
  function paintHow() {
    const list = pages(hint)
    const item = list[page] ?? list[0]
    if (!item) return
    howtoTitle.textContent = item.title
    howtoText.textContent = item.text
    howtoIcon.src = `${base}assets/art/${item.icon}`
    howtoDots.textContent = list.map((_, i) => (i === page ? '●' : '○')).join(' ')
  }
  function sync() {
    const shake = storageGet(SHAKE) !== '0'
    const haptics = storageGet(HAPTICS) !== '0'
    const mute = storageGet(MUTE) === '1'
    const tips = storageGet(TIPS) !== '0'
    const auto = storageGet(AUTOPICK) === '1'
    boxes.forEach((box) => {
      const setting = box.dataset.setting
      if (setting === 'shake') box.checked = shake
      else if (setting === 'haptics') box.checked = haptics
      else if (setting === 'tips') box.checked = tips
      else if (setting === 'autopick') box.checked = auto
      else box.checked = mute
    })
    sliders.forEach((slider) => {
      const key = slider.dataset.audio === 'music' ? MUSIC : SFX
      const fallback = slider.dataset.audio === 'music' ? '45' : '90'
      slider.value = storageGet(key) ?? fallback
    })
    const pref = storageGet(QUALITY)
    if (pref === 'low' || pref === 'med' || pref === 'high' || pref === 'auto') {
      qualitySilent = true
      quality.value = pref
      qualitySilent = false
    }
  }
  function focusables(): HTMLElement[] {
    const host = mode === 'dead' || mode === 'clear' ? end : sections.get(mode)
    if (!host) return []
    return [...host.querySelectorAll<HTMLElement>('button, input, select')].filter((el) => !el.hidden && !(el instanceof HTMLButtonElement && el.disabled))
  }
  function paintFocus() {
    const list = focusables()
    if (focus >= list.length) focus = 0
    list.forEach((el, i) => el.classList.toggle('focus', i === focus))
  }
  function showPage(next: number) {
    page = (next + pages(hint).length) % pages(hint).length
    paintHow()
  }
  paintHow()
  sync()
  const screens: Screens = {
    onPlay: null,
    onRestart: null,
    onNext: null,
    onTemple: null,
    onResume: null,
    onFeature: null,
    onQuit: null,
    onScreen: null,
    onAudio: null,
    onQuality: null,
    onTips: null,
    onAutopick: null,
    onResetTutorial: null,
    onHover: null,
    setEnd(view) {
      end.hidden = false
      end.classList.toggle('sealed', view.title === 'NOON IS SWORN')
      endTitle.textContent = view.title
      endCause.textContent = view.cause
      endDetail.textContent = view.detail
      endRecord.textContent = view.record
      endProgress.textContent = view.progress
      endBtn.textContent = view.primary
      endBtn.onclick = () => {
        if (view.primaryAction === 'next') screens.onNext?.()
        else if (view.primaryAction === 'menu') screens.onQuit?.()
        else screens.onRestart?.()
      }
      endRetry.hidden = !view.retry
      endTemple.hidden = !view.temple
      // The rewarded revive is still a stub. Keep the button in the DOM and do not show it.
      endRevive.hidden = true
      endRecord.hidden = view.record.length === 0
      endIcons.replaceChildren()
      for (let i = 0; i < view.icons.length; i++) {
        const icon = view.icons[i]
        if (!icon) continue
        const span = document.createElement('span')
        span.className = 'end-icon'
        span.style.setProperty('--i', String(icon.id))
        span.title = icon.name
        endIcons.append(span)
      }
      focus = 0
      paintFocus()
    },
    setToast(text) {
      mapToast.hidden = !text
      if (text) mapToast.textContent = text
    },
    setBeamPaused(paused) {
      root.classList.toggle('beam-paused', paused)
    },
    setQuality(value) {
      qualitySilent = true
      quality.value = value
      qualitySilent = false
      storageSet(QUALITY, value)
    },
    setMode(next, detail) {
      mode = next
      sections.forEach((el) => {
        el.hidden = true
      })
      end.hidden = true
      const show = sections.get(next)
      if (show) show.hidden = false
      if (next === 'dead' || next === 'clear') {
        end.hidden = false
        endTitle.textContent = next === 'clear' ? 'THE DAY IS HELD' : 'THE LIGHT FAILS'
        if (detail) endDetail.textContent = detail
      }
      if (next === 'menu' || next === 'paused' || next === 'splash') focus = 0
      if (next !== 'level') sync()
      paintFocus()
    },
    navigate(dx, dy, confirm) {
      if (mode === 'howto' && dx !== 0) {
        showPage(page + (dx > 0 ? 1 : -1))
        screens.onHover?.()
        return
      }
      const list = focusables()
      if (list.length === 0) return
      if (dy !== 0) {
        focus = (focus + (dy > 0 ? -1 : 1) + list.length) % list.length
        paintFocus()
        screens.onHover?.()
      }
      const current = list[focus]
      if (dx !== 0 && current instanceof HTMLInputElement && current.type === 'range') {
        const span = Number(current.max) - Number(current.min)
        current.value = String(Math.min(Number(current.max), Math.max(Number(current.min), Number(current.value) + Math.sign(dx) * Math.max(1, span / 20))))
        current.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (confirm && current instanceof HTMLElement) current.click()
    },
    back() {
      screens.onScreen?.(returnTo)
    },
    setDevice(device) {
      if (device === hint) return
      hint = device
      if (mode === 'howto') paintHow()
    },
  }
  function sub(next: ScreenMode) {
    returnTo = mode === 'paused' ? 'paused' : 'menu'
    const el = sections.get(next)
    if (el) el.classList.toggle('key-backdrop', returnTo === 'menu' && (next === 'howto' || next === 'settings'))
    screens.onScreen?.(next)
  }
  root.querySelector('#btn-play')?.addEventListener('click', () => screens.onPlay?.())
  root.querySelector('#btn-howto')?.addEventListener('click', () => sub('howto'))
  root.querySelector('#btn-settings')?.addEventListener('click', () => sub('settings'))
  root.querySelector('#btn-credits')?.addEventListener('click', () => sub('credits'))
  root.querySelector('#btn-resume')?.addEventListener('click', () => screens.onResume?.())
  root.querySelector('#btn-pause-howto')?.addEventListener('click', () => sub('howto'))
  root.querySelector('#btn-pause-settings')?.addEventListener('click', () => sub('settings'))
  root.querySelector('#btn-pause-quit')?.addEventListener('click', () => screens.onQuit?.())
  root.querySelector('#howto-back')?.addEventListener('click', () => screens.back())
  root.querySelector('#settings-back')?.addEventListener('click', () => screens.back())
  root.querySelector('#credits-back')?.addEventListener('click', () => screens.back())
  root.querySelector('#howto-prev')?.addEventListener('click', () => showPage(page - 1))
  root.querySelector('#howto-next')?.addEventListener('click', () => showPage(page + 1))
  root.querySelector('#btn-reset-tut')?.addEventListener('click', () => screens.onResetTutorial?.())
  endRetry.addEventListener('click', () => screens.onRestart?.())
  endTemple.addEventListener('click', () => screens.onTemple?.())
  endMenu.addEventListener('click', () => screens.onQuit?.())
  boxes.forEach((box) => {
    box.addEventListener('change', () => {
      const setting = box.dataset.setting
      if (setting === 'tips') {
        storageSet(TIPS, box.checked ? '1' : '0')
        screens.onTips?.(box.checked)
        return
      }
      if (setting === 'autopick') {
        storageSet(AUTOPICK, box.checked ? '1' : '0')
        screens.onAutopick?.(box.checked)
        return
      }
      const key = setting === 'shake' ? SHAKE : setting === 'haptics' ? HAPTICS : MUTE
      storageSet(key, box.checked ? '1' : '0')
      if (setting === 'mute') screens.onAudio?.('mute', box.checked ? 1 : 0)
      sync()
    })
  })
  sliders.forEach((slider) => {
    slider.addEventListener('input', () => {
      const which = slider.dataset.audio === 'music' ? 'music' : 'sfx'
      storageSet(which === 'music' ? MUSIC : SFX, slider.value)
      screens.onAudio?.(which, Number(slider.value))
    })
  })
  quality.addEventListener('change', () => {
    if (qualitySilent) return
    const value = quality.value
    if (value !== 'auto' && value !== 'low' && value !== 'med' && value !== 'high') return
    storageSet(QUALITY, value)
    screens.onQuality?.(value)
  })
  root.querySelectorAll('.menu-item').forEach((el) => {
    el.addEventListener('pointerenter', () => {
      const list = focusables()
      const index = list.indexOf(el as HTMLElement)
      if (index >= 0) focus = index
      paintFocus()
      screens.onHover?.()
    })
  })
  const card = root.querySelector('#howto-card') as HTMLElement
  let swipeX = 0
  card.addEventListener('pointerdown', (e) => {
    swipeX = e.clientX
  })
  card.addEventListener('pointerup', (e) => {
    const dx = e.clientX - swipeX
    if (dx > 36) showPage(page - 1)
    else if (dx < -36) showPage(page + 1)
  })
  return screens
}
