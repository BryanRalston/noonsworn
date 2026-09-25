export const TAU = Math.PI * 2

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothDamp(current: number, target: number, vel: { v: number }, smoothTime: number, dt: number): number {
  const st = Math.max(0.0001, smoothTime)
  const omega = 2 / st
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel.v + omega * change) * dt
  vel.v = (vel.v - omega * temp) * exp
  let output = target + (change + temp) * exp
  if ((target - current > 0) === (output > target)) {
    output = target
    vel.v = 0
  }
  return output
}

/** Yaw so a local −Z front points along (x, z). (0, −1) → 0. */
export function yawFromDirection(x: number, z: number): number {
  return Math.atan2(-x, -z)
}

export function forwardFromYaw(yaw: number, out: { x: number; z: number }): void {
  out.x = -Math.sin(yaw)
  out.z = -Math.cos(yaw)
}

export function distPointSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const ab2 = abx * abx + abz * abz
  let t = ab2 < 1e-8 ? 0 : (apx * abx + apz * abz) / ab2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + abx * t
  const cz = az + abz * t
  return Math.hypot(px - cx, pz - cz)
}

/** Same segment-vs-circle test the floor shader uses. */
export function segmentHitsCircle(
  sx: number,
  sz: number,
  px: number,
  pz: number,
  cx: number,
  cz: number,
  r: number,
): boolean {
  const dx = px - sx
  const dz = pz - sz
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-8) return (sx - cx) * (sx - cx) + (sz - cz) * (sz - cz) <= r * r
  let t = ((cx - sx) * dx + (cz - sz) * dz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const qx = sx + dx * t
  const qz = sz + dz * t
  const ex = qx - cx
  const ez = qz - cz
  return ex * ex + ez * ez <= r * r
}
