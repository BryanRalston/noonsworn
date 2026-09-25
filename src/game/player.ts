import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import { yawFromDirection } from '../core/math'
import { resolveCircle } from './collision'

export interface Player {
  x: number
  z: number
  px: number
  pz: number
  vx: number
  vz: number
  yaw: number
  prevYaw: number
  hp: number
  maxHp: number
  invuln: number
  iframe: number
  radius: number
}

export function createPlayer(): Player {
  return {
    x: 0,
    z: 0,
    px: 0,
    pz: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    prevYaw: 0,
    hp: TUNING.player.maxHp,
    maxHp: TUNING.player.maxHp,
    invuln: 0,
    iframe: 0,
    radius: TUNING.player.radius,
  }
}

export function resetPlayer(p: Player) {
  p.x = 0
  p.z = 0
  p.px = 0
  p.pz = 0
  p.vx = 0
  p.vz = 0
  p.yaw = 0
  p.prevYaw = 0
  p.hp = TUNING.player.maxHp
  p.maxHp = TUNING.player.maxHp
  p.invuln = 0
  p.iframe = 0
}

export function integratePlayer(
  p: Player,
  dt: number,
  wishX: number,
  wishZ: number,
  speed: number,
  cutting: boolean,
  cutX: number,
  cutZ: number,
  cutTime = 0,
) {
  p.px = p.x
  p.pz = p.z
  p.prevYaw = p.yaw
  p.invuln = Math.max(0, p.invuln - dt)
  let moveDt = dt
  if (cutting) {
    const spd = TUNING.cut.distance / TUNING.cut.duration
    const over = Math.max(0, cutTime - TUNING.cut.duration)
    moveDt = Math.max(0, dt - over)
    p.vx = cutX * spd
    p.vz = cutZ * spd
    p.yaw = yawFromDirection(cutX, cutZ)
  } else {
    const mag = Math.hypot(wishX, wishZ)
    const tx = mag > 1e-5 ? (wishX / mag) * speed * Math.min(1, mag) : 0
    const tz = mag > 1e-5 ? (wishZ / mag) * speed * Math.min(1, mag) : 0
    const faster = tx * tx + tz * tz >= p.vx * p.vx + p.vz * p.vz && mag > 0.05
    const rate = faster ? TUNING.player.accel : TUNING.player.decel
    const dx = tx - p.vx
    const dz = tz - p.vz
    const dl = Math.hypot(dx, dz)
    const maxDelta = rate * dt
    if (dl <= maxDelta || dl < 1e-8) {
      p.vx = tx
      p.vz = tz
    } else {
      p.vx += (dx / dl) * maxDelta
      p.vz += (dz / dl) * maxDelta
    }
    if (mag > 0.12) p.yaw = yawFromDirection(wishX, wishZ)
  }
  p.x += p.vx * moveDt
  p.z += p.vz * moveDt
  const slid = resolveCircle(p.x, p.z, p.radius)
  p.x = slid.x
  p.z = slid.z
}

export function hurtPlayer(p: Player, amount: number): boolean {
  if (p.hp <= 0 || p.iframe > 0 || p.invuln > 0) return false
  p.hp = Math.max(0, p.hp - amount)
  p.invuln = TUNING.player.invuln
  return true
}

export function createPlayerView(): Group {
  const radius = TUNING.player.radius
  const length = TUNING.player.height - radius * 2
  const body = new Mesh(new CapsuleGeometry(radius, length, 2, 8), new MeshLambertMaterial({ color: COLOR.linen }))
  body.position.y = TUNING.player.height / 2
  body.castShadow = false
  const halo = new Mesh(
    new CylinderGeometry(TUNING.player.haloDisc, TUNING.player.haloDisc, 0.08, 16),
    new MeshLambertMaterial({ color: COLOR.gold }),
  )
  halo.position.set(0, 1.35, 0.18)
  const blade = new Mesh(new BoxGeometry(0.08, 0.08, 1.15), new MeshLambertMaterial({ color: COLOR.bronze }))
  blade.position.set(0.22, 0.9, -0.7)
  const root = new Group()
  root.add(body, halo, blade)
  return root
}
