import { BOUGHT_IDS, EARNED_IDS, LINE_ID, MARK_COST, liveMeta } from '../game/meta'

/** The unlock board's only name. Bryan may rename this one string. */
export const WHEEL_NAME = 'Hour Wheel'

const MARK_NAME: Record<string, string> = {
  'mark.frame': 'Picker frame',
  'mark.reroll1': 'Reroll',
  'mark.palette1': 'Palette I',
  'mark.weaponA': 'Weapon unlock A',
  'mark.banish1': 'Banish',
  'mark.palette2': 'Palette II',
  'mark.weaponB': 'Weapon unlock B',
  'mark.reroll2': 'Reroll 2',
  'mark.banish2': 'Banish 2',
  'mark.temples': 'Four temples',
  'mark.finale': 'Finale',
  'mark.prints': 'with Noon Print',
}

interface Mark {
  id: string
  cost: number
  earned: boolean
}

function marks(): Mark[] {
  const bought: Mark[] = BOUGHT_IDS.map((id, i) => ({ id, cost: MARK_COST[i] ?? 0, earned: false }))
  const earned: Mark[] = EARNED_IDS.map((id) => ({ id, cost: 0, earned: true }))
  return bought.concat(earned)
}

function nextMarkText(): string {
  const env = liveMeta().env
  for (let i = 0; i < BOUGHT_IDS.length; i++) {
    const id = BOUGHT_IDS[i] ?? ''
    if (!id || env.wheel.includes(id)) continue
    const cost = MARK_COST[i] ?? 0
    const runs = env.sunmarks >= cost ? 0 : Math.max(1, Math.ceil((cost - env.sunmarks) / 18))
    return `next mark: ${MARK_NAME[id]}, ${cost}, ~${runs} runs`
  }
  for (let i = 0; i < EARNED_IDS.length; i++) {
    const id = EARNED_IDS[i] ?? ''
    if (id && !env.wheel.includes(id)) return `next mark: ${MARK_NAME[id]}`
  }
  return 'next mark: with Noon Print'
}

export interface MetaHooks {
  wake: () => void
  paint: () => void
  mapId: () => string
  onReroll: () => void
  onBanish: (index: number) => void
  setHeld: (on: boolean) => void
}

const LINE_NAME: Record<string, string> = {
  'line.sliver': 'Sliver Line',
  'line.hard': 'Hard Line',
  'line.blister': 'Blister Line',
  'line.quick': 'Quick Line',
  'line.quick.stair': 'The Stair keeps its own sun.',
  'line.quick.nadir': 'Nadir keeps its own light.',
  'line.fewhands': 'Few Hands',
}

let hooks: MetaHooks | null = null
let wheel: HTMLElement | null = null
let wardrobe: HTMLElement | null = null
let confirmId = ''
let offered = false

export function wheelOpen(): boolean {
  return !!wheel && !wheel.hidden
}

export function wardrobeOpen(): boolean {
  return !!wardrobe && !wardrobe.hidden
}

function held() {
  hooks?.setHeld(wheelOpen() || wardrobeOpen())
  hooks?.wake()
}

function short(id: string): string {
  if (id === 'mark.frame') return 'Frame'
  if (id === 'mark.reroll1') return 'Reroll'
  if (id === 'mark.palette1') return 'Palette I'
  if (id === 'mark.weaponA') return 'Weapon A'
  if (id === 'mark.banish1') return 'Banish'
  if (id === 'mark.palette2') return 'Palette II'
  if (id === 'mark.weaponB') return 'Weapon B'
  if (id === 'mark.reroll2') return 'Reroll 2'
  if (id === 'mark.banish2') return 'Banish 2'
  if (id === 'mark.temples') return 'Temples'
  if (id === 'mark.finale') return 'Finale'
  return 'Noon Print'
}

