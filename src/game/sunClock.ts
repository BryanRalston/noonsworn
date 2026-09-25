import { TUNING } from '../data/tuning'
import { segmentHitsCircle } from '../core/math'
import type { Rng } from '../core/rng'
import { PILLARS } from './collision'
import type { FloorUniforms } from '../render/floorShader'

export interface SunClock {
  time: number
  theta0: number
  dir: number
  angle: number
  x: number
  z: number
  dirX: number
  dirZ: number
  cosBeta: number
  beta: number
  frozen: boolean
  timeScale: number
  reset: (rng: Rng) => void
  setWide: (stacks: number) => void
  advance: (dt: number) => void
  isLit: (x: number, z: number) => boolean
  pushUniforms: (uniforms: FloorUniforms, fog: boolean) => void
}

export function createSunClock(): SunClock {
  const sun: SunClock = {
    time: 0,
    theta0: 0,
    dir: 1,
    angle: 0,
    x: TUNING.sunRadius,
    z: 0,
    dirX: -1,
    dirZ: 0,
    cosBeta: Math.cos((TUNING.beamDeg * Math.PI) / 180),
    beta: (TUNING.beamDeg * Math.PI) / 180,
    frozen: false,
    timeScale: 1,
    reset(rng) {
      sun.theta0 = rng() * Math.PI * 2
      sun.dir = rng() < 0.5 ? -1 : 1
      sun.time = 0
      sun.frozen = false
      place()
    },
    setWide(stacks) {
      const deg = TUNING.beamDeg + TUNING.wideDeg * Math.max(0, Math.min(TUNING.wideMax, stacks))
      sun.beta = (deg * Math.PI) / 180
      sun.cosBeta = Math.cos(sun.beta)
    },
    advance(dt) {
      if (sun.frozen) return
      sun.time += dt * sun.timeScale
      place()
    },
    isLit(x, z) {
      const dx = x - sun.x
      const dz = z - sun.z
      const len = Math.hypot(dx, dz)
      if (len < 1e-4) return false
      const dot = (dx / len) * sun.dirX + (dz / len) * sun.dirZ
      if (dot < sun.cosBeta) return false
      for (let i = 0; i < PILLARS.length; i++) {
        const p = PILLARS[i]
        if (p && segmentHitsCircle(sun.x, sun.z, x, z, p.x, p.z, p.r)) return false
      }
      return true
    },
    pushUniforms(uniforms, fog) {
      uniforms.uSun.value.set(sun.x, sun.z)
      uniforms.uDir.value.set(sun.dirX, sun.dirZ)
      uniforms.uCosBeta.value = sun.cosBeta
      uniforms.uFog.value = fog ? 1 : 0
    },
  }

  function place() {
    const theta = sun.theta0 + sun.dir * Math.PI * 2 * (sun.time / TUNING.daySeconds)
    sun.angle = theta
    sun.x = Math.cos(theta) * TUNING.sunRadius
    sun.z = Math.sin(theta) * TUNING.sunRadius
    const len = Math.hypot(sun.x, sun.z) || 1
    sun.dirX = -sun.x / len
    sun.dirZ = -sun.z / len
  }

  place()
  return sun
}

/** Multiplier shared by weapons and the Noon Cut. */
export function damageAmount(base: number, lit: boolean, source: 'weapon' | 'cut', might: number): number {
  let m = 1 + TUNING.passive.might * might
  if (lit) m *= TUNING.exposedDamage
  else if (source === 'weapon') m *= TUNING.armoredWeapon
  else m *= TUNING.armoredCut
  return base * m
}
