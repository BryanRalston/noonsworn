export interface DebugStats {
  fps: number
  avg: number
  low: number
  frameMs: number
  tier: string
  ratio: number
  dynres: boolean
  calls: number
  triangles: number
  geometries: number
  textures: number
  enemies: number
  cap: number
  exposed: number
  angle: number
  pools: string
  renderer: string
  extra: string
  bloom: boolean
}

const TIMES = new Float32Array(120)
const SORT = new Float32Array(120)
let count = 0
let head = 0

export function pushFrameSample(ms: number) {
  TIMES[head] = ms
  head = (head + 1) % TIMES.length
  if (count < TIMES.length) count++
}

export function frameSummary(latest: number): { fps: number; avg: number; low: number } {
  const fps = latest > 0.01 ? 1000 / latest : 0
  let sum = 0
  let n = 0
  for (let i = 0; i < count && sum < 1000; i++) {
    const idx = (head - 1 - i + TIMES.length * 4) % TIMES.length
    const ms = TIMES[idx] ?? 0
    SORT[n] = ms
    sum += ms
    n++
  }
  const avg = n > 0 ? 1000 / (sum / n) : 0
  for (let i = 1; i < n; i++) {
    const v = SORT[i] ?? 0
    let j = i - 1
    while (j >= 0 && (SORT[j] ?? 0) > v) {
      SORT[j + 1] = SORT[j] ?? 0
      j--
    }
    SORT[j + 1] = v
  }
  const lowIndex = n > 1 ? Math.min(n - 1, Math.max(0, Math.ceil(n * 0.99) - 1)) : 0
  const lowMs = n > 0 ? (SORT[lowIndex] ?? latest) : latest
  return { fps, avg, low: lowMs > 0.01 ? 1000 / lowMs : 0 }
}

export interface DebugOverlay {
  root: HTMLElement
  toggle: () => void
  open: () => void
  readonly visible: boolean
  setText: (stats: DebugStats) => void
  onTier: ((tier: 'low' | 'med' | 'high') => void) | null
  onSpawn: (() => void) | null
  onFreeze: (() => void) | null
  onDynres: ((on: boolean) => void) | null
}

export function createDebugOverlay(parent: HTMLElement): DebugOverlay {
  const root = document.createElement('div')
  root.id = 'debug'
  root.hidden = true
  root.innerHTML = `
    <pre id="debug-text"></pre>
    <div class="debug-actions">
      <button type="button" data-tier="low">Low</button>
      <button type="button" data-tier="med">Med</button>
      <button type="button" data-tier="high">High</button>
      <button type="button" id="debug-spawn">Spawn 50</button>
      <button type="button" id="debug-freeze">Freeze sun</button>
      <button type="button" id="debug-dynres">Dynres on</button>
    </div>`
  parent.append(root)
  const text = root.querySelector('#debug-text') as HTMLElement
  const dynBtn = root.querySelector('#debug-dynres') as HTMLButtonElement
  const freezeBtn = root.querySelector('#debug-freeze') as HTMLButtonElement
  let visible = false
  const overlay: DebugOverlay = {
    root,
    onTier: null,
    onSpawn: null,
    onFreeze: null,
    onDynres: null,
    get visible() {
      return visible
    },
    toggle() {
      visible = !visible
      root.hidden = !visible
    },
    open() {
      visible = true
      root.hidden = false
    },
    setText(stats) {
      dynBtn.textContent = stats.dynres ? 'Dynres on' : 'Dynres off'
      freezeBtn.textContent = stats.extra.includes('frozen') ? 'Sun frozen' : 'Freeze sun'
      text.textContent =
        `FPS ${stats.fps.toFixed(0)}  avg ${stats.avg.toFixed(0)}  1% ${stats.low.toFixed(0)}\n` +
        `frame ${stats.frameMs.toFixed(2)} ms\n` +
        `tier ${stats.tier}  ratio ${stats.ratio.toFixed(2)}  dynres ${stats.dynres ? 'on' : 'off'}  bloom ${stats.bloom ? 'on' : 'off'}\n` +
        `draws ${stats.calls}  tris ${stats.triangles}\n` +
        `geo ${stats.geometries}  tex ${stats.textures}\n` +
        `enemies ${stats.enemies}/${stats.cap}  exposed ${(stats.exposed * 100).toFixed(0)}%\n` +
        `sun ${(stats.angle * 180 / Math.PI).toFixed(0)}°\n` +
        `${stats.pools}\n${stats.renderer}\n${stats.extra}`
    },
  }
  root.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier
      if (tier === 'low' || tier === 'med' || tier === 'high') overlay.onTier?.(tier)
    })
  })
  root.querySelector('#debug-spawn')?.addEventListener('click', () => overlay.onSpawn?.())
  freezeBtn.addEventListener('click', () => overlay.onFreeze?.())
  dynBtn.addEventListener('click', () => overlay.onDynres?.(!dynBtn.textContent?.includes('on')))
  return overlay
}
