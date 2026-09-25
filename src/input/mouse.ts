import { Vector3, type Camera } from 'three'
import { TUNING } from '../data/tuning'

const ndc = new Vector3()
const aimOut = { x: 0, z: 0 }

export function createMouse(canvas: HTMLCanvasElement) {
  let cut = false
  let clientX = window.innerWidth * 0.62
  let clientY = window.innerHeight * 0.55
  let have = false
  let lastMove = performance.now() - 10_000
  const api = {
    cut: false,
    activity: false,
    idle() {
      return performance.now() - lastMove > TUNING.aimMemory * 1000
    },
    aim(camera: Camera) {
      if (!have || api.idle()) return null
      camera.updateMatrixWorld()
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1, 0.5)
      ndc.unproject(camera)
      const ox = camera.position.x
      const oy = camera.position.y
      const oz = camera.position.z
      const dx = ndc.x - ox
      const dy = ndc.y - oy
      const dz = ndc.z - oz
      if (dy > -1e-4) return null
      const t = -oy / dy
      if (t < 0) return null
      aimOut.x = ox + dx * t
      aimOut.z = oz + dz * t
      return aimOut
    },
    consume() {
      api.cut = cut
      cut = false
    },
    clearCut() {
      cut = false
      api.cut = false
    },
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return
    if (e.target !== canvas) return
    api.activity = true
    have = true
    clientX = e.clientX
    clientY = e.clientY
    lastMove = performance.now()
    if (e.button === 2) cut = true
  })
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    clientX = e.clientX
    clientY = e.clientY
    have = true
    lastMove = performance.now()
    api.activity = true
  })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  return api
}
