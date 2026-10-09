import type { Card } from '../game/leveling'

/** Weapon id, then the passive that completes it. Kept here so the strip does not import the chest table. */
const PAIRS: readonly [number, number][] = [
  [0, 18],
  [1, 19],
  [9, 2],
  [10, 5],
  [14, 3],
  [15, 6],
  [16, 20],
  [17, 4],
]

function completesPair(id: number, rank: (id: number) => number): boolean {
  for (let i = 0; i < PAIRS.length; i++) {
    const row = PAIRS[i]
    if (!row) continue
    const weapon = row[0]
    const passive = row[1]
    if (id === weapon && rank(weapon) === 4 && rank(passive) >= 1) return true
    if (id === passive && rank(passive) === 0 && rank(weapon) >= 5) return true
  }
  return false
}

export interface LevelUp {
  root: HTMLElement
  show: (cards: Card[], sunlit: boolean, rank?: (id: number) => number) => void
  hide: () => void
  arm: (url: string) => void
  move: (dir: number) => void
  confirm: () => void
  index: () => number
  onPick: ((index: number) => void) | null
  onClose: (() => void) | null
}

export function createLevelUp(parent: HTMLElement): LevelUp {
  const root = document.createElement('div')
  root.id = 'level-up'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `<div class="strip"><div class="strip-head"><div class="strip-tag"></div><button type="button" id="level-close">Back</button></div><div id="cards"></div><div id="offer-tools"></div></div>`
  parent.append(root)
  const cards = root.querySelector('#cards') as HTMLElement
  const tag = root.querySelector('.strip-tag') as HTMLElement
  const strip = root.querySelector('.strip') as HTMLElement
  const close = root.querySelector('#level-close') as HTMLButtonElement
  close.setAttribute('aria-label', 'Back, keep the charge')
  let atlas = ''
  let atlasOn = false
  let focus = 0
  let count = 0
  let touchPick = false
  const slots: HTMLButtonElement[] = []
  function paintFocus() {
    for (let i = 0; i < slots.length; i++) slots[i]?.classList.toggle('focus', i === focus)
  }
  function ensureSlot(i: number): HTMLButtonElement {
    const existing = slots[i]
    if (existing) return existing
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.innerHTML = '<span class="card-icon"></span><strong></strong><i class="pair-mark" hidden>pair</i><span class="card-line"></span><span class="pips"></span>'
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') return
      e.preventDefault()
      touchPick = true
      ui.onPick?.(i)
      holdTouch(() => {
        touchPick = false
      })
    })
    btn.addEventListener('click', () => {
      if (touchPick) return
      ui.onPick?.(i)
    })
    btn.addEventListener('pointerenter', () => {
      focus = i
      paintFocus()
    })
    cards.append(btn)
    slots[i] = btn
    return btn
  }
  function warm() {
    for (let i = 0; i < 4; i++) {
      const btn = ensureSlot(i)
      const icon = btn.querySelector('.card-icon') as HTMLElement
      icon.style.setProperty('--i', String(i))
      const line = btn.querySelector('.card-line') as HTMLElement
      line.textContent = 'Warm the card line so the first offer does not shape new text.'
      const name = btn.querySelector('strong') as HTMLElement
      name.textContent = 'Warm'
      paintPips(btn.querySelector('.pips') as HTMLElement, 1, 2, 5)
    }
    strip.style.opacity = '0'
    strip.style.pointerEvents = 'none'
    strip.classList.add('open')
    void strip.offsetHeight
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        strip.classList.remove('open')
        strip.style.opacity = ''
        strip.style.pointerEvents = ''
      })
    })
  }
  const ui: LevelUp = {
    root,
    onPick: null,
    onClose: null,
    arm(url) {
      atlas = url
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      root.style.setProperty('--card-atlas', `url("${url}")`)
      document.documentElement.style.setProperty('--card-atlas', `url("${url}")`)
      atlasOn = true
      const paint = () => {
        const scratch = document.createElement('canvas')
        scratch.width = 8
        scratch.height = 8
        const ctx = scratch.getContext('2d')
        if (ctx && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, 8, 8)
        warm()
      }
      if (typeof img.decode === 'function') void img.decode().then(paint).catch(paint)
      else paint()
    },
    show(list, sunlit, rank) {
      if (atlas && !atlasOn) {
        root.style.setProperty('--card-atlas', `url("${atlas}")`)
        document.documentElement.style.setProperty('--card-atlas', `url("${atlas}")`)
        atlasOn = true
      }
      count = list.length
      focus = 0
      const touch = window.matchMedia('(pointer: coarse)').matches || document.getElementById('touch-root')?.classList.contains('touch-off') === false
      tag.textContent = sunlit
        ? touch
          ? 'Sunlit · tap a card'
          : 'Sunlit'
        : touch
          ? 'Tap a card · Back keeps the charge'
          : '1  2  3   ·   Esc keeps the charge'
      strip.classList.toggle('sunlit', sunlit)
      for (let i = 0; i < list.length; i++) {
        const card = list[i]
        if (!card) continue
        const btn = ensureSlot(i)
        btn.hidden = false
        btn.className = card.from === 'new' ? 'card new' : 'card'
        const icon = btn.querySelector('.card-icon') as HTMLElement
        icon.style.setProperty('--i', String(card.id))
        const name = btn.querySelector('strong') as HTMLElement
        if (name.textContent !== card.name) name.textContent = card.name
        const line = btn.querySelector('.card-line') as HTMLElement
        if (line.textContent !== card.text) line.textContent = card.text
        const mark = btn.querySelector('.pair-mark') as HTMLElement
        mark.hidden = !(rank && completesPair(card.id, rank))
        paintPips(btn.querySelector('.pips') as HTMLElement, card.rank, card.next, card.max)
      }
      for (let i = list.length; i < slots.length; i++) {
        const extra = slots[i]
        if (extra) extra.hidden = true
      }
      root.setAttribute('aria-hidden', 'false')
      root.classList.add('show')
      strip.classList.add('open')
      setLevelChrome(true)
      paintFocus()
    },
    hide() {
      strip.classList.remove('open')
      root.classList.remove('show')
      root.setAttribute('aria-hidden', 'true')
      setLevelChrome(false)
      count = 0
    },
    index: () => focus,
    move(dir) {
      if (count < 1 || dir === 0) return
      focus = (focus + (dir > 0 ? 1 : -1) + count) % count
      paintFocus()
    },
    confirm() {
      if (count < 1) return
      ui.onPick?.(focus)
    },
  }
  bindTouch(close, () => ui.onClose?.())
  return ui
}

/** A synthesized click can arrive well after pointerup when the strip reopens. */
function holdTouch(release: () => void) {
  window.setTimeout(release, 150)
}

function bindTouch(el: HTMLElement, fn: () => void) {
  let fromTouch = false
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return
    e.preventDefault()
    fromTouch = true
    fn()
    holdTouch(() => {
      fromTouch = false
    })
  })
  el.addEventListener('click', () => {
    if (fromTouch) return
    fn()
  })
}

function setLevelChrome(open: boolean): void {
  document.getElementById('touch-root')?.classList.toggle('level-hide', open)
  document.getElementById('btn-halo')?.classList.toggle('level-hide', open)
}

function paintPips(el: HTMLElement, rank: number, next: number, max: number): void {
  if (max <= 1 && rank <= 0) {
    el.replaceChildren()
    return
  }
  const dots = Math.max(max, 1)
  while (el.childElementCount < dots) el.append(document.createElement('i'))
  while (el.childElementCount > dots) el.lastElementChild?.remove()
  for (let i = 0; i < dots; i++) {
    const pip = el.children[i] as HTMLElement
    const n = i + 1
    pip.className = n <= rank ? 'on' : n <= next ? 'next' : ''
  }
}
