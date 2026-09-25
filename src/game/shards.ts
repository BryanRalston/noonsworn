import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import { COLOR } from '../data/palette'
import { makeCrowd } from '../render/instancing'

const MAX = 240
const COUNT = 8
const dummy = new Object3D()
const tint = new Color()

function hash(n: number): number {
  let t = Math.imul(n | 0, 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface Shards {
  mesh: InstancedMesh
  burst: (x: number, z: number, lit: boolean) => void
  update: (dt: number) => void
}

export function createShards(): Shards {
  const mesh = makeCrowd(new BoxGeometry(0.1, 0.14, 0.08), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX)
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
  const x = new Float32Array(MAX)
  const y = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vy = new Float32Array(MAX)
  const vz = new Float32Array(MAX)
  const life = new Float32Array(MAX)
  const spin = new Float32Array(MAX)
  const cr = new Float32Array(MAX)
  const cg = new Float32Array(MAX)
  const cb = new Float32Array(MAX)
  let cursor = 0
  let salt = 1

  return {
    mesh,
    burst(sx, sz, lit) {
      salt = (salt + 17) | 0
      const c = lit ? COLOR.goldHot : COLOR.umbralRim
      for (let k = 0; k < COUNT; k++) {
        const i = cursor
        cursor = (cursor + 1) % MAX
        const h = hash(salt * 13 + k * 97)
        const h2 = hash(salt * 29 + k * 53 + 3)
        const ang = h * Math.PI * 2
        x[i] = sx
        y[i] = 0.4
        z[i] = sz
        vx[i] = Math.cos(ang) * (1.6 + h2 * 3.2)
        vz[i] = Math.sin(ang) * (1.6 + h * 3.2)
        vy[i] = 2.4 + h2 * 2.8
        life[i] = 0.32 + h * 0.18
        spin[i] = ang
        cr[i] = c.r
        cg[i] = c.g
        cb[i] = c.b
      }
    },
    update(dt) {
      let n = 0
      for (let i = 0; i < MAX; i++) {
        if ((life[i] ?? 0) <= 0) continue
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) continue
        vy[i] = (vy[i] ?? 0) - 14 * dt
        x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt
        y[i] = Math.max(0.06, (y[i] ?? 0) + (vy[i] ?? 0) * dt)
        z[i] = (z[i] ?? 0) + (vz[i] ?? 0) * dt
        const s = 0.35 + (life[i] ?? 0)
        dummy.position.set(x[i] ?? 0, y[i] ?? 0, z[i] ?? 0)
        dummy.rotation.set((spin[i] ?? 0) + n, spin[i] ?? 0, 0)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        mesh.setMatrixAt(n, dummy.matrix)
        tint.setRGB(cr[i] ?? 1, cg[i] ?? 1, cb[i] ?? 1)
        mesh.setColorAt(n, tint)
        n++
      }
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    },
  }
}
