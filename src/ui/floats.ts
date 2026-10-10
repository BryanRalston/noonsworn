import { Vector3, type Camera } from 'three'

type Kind = 'hot' | 'spark' | 'pop' | 'arm' | 'crit' | 'deflect'

interface Live {
  x: number
  y: number
  z: number
  age: number
  life: number
  text: string
  suffix: string
  kind: Kind
  width: number
  enemy: number
  value: number
  rise: number
  drift: number
  size: number
  fill: string
  stroke: string
  strokeW: number
  pop: boolean
}

const INK = '#2A1606'

export interface Floats {
  push: (x: number, z: number, text: string, kind: Kind, enemy?: number) => void
  /** One number for an area event. `n` above 1 draws “×N” at 12 px. */
  area: (x: number, z: number, value: number, n: number, kind: 'hot' | 'crit' | 'arm') => void
  sync: (camera: Camera, width: number, height: number, dt: number) => void
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

function styleOf(kind: Kind): Pick<Live, 'life' | 'rise' | 'size' | 'fill' | 'stroke' | 'strokeW' | 'pop'> {
  if (kind === 'crit') return { life: 0.7, rise: 1.1, size: 26, fill: '#FFE27A', stroke: INK, strokeW: 3.5, pop: true }
  if (kind === 'arm') return { life: 0.45, rise: 0.7, size: 14, fill: '#A7AEC2', stroke: INK, strokeW: 2.5, pop: false }
  if (kind === 'pop') return { life: 0.7, rise: 1.0, size: 22, fill: '#fff3b0', stroke: INK, strokeW: 3, pop: true }
  if (kind === 'deflect') return { life: 0.45, rise: 0.7, size: 14, fill: '#1A1424', stroke: INK, strokeW: 2, pop: false }
  return { life: 0.6, rise: 1.0, size: 18, fill: '#ffffff', stroke: INK, strokeW: 3, pop: false }
}

export function createFloats(parent: HTMLElement, cap: number): Floats {
  const canvas = document.createElement('canvas')
  canvas.id = 'floats'
  parent.append(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas is required for damage numbers')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.font = '800 18px ui-sans-serif, system-ui, sans-serif'
  ctx.measureText('128')
  const live: Live[] = []
  const v = new Vector3()
  let w = 0
  let h = 0
  let dpr = 1
  let safeLeft = 8
  let safeRight = 8
  let safeTop = 8
  let safeBottom = 8
  let insetW = -1
  let insetH = -1

  function spawn(x: number, z: number, text: string, kind: Kind, enemy: number, value: number, suffix: string) {
    if (live.length >= cap) return
    const look = styleOf(kind)
    const drift = kind === 'crit' ? (Math.random() * 2 - 1) * 0.3 : 0
    live.push({
      x, y: 1.2, z, age: 0, text, suffix, kind, width: 0, enemy, value, drift,
      life: look.life, rise: look.rise, size: look.size, fill: look.fill, stroke: look.stroke, strokeW: look.strokeW, pop: look.pop,
    })
  }

  return {
    push(x, z, text, kind, enemy = -1) {
      if (kind === 'pop') {
        for (let i = 0; i < live.length; i++) {
          const row = live[i]
          if (!row || row.kind !== 'pop') continue
          row.x = x
          row.z = z
          row.y = 1.2
          row.age = 0
          row.text = text
          row.width = 0
          return
        }
      }
      const value = Number(text)
      const numeric = Number.isFinite(value)
      if (enemy >= 0 && numeric) {
        for (let i = 0; i < live.length; i++) {
          const row = live[i]
          if (!row || row.enemy !== enemy || row.kind !== kind || row.age >= 0.25) continue
          row.value += value
          row.text = `${Math.round(row.value)}`
          row.width = 0
          row.age = 0
          row.y = 1.2
          return
        }
      }
      spawn(x, z, text, kind, enemy, numeric ? value : 0, '')
    },
    area(x, z, value, n, kind) {
      const suffix = n > 1 ? `×${n}` : ''
      spawn(x, z, `${Math.round(value)}`, kind, -1, value, suffix)
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
      ctx.lineJoin = 'round'
      if (insetW !== pw || insetH !== ph) {
        insetW = pw
        insetH = ph
        const box = getComputedStyle(canvas)
        const insetOf = (name: string) => {
          const n = parseFloat(box.getPropertyValue(name))
          return Number.isFinite(n) ? n : 0
        }
        safeLeft = insetOf('--safe-left') + 8
        safeRight = insetOf('--safe-right') + 8
        safeTop = insetOf('--safe-top') + 8
        safeBottom = insetOf('--safe-bottom') + 8
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const row = live[i]
        if (!row) continue
        row.age += dt
        row.y += dt * row.rise
        if (row.age >= row.life) {
          live.splice(i, 1)
          continue
        }
        if (row.kind === 'spark') {
          v.set(row.x, row.y, row.z).project(camera)
          const sx = (v.x * 0.5 + 0.5) * pw
          const sy = (-v.y * 0.5 + 0.5) * ph
          ctx.globalAlpha = Math.min(1, (row.life - row.age) * 2)
          ctx.fillStyle = '#b7b7c8'
          ctx.beginPath()
          ctx.arc(sx, sy, 4, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        const driftU = Math.min(1, row.age / 0.3)
        v.set(row.x + row.drift * driftU, row.y, row.z).project(camera)
        const sx = (v.x * 0.5 + 0.5) * pw
        const sy = (-v.y * 0.5 + 0.5) * ph
        const left = row.life - row.age
        ctx.globalAlpha = Math.min(1, left * 3)
        let scale = 1
        if (row.pop) {
          const u = Math.min(1, row.age / 0.12)
          scale = 1.6 - 0.6 * easeOutBack(u)
        }
        ctx.font = `800 ${row.size}px ui-sans-serif, system-ui, sans-serif`
        if (row.width === 0) row.width = ctx.measureText(row.text).width * 0.5
        const halfW = (row.width + (row.suffix ? 18 : 0)) * scale + 4
        const halfH = (row.size * 0.6) * scale
        const minX = safeLeft + halfW
        const maxX = pw - safeRight - halfW
        const minY = safeTop + halfH
        const maxY = ph - safeBottom - halfH
        const cx = minX <= maxX ? Math.min(maxX, Math.max(minX, sx)) : pw * 0.5
        const cy = minY <= maxY ? Math.min(maxY, Math.max(minY, sy)) : ph * 0.5
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(scale, scale)
        ctx.lineWidth = row.strokeW
        ctx.strokeStyle = row.stroke
        ctx.fillStyle = row.fill
        ctx.strokeText(row.text, 0, 0)
        ctx.fillText(row.text, 0, 0)
        if (row.suffix) {
          ctx.font = '800 12px ui-sans-serif, system-ui, sans-serif'
          const gap = row.width + 2
          ctx.strokeText(row.suffix, gap, 4)
          ctx.fillText(row.suffix, gap, 4)
        }
        ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  }
}