function paintWheel() {
  if (!wheel) return
  const env = liveMeta().env
  const ring = wheel.querySelector('.wheel-ring') as HTMLElement
  const note = wheel.querySelector('.wheel-note') as HTMLElement
  const buttons = ring.querySelectorAll('button')
  const list = marks()
  buttons.forEach((btn, i) => {
    const mark = list[i]
    if (!mark) return
    const owned = env.wheel.includes(mark.id)
    const kept = env.ent.includes(`kept.${mark.id}`)
    const earned = mark.earned
    btn.classList.toggle('fill', owned && !earned)
    btn.classList.toggle('outline', owned && !!earned)
    btn.classList.toggle('locked', !owned)
    const cost = mark.cost
    const label = mark.id === 'mark.prints' ? 'with Noon Print' : kept ? `${short(mark.id)} kept` : owned ? short(mark.id) : cost ? `${short(mark.id)} ${cost}` : short(mark.id)
    btn.textContent = confirmId === mark.id ? `Confirm ${cost}?` : label
    btn.disabled = !owned && (!cost || mark.id === 'mark.prints')
    if (mark.id === 'mark.prints') btn.disabled = true
  })
  const notice = liveMeta().notice
  note.textContent = notice || nextMarkText()
}

function paintWardrobe() {
  if (!wardrobe) return
  const env = liveMeta().env
  const linen = env.wheel.includes('mark.finale') || env.ent.includes('line.fewhands')
  const rows: { id: string; name: string; open: boolean; why: string }[] = [
    { id: 'default', name: 'Default', open: true, why: '' },
    { id: 'linen', name: 'Dawn Linen', open: linen, why: 'Clear the finale' },
    { id: 'flax', name: 'Flax', open: env.wheel.includes('mark.palette1'), why: 'Palette I' },
    { id: 'pewter', name: 'Pewter', open: env.wheel.includes('mark.palette2'), why: 'Palette II' },
  ]
  const host = wardrobe.querySelector('.wardrobe-list') as HTMLElement
  host.replaceChildren()
  for (const row of rows) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = row.open ? row.name : `${row.name} · ${row.why}`
    btn.disabled = !row.open
    btn.classList.toggle('on', env.palette === row.id)
    btn.addEventListener('click', () => {
      if (liveMeta().setPalette(row.id)) {
        hooks?.paint()
        paintWardrobe()
      }
    })
    host.append(btn)
  }
}

export function openWheel() {
  if (!wheel) return
  confirmId = ''
  if (wardrobe) wardrobe.hidden = true
  wheel.hidden = false
  paintWheel()
  held()
}

export function openWardrobe() {
  if (!wardrobe) return
  if (wheel) wheel.hidden = true
  wardrobe.hidden = false
  paintWardrobe()
  held()
}

export function closeMeta() {
  confirmId = ''
  if (wheel) wheel.hidden = true
  if (wardrobe) wardrobe.hidden = true
  held()
}

function syncMenu() {
  const credits = document.querySelector('#btn-credits')
  if (!credits || !credits.parentElement) return
  let btn = document.querySelector('#btn-wheel') as HTMLButtonElement | null
  if (!liveMeta().env.sunmarks && !liveMeta().env.ent.length && !liveMeta().env.wheel.length) {
    btn?.remove()
    document.querySelector('#btn-wardrobe-menu')?.remove()
    return
  }
  if (!btn) {
    btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'btn-wheel'
    btn.className = 'menu-item'
    btn.textContent = WHEEL_NAME
    btn.addEventListener('click', () => openWheel())
    credits.after(btn)
  }
  const env = liveMeta().env
  const showWardrobe = env.wheel.includes('mark.finale') || env.wheel.includes('mark.palette1') || env.wheel.includes('mark.palette2') || env.ent.includes('line.fewhands')
  let ward = document.querySelector('#btn-wardrobe-menu') as HTMLButtonElement | null
  if (!showWardrobe) {
    ward?.remove()
    return
  }
  if (!ward) {
    ward = document.createElement('button')
    ward.type = 'button'
    ward.id = 'btn-wardrobe-menu'
    ward.className = 'menu-item'
    ward.textContent = 'Wardrobe'
    ward.addEventListener('click', () => openWardrobe())
    btn.after(ward)
  }
}

