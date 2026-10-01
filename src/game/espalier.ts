import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { yawFromDirection } from '../core/math'
import { COLOR } from '../data/palette'
import { TUNING, type DamageSource } from '../data/tuning'
import { slideCircle } from './collision'

const LANES = [-12, -6, 0, 6, 12]
const SEEN = 64

export interface EspalierHooks {
  lit: (x: number, z: number) => boolean
  hurt: (amount: number) => void
  spawn: (x: number, z: number) => void
  cull: () => void
  cover: (inset: number) => void
  floor: (z: number) => number
  wake: () => void
  rake: () => void
  slam: () => void
}

export interface EspalierInfo {
  hp: number
  max: number
  phase: 0 | 1 | 2 | 3
  x: number
  z: number
  r: number
  exposed: boolean
  tele: boolean
  lane: number
  dead: boolean
}

export interface Espalier {
  mesh: Mesh
  tele: Mesh
  update: (dt: number, time: number, px: number, pz: number, upperOpen: boolean) => void
  hit: (x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean
  alive: () => boolean
  awake: () => boolean
  info: () => EspalierInfo
  reset: () => void
}

function part(w: number, h: number, d: number, x: number, y: number, z: number, color: { r: number; g: number; b: number }, crack: number): BufferGeometry {
  const geo = new BoxGeometry(w, h, d)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const cracks = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    cracks[i] = crack
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setAttribute('aCrack', new BufferAttribute(cracks, 1))
  geo.translate(x, y, z)
  return geo
}

function bodyGeo(): BufferGeometry {
  const ink = COLOR.umbral
  const rim = COLOR.umbralRim
  const deep = COLOR.shadeDeep
  const parts = [
    part(0.7, 6.4, 0.55, 0, 3.5, -1.3, ink, 0),
    part(6.4, 0.28, 0.36, 0, 5.6, -1.5, rim, 0),
    part(5.2, 0.24, 0.32, 0, 4.4, -1.2, ink, 0),
    part(4.2, 0.22, 0.3, 0, 3.2, -0.9, ink, 0),
    part(3.2, 0.2, 0.28, 0, 2.1, -0.6, deep, 0),
    part(1.4, 0.7, 0.4, -2.4, 5.5, -1.6, rim, 0),
    part(1.4, 0.7, 0.4, 2.4, 5.5, -1.6, rim, 0),
    part(0.9, 1.1, 0.3, -1.6, 4.2, -1.1, deep, 0),
    part(0.9, 1.1, 0.3, 1.6, 4.2, -1.1, deep, 0),
    part(0.35, 1.6, 0.16, 0, 3.4, -0.85, ink, 1),
    part(1.8, 0.16, 0.14, 0, 4.6, -1.05, ink, 1),
    part(0.16, 1.2, 0.14, -2.2, 3.3, -0.7, ink, 1),
  ]
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('espalier merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

export function createEspalier(hooks: EspalierHooks): Espalier {
  const uExposed = { value: 0 }
  const mesh = new Mesh(
    bodyGeo(),
    new ShaderMaterial({
      uniforms: { uExposed },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aCrack;
        varying vec3 vColor;
        varying float vCrack;
        void main() {
          vColor = color;
          vCrack = aCrack;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vCrack;
        uniform float uExposed;
        void main() {
          vec3 col = vColor;
          if (uExposed > 0.5 && vCrack > 0.5) col = vec3(0.95, 0.78, 0.32);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  )
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.visible = false
  const tele = new Mesh(
    new BoxGeometry(1, 0.06, 1),
    new ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        void main() {
          gl_FragColor = vec4(1.0, 0.24, 0.55, 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
  )
  tele.frustumCulled = false
  tele.visible = false
  tele.renderOrder = 3

  const spec = TUNING.espalier
  let hp: number = spec.hp
  let woken = false
  let dead = false
  let x = 0
  let z = -24
  let phase: 0 | 1 | 2 | 3 = 0
  let upper = false
  let exposed = false
  let playerZ = 0
  let attack = 1.2
  let telegraph = 0
  let lane = 0
  let slamming = false
  let addAt = 0
  const seen: number[] = []
  const seenAt: number[] = []
  let areaAt = -10
  let clock = 0

  function enraged(time: number): boolean {
    return time >= spec.enrage
  }

  function place() {
    mesh.position.set(x, hooks.floor(z), z)
    mesh.visible = woken && !dead
    uExposed.value = exposed ? 1 : 0
    const show = telegraph > 0 && woken && !dead
    tele.visible = show
    if (!show) return
    const y = hooks.floor(slamming ? z : -16) + 0.1
    if (slamming) {
      tele.position.set(x, y, z)
      tele.scale.set(spec.slamRange * 2, 1, spec.slamRange * 2)
      tele.rotation.y = 0
    } else {
      const laneX = LANES[lane] ?? 0
      tele.position.set(laneX, y, -15.5)
      tele.scale.set(spec.rakeWidth, 1, 15)
      tele.rotation.y = 0
    }
  }

  function setPhase(next: 1 | 2 | 3) {
    if (next === phase) return
    phase = next
    if (next === 1) hooks.cover(0)
    else if (next === 2) hooks.cover(spec.insetPrune)
    else hooks.cover(spec.insetOpen)
  }

  function phaseNow(): 1 | 2 | 3 {
    const ratio = hp / spec.hp
    if (ratio > 0.6) return 1
    if (ratio > 0.25) return 2
    return 3
  }

  return {
    mesh,
    tele,
    alive: () => woken && !dead,
    awake: () => woken,
    reset() {
      hp = spec.hp
      woken = false
      dead = false
      x = 0
      z = -24
      phase = 0
      upper = false
      exposed = false
      telegraph = 0
      slamming = false
      attack = 1.2
      addAt = 0
      lane = 0
      seen.length = 0
      seenAt.length = 0
      areaAt = -10
      hooks.cover(0)
      mesh.visible = false
      tele.visible = false
    },
    info: () => ({
      hp,
      max: spec.hp,
      phase,
      x,
      z,
      r: spec.body,
      exposed,
      tele: telegraph > 0,
      lane: slamming ? -1 : (LANES[lane] ?? 0),
      dead,
    }),
    update(dt, time, px, pz, upperOpen) {
      upper = upperOpen
      playerZ = pz
      clock = time
      if (dead) {
        place()
        return
      }
      if (!woken) {
        if (time < spec.wake) return
        woken = true
        hp = spec.hp
        setPhase(1)
        hooks.cull()
        hooks.wake()
        addAt = time
      }
      const next = phaseNow()
      if (phase !== 0 && next !== phase) {
        if (next === 3) {
          telegraph = 0
          slamming = false
        }
        setPhase(next)
      }
      const fast = enraged(time) ? 1.5 : 1
      exposed = upper || hooks.lit(x, z)
      if (phase === 3) {
        const dx = px - x
        const dz = pz - z
        const dist = Math.hypot(dx, dz) || 1
        const step = spec.speed * fast * dt
        const ox = x
        const oz = z
        x = ox + (dx / dist) * step
        z = oz + (dz / dist) * step
        const slid = slideCircle(ox, oz, x, z, 0.8)
        x = slid.x
        z = slid.z
        mesh.rotation.y = yawFromDirection(dx, dz)
      } else {
        mesh.rotation.y = 0
      }
      if (phase === 2 && time - addAt >= 8 / fast) {
        addAt = time
        hooks.spawn(x - 6, -6)
        hooks.spawn(x + 6, -6)
      }
      attack -= dt
      if (telegraph > 0) {
        telegraph -= dt
        if (telegraph <= 0) {
          if (slamming) {
            const dx = px - x
            const dz = pz - z
            if (dx * dx + dz * dz <= spec.slamRange * spec.slamRange) hooks.hurt(spec.slam)
            slamming = false
          } else {
            const laneX = LANES[lane] ?? 0
            const half = spec.rakeWidth * 0.5
            if (Math.abs(px - laneX) <= half && pz <= -8 && pz >= -23) hooks.hurt(spec.rake)
            lane = (lane + 1) % LANES.length
          }
          attack = (phase === 3 ? 3.2 : spec.rakeEvery) / fast
        }
      } else if (attack <= 0) {
        telegraph = phase === 3 ? spec.slamTele : spec.rakeTele
        slamming = phase === 3
        if (slamming) hooks.slam()
        else hooks.rake()
      }
      place()
    },
    hit(hx, hz, radius, base, source, might, stamp) {
      void source
      if (!woken || dead) return false
      const dx = hx - x
      const dz = hz - z
      const reach = radius + spec.body
      if (dx * dx + dz * dz > reach * reach) return false
      if (phase < 3 && playerZ > -8) return false
      const now = clock
      if (stamp === 0) {
        if (now - areaAt < 0.35) return false
        areaAt = now
      } else if (stamp >= 10 && stamp < 20) {
        const prev = seenAt[stamp] ?? -10
        if (now - prev < TUNING.halo.hitEvery) return false
        seenAt[stamp] = now
      } else if (seen.includes(stamp)) {
        return false
      } else {
        if (seen.length >= SEEN) {
          seen.shift()
        }
        seen.push(stamp)
      }
      const light = exposed ? TUNING.exposedDamage : 0.35
      const amount = base * (1 + TUNING.passive.might * might) * light
      hp -= amount
      if (hp <= 0) {
        hp = 0
        dead = true
        telegraph = 0
        tele.visible = false
      }
      return true
    },
  }
}
