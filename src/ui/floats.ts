import { Vector3, type Camera } from 'three'

interface Live {
  x: number
  y: number
  z: number
  t: number
  text: string
  kind: 'hot' | 'spark' | 'pop' | 'arm' | 'crit'
}

const FONT = {
  hot: '700 20px system-ui, sans-serif',
  pop: '700 26px system-ui, sans-serif',
  arm: '700 16px system-ui, sans-serif',
  spark: '700 20px system-ui, sans-serif',
  crit: '700 22px system-ui, sans-serif',
} as const

export interface Floats {
  push: (x: number, z: number, text: string, kind: 'hot' | 'spark' | 'pop' | 'arm' | 'crit') => void
  sync: (camera: Camera, width: number, height: number, dt: number) => void
}

export function createFloats(parent: HTMLElement, _cap: number): Floats {
  const canvas = document.createElement('canvas')
  canvas.id = 'floats'
  parent.append(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas is required for damage numbers')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const font of Object.values(FONT)) {
    ctx.font = font
    ctx.measureText('128')
  }
  const live: Live[] = []
  const v = new Vector3()
  let w = 0
  let h = 0
  let dpr = 1
  return {
    push(x, z, text, kind) {
      if (live.length >= 12) return
      live.push({ x, y: 1.2, z, t: 0.7, text, kind })
    },
    sync(camera, width, height, dt) {
      const pw = Math.max(1, width | 0)
      const ph = Math.max(1, height | 0)
      const next = Math.min(2, window.devicePixelRatio || 1)
      if (w !== pw || h !== ph || dpr !== next) {
        w = pw
        h = ph
        dpr = next
        canvas.width = Math.floor(pw * dpr)
        canvas.height = Math.floor(ph * dpr)
        canvas.style.width = `${pw}px`
        canvas.style.height = `${ph}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, pw, ph)
      if (live.length === 0) return
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      const box = getComputedStyle(canvas)
      const insetOf = (name: string) => {
        const n = parseFloat(box.getPropertyValue(name))
        return Number.isFinite(n) ? n : 0
      }
      const safeLeft = insetOf('--safe-left') + 8
      const safeRight = insetOf('--safe-right') + 8
      const safeTop = insetOf('--safe-top') + 8
      const safeBottom = insetOf('--safe-bottom') + 8
      for (let i = live.length - 1; i >= 0; i--) {
        const row = live[i]
        if (!row) continue
        row.t -= dt
        row.y += dt * 1.4
        if (row.t <= 0) {
          live.splice(i, 1)
          continue
        }
        v.set(row.x, row.y, row.z).project(camera)
        const sx = (v.x * 0.5 + 0.5) * pw
        const sy = (-v.y * 0.5 + 0.5) * ph
        ctx.globalAlpha = Math.min(1, row.t * 2)
        if (row.kind === 'spark') {
          ctx.fillStyle = '#b7b7c8'
          ctx.beginPath()
          ctx.arc(sx, sy, 4, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        const born = 1 - Math.min(1, row.t / 0.7)
        const pop = 1.4 - 0.4 * Math.min(1, born / 0.22)
        ctx.font = FONT[row.kind]
        const halfW = ctx.measureText(row.text).width * 0.5 * pop + 4 * pop
        const halfH = (row.kind === 'pop' ? 16 : 12) * pop
        const minX = safeLeft + halfW
        const maxX = pw - safeRight - halfW
        const minY = safeTop + halfH
        const maxY = ph - safeBottom - halfH
        const cx = minX <= maxX ? Math.min(maxX, Math.max(minX, sx)) : pw * 0.5
        const cy = minY <= maxY ? Math.min(maxY, Math.max(minY, sy)) : ph * 0.5
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(pop, pop)
        ctx.strokeStyle = '#141225'
        ctx.fillStyle = row.kind === 'crit' ? '#F2C14A' : row.kind === 'arm' ? '#c8c4d4' : '#fff3b0'
        ctx.lineWidth = 4
        ctx.strokeText(row.text, 0, 0)
        ctx.fillText(row.text, 0, 0)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  }
}
