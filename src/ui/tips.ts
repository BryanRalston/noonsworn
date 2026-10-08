import { storageGet, storageSet } from '../platform/storage'

const KEY = 'noonsworn.tips.v1'

interface Tip {
  id: string
  title: string
  text: string
  icon: string
}

const TIPS: Tip[] = [
  { id: 'elite', title: 'Elite', text: 'A marked foe. It hits harder.', icon: 'icon_might.webp' },
  { id: 'chest', title: 'Sun Chest', text: 'A chest of sunlight. Open it when you can.', icon: 'icon_wide.webp' },
  { id: 'boon', title: 'Sun boon', text: 'One gift that bends the sun. Only one per offer.', icon: 'icon_longday.webp' },
  { id: 'evolution', title: 'Evolution', text: 'A mastered weapon has changed form.', icon: 'icon_flare.webp' },
  { id: 'hound', title: 'Shade Hound', text: 'It lunges. Step off the magenta line.', icon: 'icon_swift.webp' },
]

export interface Tips {
  setEnabled: (on: boolean) => void
  notify: (id: string) => void
  update: (dt: number) => void
}

export function createTips(parent: HTMLElement): Tips {
  const root = document.createElement('div')
  root.id = 'jit'
  root.hidden = true
  root.innerHTML = '<img alt=""><div><strong></strong><span></span></div>'
  parent.append(root)
  const img = root.querySelector('img') as HTMLImageElement
  const title = root.querySelector('strong') as HTMLElement
  const text = root.querySelector('span') as HTMLElement
  const base = import.meta.env.BASE_URL
  let seen = readSeen()
  const queue: Tip[] = []
  let current: Tip | null = null
  let timer = 0
  let enabled = true
  function show(tip: Tip) {
    img.src = `${base}assets/art/${tip.icon}`
    img.alt = ''
    title.textContent = tip.title
    text.textContent = tip.text
    root.hidden = false
  }
  return {
    setEnabled(on) {
      enabled = on
      if (!on) {
        queue.length = 0
        current = null
        root.hidden = true
      }
    },
    notify(id) {
      if (!enabled || seen.has(id)) return
      const tip = TIPS.find((row) => row.id === id)
      if (!tip) return
      seen.add(id)
      storageSet(KEY, JSON.stringify([...seen]))
      queue.push(tip)
    },
    update(dt) {
      if (!enabled) return
      const strip = document.getElementById('level-up')
      const offering = !!strip && strip.classList.contains('show')
      if (offering && current?.id === 'boon') {
        root.hidden = true
        return
      }
      if (offering && !current && queue[0]?.id === 'boon') return
      if (!offering && current?.id === 'boon' && root.hidden) show(current)
      if (!current) {
        current = queue.shift() ?? null
        if (!current) {
          root.hidden = true
          return
        }
        timer = 3
        show(current)
        return
      }
      timer -= dt
      if (timer <= 0) {
        current = null
        root.hidden = true
      }
    },
  }
}

function readSeen(): Set<string> {
  const raw = storageGet(KEY)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item) => typeof item === 'string'))
  } catch {
    return new Set()
  }
}
