import type { Card } from '../game/leveling'

export interface LevelUp {
  root: HTMLElement
  show: (cards: Card[], sunlit: boolean) => void
  hide: () => void
  arm: (url: string) => void
  move: (dir: number) => void
  confirm: () => void
  onPick: ((index: number) => void) | null
}

export function createLevelUp(parent: HTMLElement): LevelUp {
  const root = document.createElement('div')
  root.id = 'level-up'
  root.hidden = true
  root.innerHTML = `<div class="strip"><div class="strip-tag"></div><div id="cards"></div></div>`
  parent.append(root)
  const cards = root.querySelector('#cards') as HTMLElement
  const tag = root.querySelector('.strip-tag') as HTMLElement
  const strip = root.querySelector('.strip') as HTMLElement
  let atlas = ''
  let focus = 0
  let count = 0
  function paintFocus() {
    const buttons = cards.querySelectorAll('button')
    buttons.forEach((btn, i) => btn.classList.toggle('focus', i === focus))
  }
  const ui: LevelUp = {
    root,
    onPick: null,
    arm(url) {
      atlas = url
    },
    show(list, sunlit) {
      if (atlas) root.style.setProperty('--card-atlas', `url("${atlas}")`)
      count = list.length
      focus = 0
      tag.textContent = sunlit ? 'Sunlit' : '1  2  3   ·   Esc keeps the charge'
      strip.classList.toggle('sunlit', sunlit)
      cards.replaceChildren()
      for (let i = 0; i < list.length; i++) {
        const card = list[i]
        if (!card) continue
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = card.from === 'new' ? 'card new' : 'card'
        const pips = pipRow(card.rank, card.next, card.max)
        btn.innerHTML = `<span class="card-icon" style="--i:${card.id}"></span><strong>${card.name}</strong><span class="card-line">${card.text}</span>${pips}`
        btn.addEventListener('click', () => ui.onPick?.(i))
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
  return ui
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
