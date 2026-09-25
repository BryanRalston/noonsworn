import { PerspectiveCamera, Vector3 } from 'three'
import { TUNING } from '../data/tuning'
import { clamp, smoothDamp } from '../core/math'

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

  function snap(x: number, z: number) {
    focusX = clamp(x, -TUNING.camera.clamp, TUNING.camera.clamp)
    focusZ = clamp(z, -TUNING.camera.clamp, TUNING.camera.clamp)
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
      const wantPortrait = camera.aspect < 1
      if (wantPortrait !== portrait) {
        portrait = wantPortrait
        placeRig(portrait ? TUNING.camera.distancePortrait : TUNING.camera.distance)
        camera.fov = portrait ? TUNING.camera.fovPortrait : TUNING.camera.fov
        camera.updateProjectionMatrix()
      }
      const dx = clamp(x, -TUNING.camera.clamp, TUNING.camera.clamp)
      const dz = clamp(z, -TUNING.camera.clamp, TUNING.camera.clamp)
      focusX = smoothDamp(focusX, dx, velX, TUNING.camera.smooth, dt)
      focusZ = smoothDamp(focusZ, dz, velZ, TUNING.camera.smooth, dt)
      place(shakeX, shakeZ)
    },
    snap,
  }
}
