import { IcosahedronGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { TUNING } from '../data/tuning'
import { FreeList } from '../core/pool'
import { makeCrowd, writeInstance } from '../render/instancing'

const MAX = TUNING.tiers.high.xp

export interface Pickups {
  mesh: InstancedMesh
  update: (dt: number, px: number, pz: number, radius: number, cap: number, gain: (value: number) => void) => void
  spawn: (x: number, z: number, value: number, cap: number, px: number, pz: number) => void
  sync: () => void
  clear: () => void
  used: () => number
  visit: (fn: (x: number, z: number) => void) => void
}

export function createPickups(): Pickups {
  const gem = new MeshBasicMaterial({ color: 0xb6ffe6, toneMapped: false })
  gem.color.multiplyScalar(TUNING.look.emissiveGain)
  const mesh = makeCrowd(new IcosahedronGeometry(0.16, 0), gem, MAX)
  const x = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const value = new Float32Array(MAX)
  const alive = new Uint8Array(MAX)
  const age = new Float32Array(MAX)
  const free = new FreeList(MAX)

  const pickups: Pickups = {
    mesh,
    used: () => free.used,
    clear() {
      alive.fill(0)
      age.fill(0)
      free.reset()
    },
    visit(fn) {
      for (let i = 0; i < MAX; i++) if (alive[i]) fn(x[i] ?? 0, z[i] ?? 0)
    },
    spawn(sx, sz, amount, cap, px, pz) {
      if (free.used >= cap || free.free <= 0) {
        const limit = TUNING.xp.merge * TUNING.xp.merge
        let near = -1
        let nearD = limit
        let far = -1
        let farD = -1
        for (let i = 0; i < MAX; i++) {
          if (!alive[i]) continue
          const dx = (x[i] ?? 0) - sx
          const dz = (z[i] ?? 0) - sz
          const d = dx * dx + dz * dz
          if (d <= nearD) {
            nearD = d
            near = i
          }
          const pdx = (x[i] ?? 0) - px
          const pdz = (z[i] ?? 0) - pz
          const pd = pdx * pdx + pdz * pdz
          if (pd > farD) {
            farD = pd
            far = i
          }
        }
        if (near >= 0) {
          value[near] = (value[near] ?? 0) + amount
          return
        }
        if (far >= 0) {
          x[far] = sx
          z[far] = sz
          value[far] = amount
          age[far] = 0
        }
        return
      }
      const i = free.acquire()
      if (i < 0) return
      x[i] = sx
      z[i] = sz
      value[i] = amount
      age[i] = 0
      alive[i] = 1
    },
    update(dt, px, pz, radius, cap, gain) {
      const r2 = radius * radius
      const crowded = cap > 0 && free.used / cap >= 0.8
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue
        age[i] = (age[i] ?? 0) + dt
        const dx = px - (x[i] ?? 0)
        const dz = pz - (z[i] ?? 0)
        const d2 = dx * dx + dz * dz
        const grab = TUNING.xp.collect * TUNING.xp.collect
        if (d2 <= grab) {
          gain(value[i] ?? 0)
          alive[i] = 0
          age[i] = 0
          free.release(i)
          continue
        }
        const drift = crowded || (age[i] ?? 0) > 20
        if (d2 <= r2 || drift) {
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
