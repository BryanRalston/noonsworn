import { InstancedMesh, MeshBasicMaterial, OctahedronGeometry } from 'three'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import { FreeList } from '../core/pool'
import { makeCrowd, writeInstance } from '../render/instancing'

const MAX = TUNING.tiers.high.xp

export interface Pickups {
  mesh: InstancedMesh
  update: (dt: number, px: number, pz: number, radius: number, cap: number, gain: (value: number) => void) => void
  spawn: (x: number, z: number, value: number, cap: number) => void
  sync: () => void
  clear: () => void
  used: () => number
}

export function createPickups(): Pickups {
  const mesh = makeCrowd(new OctahedronGeometry(0.18, 0), new MeshBasicMaterial({ color: COLOR.xp }), MAX)
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const value = new Float32Array(MAX)
  const alive = new Uint8Array(MAX)
  const free = new FreeList(MAX)

  const pickups: Pickups = {
    mesh,
    used: () => free.used,
    clear() {
      alive.fill(0)
      free.reset()
    },
    spawn(sx, sz, amount, cap) {
      if (free.used >= cap || free.free <= 0) {
        let best = -1
        let bestD = 1e12
        for (let i = 0; i < MAX; i++) {
          if (!alive[i]) continue
          const dx = (x[i] ?? 0) - sx
          const dz = (z[i] ?? 0) - sz
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        if (best >= 0) value[best] = (value[best] ?? 0) + amount
        return
      }
      const i = free.acquire()
      if (i < 0) return
      x[i] = sx
      z[i] = sz
      value[i] = amount
      alive[i] = 1
    },
    update(dt, px, pz, radius, cap, gain) {
      void cap
      const r2 = radius * radius
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        const dx = px - (x[i] ?? 0)
        const dz = pz - (z[i] ?? 0)
        const d2 = dx * dx + dz * dz
        const grab = TUNING.xp.collect * TUNING.xp.collect
        if (d2 <= grab) {
          gain(value[i] ?? 0)
          alive[i] = 0
          free.release(i)
          continue
        }
        if (d2 <= r2) {
          const d = Math.sqrt(d2) || 1
          const step = Math.min(d, TUNING.xp.fly * dt)
          x[i] = (x[i] ?? 0) + (dx / d) * step
          z[i] = (z[i] ?? 0) + (dz / d) * step
        }
      }
    },
    sync() {
      let n = 0
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        writeInstance(mesh, n, x[i] ?? 0, 0.35, z[i] ?? 0, 0, 1)
        n++
      }
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    },
  }
  return pickups
}
