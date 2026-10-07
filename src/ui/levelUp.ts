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
  onPick: ((index: number) => void) | null
  onClose: (() => void) | null
}

export function createLevelUp(parent: HTMLElement): LevelUp {
  const root = document.createElement('div')
  root.id = 'level-up'
  root.hidden = true
  root.innerHTML = `<div class="strip"><div class="strip-head"><div class="strip-tag"></div><button type="button" id="level-close">Back</button></div><div id="cards"></div></div>`
  parent.append(root)
  const cards = root.querySelector('#cards') as HTMLElement
  const tag = root.querySelector('.strip-tag') as HTMLElement
  const strip = root.querySelector('.strip') as HTMLElement
  const close = root.querySelector('#level-close') as HTMLButtonElement
  close.setAttribute('aria-label', 'Back, keep the charge')
  let atlas = ''
  let focus = 0
  let count = 0
  let touchPick = false
  function paintFocus() {
    const buttons = cards.querySelectorAll('button')
    buttons.forEach((btn, i) => btn.classList.toggle('focus', i === focus))
  }
  const ui: LevelUp = {
    root,
    onPick: null,
    onClose: null,
    arm(url) {
      atlas = url
    },
    show(list, sunlit, rank) {
      if (atlas) {
        root.style.setProperty('--card-atlas', `url("${atlas}")`)
        document.documentElement.style.setProperty('--card-atlas', `url("${atlas}")`)
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
      cards.replaceChildren()
      for (let i = 0; i < list.length; i++) {
        const card = list[i]
        if (!card) continue
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = card.from === 'new' ? 'card new' : 'card'
        const pair = rank ? completesPair(card.id, rank) : false
        const pips = pipRow(card.rank, card.next, card.max)
        btn.innerHTML = `<span class="card-icon" style="--i:${card.id}"></span><strong>${card.name}</strong>${pair ? '<i class="pair-mark">pair</i>' : ''}<span class="card-line">${card.text}</span>${pips}`
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
      }
      root.hidden = false
      strip.classList.remove('open')
      requestAnimationFrame(() => strip.classList.add('open'))
      paintFocus()
    },
    hide() {
      strip.classList.remove('open')
      root.hidden = true
      count = 0
    },
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

function pipRow(rank: number, next: number, max: number): string {
  if (max <= 1 && rank <= 0) return '<span class="pips"></span>'
  let html = '<span class="pips">'
  const dots = Math.max(max, 1)
  for (let i = 1; i <= dots; i++) {
    const cls = i <= rank ? 'on' : i <= next ? 'next' : ''
    html += `<i class="${cls}"></i>`
  }
  html += '</span>'
  return html
}
