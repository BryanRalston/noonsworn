import type { Card } from '../game/leveling'

export interface LevelUp {
  root: HTMLElement
  show: (cards: Card[]) => void
  hide: () => void
  onPick: ((index: number) => void) | null
}

export function createLevelUp(parent: HTMLElement): LevelUp {
  const root = document.createElement('div')
  root.id = 'level-up'
  root.hidden = true
  root.innerHTML = `<div class="panel"><h2>LEVEL UP</h2><div id="cards"></div><p>Press 1, 2, or 3</p></div>`
  parent.append(root)
  const cards = root.querySelector('#cards') as HTMLElement
  const ui: LevelUp = {
    root,
    onPick: null,
    show(list) {
      cards.replaceChildren()
      for (let i = 0; i < list.length; i++) {
        const card = list[i]
        if (!card) continue
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'card'
        btn.innerHTML = `<strong>${i + 1}. ${card.name}</strong><em>${card.from} → ${card.to}</em><span>${card.text}</span>`
        btn.addEventListener('click', () => ui.onPick?.(i))
        cards.append(btn)
      }
      const hint = root.querySelector('p')
      if (hint) hint.textContent = window.matchMedia('(pointer: coarse)').matches ? 'Tap a card' : 'Press 1, 2, or 3'
      root.hidden = false
    },
    hide() {
      root.hidden = true
    },
  }
  return ui
}
