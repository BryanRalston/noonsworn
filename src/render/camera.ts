import { PerspectiveCamera, Vector3 } from 'three'
import { TUNING } from '../data/tuning'
import { smoothDamp } from '../core/math'

const UP = new Vector3(0, 1, 0)
const _fwd = new Vector3()
const _right = new Vector3()

export interface FollowCamera {
  camera: PerspectiveCamera
  basis: (out: { fx: number; fz: number; rx: number; rz: number }) => void
  update: (x: number, z: number, dt: number, shakeX: number, shakeZ: number) => void
  snap: (x: number, z: number) => void
}

export function createFollowCamera(): FollowCamera {
  const camera = new PerspectiveCamera(TUNING.camera.fov, 1, TUNING.camera.near, TUNING.camera.far)
  const pitch = TUNING.camera.pitch
  const yaw = TUNING.camera.yaw
  let focusX = 0
  let focusZ = 0
  const velX = { v: 0 }
  const velZ = { v: 0 }
  let offX = 0
  let offY = 0
  let offZ = 0
  let portrait = false

  function placeRig(dist: number) {
    const horiz = dist * Math.cos(pitch)
    offX = Math.sin(yaw) * horiz
    offY = Math.sin(pitch) * dist
    offZ = Math.cos(yaw) * horiz
  }
  placeRig(TUNING.camera.distance)

  function place(sx: number, sz: number) {
    camera.position.set(focusX + offX + sx, offY, focusZ + offZ + sz)
    camera.lookAt(focusX + sx, TUNING.camera.lookHeight, focusZ + sz)
    camera.updateMatrixWorld()
  }

  function groundShort(dist: number, fovDeg: number, aspect: number): number {
    const v = (fovDeg * Math.PI) / 180
    const h = 2 * Math.atan(Math.tan(v / 2) * Math.max(0.2, aspect))
    const horiz = 2 * dist * Math.tan(h / 2)
    const beta = v / 2
    const height = dist * Math.sin(pitch)
    const near = pitch - beta
    const far = pitch + beta
    const depth = near > 0.08 ? height / Math.tan(near) - height / Math.tan(far) : horiz
    return aspect < 1 ? horiz : depth
  }

  function fit(aspect: number) {
    portrait = aspect < 1
    const fov = portrait ? 42 : TUNING.camera.fov
    let dist = portrait ? 40 : TUNING.camera.distance
    for (let i = 0; i < 14 && groundShort(dist, fov, aspect) < TUNING.camera.shortSpan; i++) dist += 3
    camera.fov = fov
    placeRig(dist)
    camera.updateProjectionMatrix()
  }

  function snap(x: number, z: number) {
    focusX = x
    focusZ = z
    velX.v = 0
    velZ.v = 0
    place(0, 0)
  }
  snap(0, 0)

  return {
    camera,
    basis(out) {
      camera.getWorldDirection(_fwd)
      _fwd.y = 0
      if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1)
      else _fwd.normalize()
      _right.crossVectors(_fwd, UP)
      out.fx = _fwd.x
      out.fz = _fwd.z
      out.rx = _right.x
      out.rz = _right.z
    },
    update(x, z, dt, shakeX, shakeZ) {
      const aspect = camera.aspect || 1
      const wantPortrait = aspect < 1
      if (wantPortrait !== portrait) fit(aspect)
      focusX = smoothDamp(focusX, x, velX, TUNING.camera.smooth, dt)
      focusZ = smoothDamp(focusZ, z, velZ, TUNING.camera.smooth, dt)
      place(shakeX, shakeZ)
    },
    snap,
  }
}
