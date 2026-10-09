import { LINE_NAME, previewDay, utcDay, utcLeft } from '../core/noon'
import type { MapId } from '../data/mapId'
import { MAP_DEFS, type MapRecord } from '../data/maps'
import { storageGet } from '../platform/storage'

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
  if (id === 'nadir') return 'Clear the Westering Stair to open'
  return 'Sealed'
}

const CARD_TINT: Record<string, string> = {
  sundial: '#E9D2A6',
  lattice: '#C9973A',
  cloister: '#2C5A8A',
  stair: '#E2C79A',
  nadir: '#14182C',
}

function clock(time: number): string {
  const whole = Math.max(0, Math.floor(time))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function createMapSelect(parent: HTMLElement, onChoose: (id: MapChoice) => void, onPrint?: () => void, pinnedDay?: () => number): MapSelect {
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
  let countEl: HTMLElement | null = null
  let countTimer = 0
  function paintCount() {
    if (countEl) countEl.textContent = `Next print ${utcLeft()}`
  }

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
    countEl = null
    if (onPrint) {
      const day = previewDay(pinnedDay?.() || utcDay())
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.id = 'noon-print'
      btn.className = 'map-card'
      btn.style.gridColumn = '1 / -1'
      btn.style.minHeight = '96px'
      const title = document.createElement('strong')
      title.textContent = 'Noon Print'
      const hook = document.createElement('span')
      const def = MAP_DEFS.find((row) => row.id === day.temple)
      hook.textContent = `${def?.name ?? day.temple} · ${LINE_NAME[day.line] ?? day.line}`
      countEl = document.createElement('em')
      paintCount()
      btn.append(title, hook, countEl)
      btn.addEventListener('click', () => onPrint())
      cards.append(btn)
    }
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
        const swatch = document.createElement('span')
        swatch.className = 'map-swatch'
        swatch.style.background = CARD_TINT[def.id] ?? '#E9D2A6'
        btn.append(swatch)
        if (def.keyart) {
          const img = document.createElement('img')
          img.alt = ''
          img.hidden = true
          img.src = `${import.meta.env.BASE_URL}${def.keyart}`
          const reveal = () => {
            img.hidden = false
            swatch.hidden = true
          }
          img.decode().then(reveal).catch(() => {
            if (img.complete && img.naturalWidth > 0) reveal()
          })
          btn.append(img)
        }
        const title = document.createElement('strong')
        title.textContent = def.name
        if (def.id === 'sundial' && storageGet('noonsworn.dawn') === '1') {
          const badge = document.createElement('span')
          badge.className = 'dawn-badge'
          badge.textContent = 'dawn'
          title.append(badge)
        }
        const hook = document.createElement('span')
        hook.textContent = def.hook
        const time = document.createElement('em')
        time.textContent = def.id === 'nadir' && best?.clear != null
          ? `Clear ${clock(best.clear)} · Night-Clock ${best.remain == null ? '—' : clock(best.remain)}`
          : best?.clear != null
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
      if (countTimer) window.clearInterval(countTimer)
      countTimer = window.setInterval(paintCount, 1000)
    },
    close() {
      root.hidden = true
      if (countTimer) window.clearInterval(countTimer)
      countTimer = 0
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
        if (def && (def.id === 'sundial' || def.id === 'lattice' || def.id === 'cloister' || def.id === 'stair' || def.id === 'nadir')) choose(def.id)
      }
      return null
    },
  }
}
