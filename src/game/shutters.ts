import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  MeshToonMaterial,
  Object3D,
  Vector4,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import { toonMap } from '../render/toon'

/** One plate under each pergola, each about 9.2 m from a stair gap. */
export const PLATES: { x: number; z: number; upper: boolean }[] = [
  { x: -7, z: -14, upper: true },
  { x: 7, z: -2, upper: false },
  { x: -7, z: 2, upper: false },
  { x: 7, z: 14, upper: false },
]

const HALF = TUNING.shutter.zone / 2

interface Plate {
  x: number
  z: number
  upper: boolean
  charge: number
  mode: 'wind' | 'tele' | 'open' | 'rearm'
  timer: number
  angle: number
}

export interface ShutterHooks {
  coin: (x: number, z: number) => boolean
  expose: (x: number, z: number, half: number, freeze: number) => void
  mark: (x: number, z: number, radius: number, seconds: number) => void
  open: () => void
  close: () => void
  boss: (upper: boolean) => void
}

export interface ShutterRig {
  mesh: InstancedMesh
  update: (dt: number, px: number, pz: number) => void
  upperOpen: () => boolean
  reset: () => void
  info: () => { x: number; z: number; mode: string; charge: number; openFor: number }[]
}

function slatGeo(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geo = new BoxGeometry(w, h, d)
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const bronze = z > 0 ? COLOR.gold : COLOR.bronze
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = bronze.r
      colors[i * 3 + 1] = bronze.g
      colors[i * 3 + 2] = bronze.b
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.translate(x, y, z)
    parts.push(geo)
  }
  add(5.2, 0.08, 0.28, 0, 0, -1.15)
  add(5.2, 0.08, 0.28, 0, 0, 0)
  add(5.2, 0.08, 0.28, 0, 0, 1.15)
  add(0.12, 0.1, 2.5, -2.45, 0, 0)
  add(0.12, 0.1, 2.5, 2.45, 0, 0)
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('shutter merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

export function createShutters(zones: Vector4[], hooks: ShutterHooks): ShutterRig {
  const mesh = new InstancedMesh(
    slatGeo(),
    new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true }),
    PLATES.length,
  )
  mesh.count = PLATES.length
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.visible = false
  const plates: Plate[] = PLATES.map((spot) => ({
    x: spot.x,
    z: spot.z,
    upper: spot.upper,
    charge: 0,
    mode: 'wind' as const,
    timer: 0,
    angle: 0,
  }))
  const dummy = new Object3D()

  function writeZones() {
    let upper = false
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i]
      const slot = zones[i]
      if (!plate || !slot) continue
      const open = plate.mode === 'open'
      slot.set(plate.x, plate.z, open ? HALF : 0, open ? 1 : 0)
      if (open && plate.upper) upper = true
    }
    hooks.boss(upper)
  }

  function pose() {
    let moving = false
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i]
      if (!plate) continue
      if (plate.angle > 0.02) moving = true
      dummy.position.set(plate.x, 3.92, plate.z)
      dummy.rotation.set(-plate.angle, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.visible = moving
  }

  function rings() {
    let charging = -1
    let best = 0
    let openAt = -1
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i]
      if (!plate) continue
      if (plate.mode === 'open' && openAt < 0) openAt = i
      if (plate.mode === 'wind' && plate.charge > best) {
        best = plate.charge
        charging = i
      }
    }
    if (openAt >= 0) {
      const plate = plates[openAt]
      if (plate) hooks.mark(plate.x, plate.z, HALF, 0.25)
    }
    if (charging >= 0 && charging !== openAt) {
      const plate = plates[charging]
      if (plate) hooks.mark(plate.x, plate.z, Math.max(0.4, HALF * (plate.charge / TUNING.shutter.charge)), 0.25)
    }
  }

  return {
    mesh,
    upperOpen() {
      for (let i = 0; i < plates.length; i++) {
        const plate = plates[i]
        if (plate?.upper && plate.mode === 'open') return true
      }
      return false
    },
    reset() {
      for (let i = 0; i < plates.length; i++) {
        const plate = plates[i]
        if (!plate) continue
        plate.charge = 0
        plate.mode = 'wind'
        plate.timer = 0
        plate.angle = 0
      }
      writeZones()
      pose()
    },
    info() {
      return plates.map((plate) => ({
        x: plate.x,
        z: plate.z,
        mode: plate.mode,
        charge: plate.charge,
        openFor: plate.mode === 'open' ? plate.timer : 0,
      }))
    },
    update(dt, px, pz) {
      for (let i = 0; i < plates.length; i++) {
        const plate = plates[i]
        if (!plate) continue
        if (plate.mode === 'wind') {
          if (hooks.coin(plate.x, plate.z)) plate.charge = Math.min(TUNING.shutter.charge, plate.charge + dt)
          if (plate.charge >= TUNING.shutter.charge) {
            const dx = px - plate.x
            const dz = pz - plate.z
            const step = TUNING.shutter.step
            if (dx * dx + dz * dz <= step * step) {
              plate.mode = 'tele'
              plate.timer = TUNING.shutter.tele
            }
          }
          plate.angle = Math.max(0, plate.angle - dt * 2)
        } else if (plate.mode === 'tele') {
          plate.timer -= dt
          plate.angle = Math.min(0.35, plate.angle + dt)
          if (plate.timer <= 0) {
            plate.mode = 'open'
            plate.timer = TUNING.shutter.open
            plate.charge = 0
            hooks.expose(plate.x, plate.z, HALF, TUNING.shutter.freeze)
            hooks.open()
          }
        } else if (plate.mode === 'open') {
          plate.timer -= dt
          plate.angle = Math.min(1.15, plate.angle + dt * 3)
          if (plate.timer <= 0) {
            plate.mode = 'rearm'
            plate.timer = TUNING.shutter.rearm
            hooks.close()
          }
        } else {
          plate.timer -= dt
          plate.angle = Math.max(0, plate.angle - dt * 2.2)
          if (plate.timer <= 0) plate.mode = 'wind'
        }
      }
      writeZones()
      pose()
      rings()
    },
  }
}
