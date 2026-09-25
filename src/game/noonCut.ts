import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import { distPointSeg, forwardFromYaw, yawFromDirection } from '../core/math'
import type { Player } from './player'
import type { Horde, HordeCtx } from './enemies/horde'

export interface CutState {
  active: boolean
  time: number
  cooldown: number
  buffer: number
  dirX: number
  dirZ: number
  sx: number
  sz: number
  fade: number
  id: number
  hits: number
  refund: number
  boomed: boolean
  seen: Int32Array
}

export function createCut(): CutState {
  return {
    active: false,
    time: 0,
    cooldown: 0,
    buffer: 0,
    dirX: 0,
    dirZ: -1,
    sx: 0,
    sz: 0,
    fade: 0,
    id: 1,
    hits: 0,
    refund: 0,
    boomed: false,
    seen: new Int32Array(TUNING.hordeCap),
  }
}

export function resetCut(cut: CutState) {
  cut.active = false
  cut.time = 0
  cut.cooldown = 0
  cut.buffer = 0
  cut.fade = 0
  cut.hits = 0
  cut.refund = 0
  cut.boomed = false
  cut.id = 1
  cut.seen.fill(0)
}

export interface CutInput {
  pressed: boolean
  dirX: number | null
  dirZ: number | null
  wishX: number
  wishZ: number
  aimX: number | null
  aimZ: number | null
  mouseIdle: boolean
  usingTouch: boolean
}

export function updateCut(cut: CutState, player: Player, dt: number, input: CutInput, haste: number) {
  player.iframe = Math.max(0, player.iframe - dt)
  if (cut.buffer > 0) cut.buffer = Math.max(0, cut.buffer - dt)
  if (cut.cooldown > 0) cut.cooldown = Math.max(0, cut.cooldown - dt)
  if (input.pressed) cut.buffer = TUNING.inputBuffer
  if (!cut.active && cut.buffer > 0 && cut.cooldown <= 0) {
    let dx = 0
    let dz = 0
    if (input.dirX != null && input.dirZ != null) {
      dx = input.dirX
      dz = input.dirZ
    } else if (!input.usingTouch && !input.mouseIdle && input.aimX != null && input.aimZ != null) {
      dx = input.aimX - player.x
      dz = input.aimZ - player.z
    } else if (Math.hypot(input.wishX, input.wishZ) > 0.12) {
      dx = input.wishX
      dz = input.wishZ
    } else {
      forwardFromYaw(player.yaw, cutFace)
      dx = cutFace.x
      dz = cutFace.z
    }
    const len = Math.hypot(dx, dz) || 1
    cut.dirX = dx / len
    cut.dirZ = dz / len
    cut.sx = player.x
    cut.sz = player.z
    cut.active = true
    cut.time = 0
    cut.fade = TUNING.cut.ribbonFade
    cut.hits = 0
    cut.refund = 0
    cut.boomed = false
    cut.id++
    cut.buffer = 0
    const hasteMul = Math.max(0.2, 1 - TUNING.passive.haste * haste)
    cut.cooldown = TUNING.cut.cooldown * hasteMul
    player.iframe = TUNING.cut.iframes
  }
  if (!cut.active) {
    if (cut.fade > 0) cut.fade -= dt
    return
  }
  cut.time += dt
}

/** Hit test after the player has moved this step, so the segment includes the latest travel. */
export function sweepCut(
  cut: CutState,
  player: Player,
  horde: Horde,
  might: number,
  ctx: HordeCtx,
  onBig: () => void,
) {
  if (!cut.active) return
  const alive = horde.alive
  for (let i = 0; i < alive.length; i++) {
    if (!alive[i] || cut.seen[i] === cut.id) continue
    const d = distPointSeg(horde.x[i] ?? 0, horde.z[i] ?? 0, cut.sx, cut.sz, player.x, player.z)
    if (d > TUNING.cut.radius) continue
    const hit = horde.damage(i, TUNING.cut.damage, 'cut', might)
    if (hit === 0) continue
    cut.seen[i] = cut.id
    cut.hits++
    if (hit === 2) {
      horde.slay(i, ctx)
      if (cut.refund < TUNING.cut.refundMax) {
        const give = Math.min(TUNING.cut.refund, TUNING.cut.refundMax - cut.refund)
        cut.refund += give
        cut.cooldown = Math.max(0, cut.cooldown - give)
      }
    }
  }
  if (!cut.boomed && cut.hits >= TUNING.cut.bigHits) {
    cut.boomed = true
    onBig()
  }
}

const cutFace = { x: 0, z: -1 }

export function createRibbon(): Mesh {
  const pos = new Float32Array([-0.5, 0.07, 0, 0.5, 0.07, 0, 0.5, 0.07, -1, -0.5, 0.07, 0, 0.5, 0.07, -1, -0.5, 0.07, -1])
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  const mesh = new Mesh(
    geo,
    new MeshBasicMaterial({
      color: COLOR.gold,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }),
  )
  mesh.visible = false
  mesh.renderOrder = 4
  mesh.frustumCulled = false
  return mesh
}

export function syncRibbon(mesh: Mesh, cut: CutState, player: Player) {
  const show = cut.active || cut.fade > 0
  mesh.visible = show
  if (!show) return
  const ex = cut.active ? player.x : cut.sx + cut.dirX * TUNING.cut.distance
  const ez = cut.active ? player.z : cut.sz + cut.dirZ * TUNING.cut.distance
  const dx = ex - cut.sx
  const dz = ez - cut.sz
  const len = Math.max(0.2, Math.hypot(dx, dz))
  mesh.position.set(cut.sx, 0, cut.sz)
  mesh.rotation.y = yawFromDirection(cut.dirX, cut.dirZ)
  mesh.scale.set(TUNING.cut.radius * 2, 1, len)
  const mat = mesh.material as MeshBasicMaterial
  const k = cut.active ? 1 : Math.max(0, cut.fade / TUNING.cut.ribbonFade)
  mat.color.copy(COLOR.gold).lerp(COLOR.goldHot, cut.active ? Math.min(1, cut.time / TUNING.cut.duration) : 1).multiplyScalar(TUNING.look.emissiveGain)
  mat.opacity = 0.35 + 0.65 * k
}
