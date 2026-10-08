import type { MapId } from '../data/mapId'
import { MAP_DEFS, type MapRecord } from '../data/maps'

export type MapChoice = MapId

export interface MapSelect {
  open: (save: MapRecord) => void
  close: () => void
  isOpen: () => boolean
  toast: (text: string | null) => void
  read: (navX: number, navY: number, confirm: boolean, cancel: boolean) => MapChoice | 'back' | null
}

function lockLine(id: string, playable: boolean, open: boolean): string {
  if (!playable && open) return 'Coming soon'
  if (id === 'lattice') return 'Hold Sundial Court for 5:00'
  if (id === 'cloister') return 'Clear Lattice Terraces to open'
  if (id === 'stair') return 'Clear the Brimming Cloister to open'
  return 'Sealed'
}

function clock(time: number): string {
  const whole = Math.max(0, Math.floor(time))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function createMapSelect(parent: HTMLElement, onChoose: (id: MapChoice) => void): MapSelect {
  const host = parent.querySelector('#screens') ?? parent
  const root = document.createElement('div')
  root.id = 'map-select'
  root.className = 'key-backdrop'
  root.hidden = true
  root.innerHTML = `<h2>Choose a Temple</h2><div id="map-cards"></div><p id="picker-toast" hidden></p><p class="map-hint">Arrows and Enter. Esc goes back.</p>`
  host.append(root)
  const cards = root.querySelector('#map-cards') as HTMLElement
  const pickerToast = root.querySelector('#picker-toast') as HTMLElement
  let focus = 0
  let arm = 0
  let save: MapRecord = { unlocked: ['sundial'], best: {}, last: 'sundial', seen: [] }
  const buttons: HTMLButtonElement[] = []

  function unlocked(id: string): boolean {
    return save.unlocked.includes(id)
  }

  function paint() {
    buttons.forEach((btn, i) => btn.classList.toggle('focus', i === focus))
  }

  function choose(id: MapChoice) {
    const def = MAP_DEFS.find((row) => row.id === id)
    if (!def || !def.playable || !unlocked(id)) return
    onChoose(id)
  }

  function rebuild() {
    cards.replaceChildren()
    buttons.length = 0
    for (const def of MAP_DEFS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-card'
      const open = def.playable && unlocked(def.id)
      const best = save.best[def.id]
      if (!open) {
        btn.classList.add('locked', def.id)
        btn.disabled = !def.playable
        const title = document.createElement('strong')
        title.textContent = def.name
        const lock = document.createElement('span')
        lock.textContent = lockLine(def.id, def.playable, unlocked(def.id))
        btn.append(title, lock)
      } else {
        if (def.keyart) {
          const img = document.createElement('img')
          img.alt = ''
          img.src = `${import.meta.env.BASE_URL}${def.keyart}`
          btn.append(img)
        } else {
          const swatch = document.createElement('span')
          swatch.className = 'map-swatch'
          btn.append(swatch)
        }
        const title = document.createElement('strong')
        title.textContent = def.name
        const hook = document.createElement('span')
        hook.textContent = def.hook
        const time = document.createElement('em')
        time.textContent = best?.clear != null
          ? `Clear ${clock(best.clear)} · ${best.clearKills ?? best.kills} kills`
          : best?.survived != null
            ? `Survived ${clock(best.survived)}`
            : best
              ? `Survived ${clock(best.time)}`
              : 'Best —'
        btn.append(title, hook, time)
        btn.addEventListener('click', () => choose(def.id as MapChoice))
      }
      cards.append(btn)
      buttons.push(btn)
    }
    const last = MAP_DEFS.findIndex((def) => def.id === save.last && def.playable && unlocked(def.id))
    focus = last >= 0 ? last : 0
    paint()
  }

  return {
    open(next) {
      save = next
      arm = 2
      rebuild()
      root.hidden = false
    },
    close() {
      root.hidden = true
    },
    isOpen: () => !root.hidden,
    toast(text) {
      pickerToast.hidden = !text
      if (text) pickerToast.textContent = text
    },
    read(navX, navY, confirm, cancel) {
      if (root.hidden) return null
      if (arm > 0) {
        arm--
        return null
      }
      if (cancel) return 'back'
      const step = navX !== 0 ? navX : navY !== 0 ? -navY : 0
      if (step !== 0 && buttons.length > 0) {
        focus = Math.max(0, Math.min(buttons.length - 1, focus + step))
        paint()
      }
      if (confirm) {
        const def = MAP_DEFS[focus]
        if (def && (def.id === 'sundial' || def.id === 'lattice' || def.id === 'cloister' || def.id === 'stair')) choose(def.id)
      }
      return null
    },
  }
}