export function syncPicker() {
  const cards = document.querySelector('#map-cards')
  if (cards) cards.classList.toggle('framed', liveMeta().env.wheel.includes('mark.frame'))
  const host = document.querySelector('#map-select')
  if (!host) return
  let row = document.querySelector('#line-row') as HTMLElement | null
  if (!row) {
    row = document.createElement('div')
    row.id = 'line-row'
    const hint = host.querySelector('.map-hint')
    if (hint) host.insertBefore(row, hint)
    else host.append(row)
  }
  const env = liveMeta().env
  const map = hooks?.mapId() ?? 'sundial'
  row.replaceChildren()
  for (const id of LINE_ID) {
    if (!env.ent.includes(id)) continue
    const btn = document.createElement('button')
    btn.type = 'button'
    const on = env.lines.includes(id)
    const blocked = id === 'line.quick' && (map === 'stair' || map === 'nadir')
    btn.classList.toggle('on', on)
    btn.disabled = blocked
    const reason = blocked ? LINE_NAME[map === 'stair' ? 'line.quick.stair' : 'line.quick.nadir'] : ''
    btn.textContent = reason ? `${LINE_NAME[id] ?? id} · ${reason}` : (LINE_NAME[id] ?? id)
    btn.addEventListener('click', () => {
      const now = liveMeta().env.lines.slice()
      const at = now.indexOf(id)
      if (at >= 0) now.splice(at, 1)
      else if (now.length < 3) now.push(id)
      liveMeta().setLines(now)
      syncPicker()
      syncPause()
    })
    row.append(btn)
  }
}

export function syncPause() {
  const el = document.getElementById('pause-lines')
  if (!el) return
  const names = liveMeta().armed().map((id) => LINE_NAME[id] ?? id)
  el.hidden = names.length === 0
  el.textContent = names.join(' · ')
}

export function paintResult() {
  const btn = document.getElementById('btn-next-mark') as HTMLButtonElement | null
  if (!btn) return
  btn.hidden = false
  btn.textContent = nextMarkText()
  if (!offered) {
    offered = true
    btn.addEventListener('click', () => openWheel())
  }
  syncMenu()
}

export function syncOffer(rerollLeft: number, banishLeft: number, focus: number) {
  const host = document.getElementById('offer-tools')
  if (!host) return
  const ownR = liveMeta().rerolls()
  const ownB = liveMeta().banishes()
  host.replaceChildren()
  if (!ownR && !ownB) return
  if (ownR) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'btn-reroll'
    btn.textContent = `Reroll ${rerollLeft}`
    btn.disabled = rerollLeft <= 0
    btn.addEventListener('click', () => hooks?.onReroll())
    host.append(btn)
  }
  if (ownB) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'btn-banish'
    btn.textContent = `Banish ${banishLeft}`
    btn.disabled = banishLeft <= 0
    btn.addEventListener('click', () => hooks?.onBanish(focus))
    host.append(btn)
  }
}

export function attach(next: MetaHooks) {
  hooks = next
  if (!wheel) {
    wheel = document.createElement('div')
    wheel.id = 'hour-wheel'
    wheel.hidden = true
    wheel.innerHTML = `<div class="wheel-card"><h2>${WHEEL_NAME}</h2><div class="wheel-ring"></div><p class="wheel-note"></p><button type="button" id="btn-wheel-wardrobe">Wardrobe</button><button type="button" id="btn-wheel-close">Back</button></div>`
    const ring = wheel.querySelector('.wheel-ring') as HTMLElement
    const list = marks()
    for (let i = 0; i < list.length; i++) {
      const mark = list[i]
      if (!mark) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.style.setProperty('--a', `${i * 30}deg`)
      btn.addEventListener('click', () => {
        if (mark.earned) return
        if (liveMeta().env.wheel.includes(mark.id)) return
        if (mark.cost >= 100 && confirmId !== mark.id) {
          confirmId = mark.id
          paintWheel()
          return
        }
        confirmId = ''
        liveMeta().buy(mark.id, true)
        paintWheel()
        syncMenu()
        syncPicker()
      })
      ring.append(btn)
    }
    wheel.querySelector('#btn-wheel-close')?.addEventListener('click', () => closeMeta())
    wheel.querySelector('#btn-wheel-wardrobe')?.addEventListener('click', () => openWardrobe())
    document.body.append(wheel)
  }
  if (!wardrobe) {
    wardrobe = document.createElement('div')
    wardrobe.id = 'wardrobe'
    wardrobe.hidden = true
    wardrobe.innerHTML = `<div class="wheel-card"><h2>Wardrobe</h2><div class="wardrobe-list"></div><button type="button" id="btn-wardrobe-close">Back</button></div>`
    wardrobe.querySelector('#btn-wardrobe-close')?.addEventListener('click', () => {
      if (wardrobe) wardrobe.hidden = true
      openWheel()
    })
    document.body.append(wardrobe)
  }
  syncMenu()
  syncPause()
  held()
}
