export interface ShadowDir {
  dirX: number
  dirZ: number
  length: number
}

/** Sundial shade falls away from the sun. Lattice and Cloister use the sun's own azimuth. */
export function clockShadow(dirX: number, dirZ: number, away: boolean, out: ShadowDir): ShadowDir {
  const len = Math.hypot(dirX, dirZ) || 1
  const sign = away ? 1 : -1
  out.dirX = (sign * dirX) / len
  out.dirZ = (sign * dirZ) / len
  out.length = 5
  return out
}

/** Stair shade follows the westering azimuth. Length is clamp(4 L, 5, 10). */
export function stairShadow(azimuthDeg: number, shadeL: number, out: ShadowDir): ShadowDir {
  const phi = ((azimuthDeg - 270) * Math.PI) / 180
  out.dirX = Math.cos(phi)
  out.dirZ = Math.sin(phi)
  out.length = Math.max(5, Math.min(10, 4 * shadeL))
  return out
}
