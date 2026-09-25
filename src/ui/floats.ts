import { Vector3, type Camera } from 'three'

interface Live {
  el: HTMLElement
  x: number
  y: number
  z: number
  t: number
}

export interface Floats {
  push: (x: number, z: number, text: string, kind: 'hot' | 'arm' | 'pop') => void
  sync: (camera: Camera, width: number, height: number, dt: number) => void
}

export function createFloats(parent: HTMLElement, cap: number): Floats {
  const root = document.createElement('div')
  root.id = 'floats'
  parent.append(root)
  const pool: HTMLElement[] = []
  for (let i = 0; i < cap; i++) {
    const el = document.createElement('div')
    el.className = 'float'
    el.hidden = true
    root.append(el)
    pool.push(el)
  }
  const live: Live[] = []
  const v = new Vector3()
  let cursor = 0
  return {
    push(x, z, text, kind) {
      const el = pool[cursor]
      if (!el) return
      cursor = (cursor + 1) % pool.length
      el.textContent = text
      el.className = `float ${kind}`
      el.hidden = false
      const item = live.find((row) => row.el === el)
      if (item) {
        item.x = x
        item.y = 1.2
        item.z = z
        item.t = 0.7
      } else live.push({ el, x, y: 1.2, z, t: 0.7 })
    },
    sync(camera, width, height, dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const row = live[i]
        if (!row) continue
        row.t -= dt
        row.y += dt * 1.4
        if (row.t <= 0) {
          row.el.hidden = true
          live.splice(i, 1)
          continue
        }
        v.set(row.x, row.y, row.z).project(camera)
        row.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * width}px, ${(-v.y * 0.5 + 0.5) * height}px)`
        row.el.style.opacity = String(Math.min(1, row.t * 2))
      }
    },
  }
}
